// ScreenedPool contract tests on a local chain (Hardhat node, chainId 11155111). Run: npm test
// Deploys the real pool, Poseidon hasher and Groth16 verifier against mock USDC and escrow, and
// checks every rule: gasless deposits bound to their commitment, screener-only approval, refunds,
// reclaim after the delay, withdraw into escrow, double spend, unknown roots, bound recipients, fee cap.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import solc from "solc";
import { poseidonContract } from "circomlibjs";
import { createPublicClient, createWalletClient, http, parseUnits, encodeAbiParameters, keccak256, parseSignature, defineChain } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { newNote, Tree, prove, shutdown } from "../src/pool.js";

const PORT = 8547;
const chain = defineChain({ id: 11155111, name: "local", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [`http://127.0.0.1:${PORT}`] } } });
const transport = http(`http://127.0.0.1:${PORT}`);
const pub = createPublicClient({ chain, transport });
const acct = (i) => mnemonicToAccount("test test test test test test test test test test test junk", { addressIndex: i });
const [screener, desk, outsider, relayer, payer] = [0, 1, 2, 3, 4].map(acct);
const wallet = (a) => createWalletClient({ account: a, chain, transport });
const DENOM = parseUnits("1", 6);

let node, C = {};

async function send(account, address, abi, functionName, args) {
  const hash = await wallet(account).writeContract({ address, abi, functionName, args });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${functionName} reverted`);
  return r;
}
async function reverts(account, address, abi, functionName, args, pattern) {
  await assert.rejects(pub.simulateContract({ account, address, abi, functionName, args }), (e) => pattern.test(e.shortMessage + " " + (e.cause?.data?.errorName || "") + " " + e.message));
}
async function deploy(abi, bytecode, args = []) {
  const hash = await wallet(screener).deployContract({ abi, bytecode: bytecode.startsWith("0x") ? bytecode : `0x${bytecode}`, args });
  return (await pub.waitForTransactionReceipt({ hash })).contractAddress;
}

function compile() {
  const sources = Object.fromEntries([["ScreenedPool.sol", "contracts/ScreenedPool.sol"], ["Verifier.sol", "contracts/Verifier.sol"], ["Mocks.sol", "test/contracts/Mocks.sol"]].map(([k, f]) => [k, { content: fs.readFileSync(f, "utf8") }]));
  const out = JSON.parse(solc.compile(JSON.stringify({ language: "Solidity", sources, settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun", outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } } })));
  const errs = (out.errors || []).filter((e) => e.severity === "error");
  if (errs.length) throw new Error(errs.map((e) => e.formattedMessage).join("\n"));
  return out.contracts;
}

// Expiry comes from chain time: the reclaim test moves the chain clock forward a day.
async function signDeposit(from, note) {
  const validBefore = (await pub.getBlock()).timestamp + 3600n;
  const nonce = keccak256(encodeAbiParameters([{ type: "uint256" }], [note.commitment]));
  const sig = await from.signTypedData({
    domain: { name: "USD Coin", version: "2", chainId: 11155111, verifyingContract: C.usdc },
    types: { ReceiveWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
    primaryType: "ReceiveWithAuthorization",
    message: { from: from.address, to: C.pool, value: DENOM, validAfter: 0n, validBefore, nonce },
  });
  const { r, s, v } = parseSignature(sig);
  return [from.address, 0n, validBefore, Number(v), r, s];
}

before(async () => {
  node = spawn(process.execPath, ["node_modules/hardhat/internal/cli/cli.js", "node", "--config", "hardhat.config.cjs", "--port", String(PORT)], { stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("hardhat node did not start")), 60_000);
    node.stdout.on("data", (d) => { if (/Started HTTP/.test(d)) { clearTimeout(t); res(); } });
  });
  const out = compile();
  C.poolAbi = out["ScreenedPool.sol"].ScreenedPool.abi;
  C.usdcAbi = out["Mocks.sol"].MockUSDC.abi;
  C.escrowAbi = out["Mocks.sol"].MockEscrow.abi;
  C.usdc = await deploy(C.usdcAbi, out["Mocks.sol"].MockUSDC.evm.bytecode.object);
  C.escrow = await deploy(C.escrowAbi, out["Mocks.sol"].MockEscrow.evm.bytecode.object, [C.usdc]);
  const hasher = await deploy(poseidonContract.generateABI(2), poseidonContract.createCode(2));
  const verifier = await deploy(out["Verifier.sol"].Groth16Verifier.abi, out["Verifier.sol"].Groth16Verifier.evm.bytecode.object);
  C.pool = await deploy(C.poolAbi, out["ScreenedPool.sol"].ScreenedPool.evm.bytecode.object, [C.usdc, C.escrow, hasher, verifier, DENOM, screener.address]);
  for (const a of [desk, outsider]) await send(screener, C.usdc, C.usdcAbi, "mint", [a.address, parseUnits("10", 6)]);
});

after(async () => { node?.kill(); await shutdown(); });

const bal = (a) => pub.readContract({ address: C.usdc, abi: C.usdcAbi, functionName: "balanceOf", args: [a] });
const P = (fn, args) => pub.readContract({ address: C.pool, abi: C.poolAbi, functionName: fn, args });
const notes = {};

test("a gasless deposit lands as pending under the signer's name", async () => {
  notes.a = await newNote();
  await send(relayer, C.pool, C.poolAbi, "depositWithAuthorization", [notes.a.commitment, ...(await signDeposit(desk, notes.a))]);
  assert.equal((await P("pendingDepositor", [notes.a.commitment])).toLowerCase(), desk.address.toLowerCase());
  assert.equal(await bal(desk.address), parseUnits("9", 6));
});

test("a copied signature cannot fund a different commitment", async () => {
  const n = await newNote(), other = await newNote();
  const args = await signDeposit(desk, n);
  await reverts(relayer, C.pool, C.poolAbi, "depositWithAuthorization", [other.commitment, ...args], /invalid signature|revert/i);
});

test("only the screener can approve", async () => {
  await reverts(outsider, C.pool, C.poolAbi, "approve", [notes.a.commitment, "0x" + "11".repeat(32)], /NotScreener|revert/i);
  await send(screener, C.pool, C.poolAbi, "approve", [notes.a.commitment, "0x" + "11".repeat(32)]);
  assert.equal(await P("approved", [notes.a.commitment]), true);
});

test("a rejected deposit is refunded and never enters the set", async () => {
  const n = await newNote();
  await send(relayer, C.pool, C.poolAbi, "depositWithAuthorization", [n.commitment, ...(await signDeposit(outsider, n))]);
  const before = await bal(outsider.address);
  await send(screener, C.pool, C.poolAbi, "reject", [n.commitment, "0x" + "22".repeat(32)]);
  assert.equal(await bal(outsider.address), before + DENOM);
  assert.equal(await P("approved", [n.commitment]), false);
});

test("an unscreened deposit can be reclaimed by its depositor only after the delay", async () => {
  const n = await newNote();
  await send(relayer, C.pool, C.poolAbi, "depositWithAuthorization", [n.commitment, ...(await signDeposit(outsider, n))]);
  await reverts(outsider, C.pool, C.poolAbi, "reclaim", [n.commitment], /TooEarly|revert/i);
  await pub.request({ method: "evm_increaseTime", params: [86_401] });
  await pub.request({ method: "evm_mine", params: [] });
  await reverts(desk, C.pool, C.poolAbi, "reclaim", [n.commitment], /NotDepositor|revert/i);
  const before = await bal(outsider.address);
  await send(outsider, C.pool, C.poolAbi, "reclaim", [n.commitment]);
  assert.equal(await bal(outsider.address), before + DENOM);
  await reverts(screener, C.pool, C.poolAbi, "approve", [n.commitment, "0x" + "33".repeat(32)], /NotPending|revert/i);
});

test("withdraw: a valid proof funds the payer's escrow; reuse, bad roots, swapped recipients and high fees fail", async () => {
  notes.b = await newNote();
  await send(relayer, C.pool, C.poolAbi, "depositWithAuthorization", [notes.b.commitment, ...(await signDeposit(desk, notes.b))]);
  await send(screener, C.pool, C.poolAbi, "approve", [notes.b.commitment, "0x" + "44".repeat(32)]);
  const tree = await Tree.create([notes.a.commitment, notes.b.commitment]);
  assert.equal(await P("latestRoot", []), tree.root, "local tree matches the contract");

  const p = await prove(notes.b, tree, 1, { recipient: payer.address, relayer: relayer.address, fee: 0n });
  const args = [p.a, p.b, p.c, p.root, notes.b.nullifierHash, payer.address, relayer.address, 0n];

  await reverts(relayer, C.pool, C.poolAbi, "withdraw", [p.a, p.b, p.c, p.root, notes.b.nullifierHash, outsider.address, relayer.address, 0n], /BadProof|revert/i);
  await reverts(relayer, C.pool, C.poolAbi, "withdraw", [p.a, p.b, p.c, 12345n, notes.b.nullifierHash, payer.address, relayer.address, 0n], /UnknownRoot|revert/i);
  await reverts(relayer, C.pool, C.poolAbi, "withdraw", [p.a, p.b, p.c, p.root, notes.b.nullifierHash, payer.address, relayer.address, DENOM + 1n], /FeeTooHigh|revert/i);

  await send(relayer, C.pool, C.poolAbi, "withdraw", args);
  const escrowBal = await pub.readContract({ address: C.escrow, abi: C.escrowAbi, functionName: "effectiveBalance", args: [payer.address] });
  assert.equal(escrowBal, DENOM);
  await reverts(relayer, C.pool, C.poolAbi, "withdraw", args, /AlreadySpent|revert/i);
});
