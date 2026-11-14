// End to end on Sepolia: screened deposits -> approved set -> ZK withdraw into a one-time payer's
// Telegraph escrow. Usage: node scripts/pool-e2e.mjs [depositors=4]
//
// Roles: the operator (repo wallet) screens deposits and relays transactions. N fresh depositor
// wallets each receive 1 test USDC the same way and deposit by signature only (no ETH). One of
// them, picked at random, is "the desk". On chain the one-time payer is funded by the pool, and
// the desk's deposit is one of N approved deposits that look alike.
import fs from "node:fs";
import path from "node:path";
import { formatUnits, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { USDC, DIAMOND, KEYS, usdcAbi, escrowAbi, publicClient, walletClient, loadAccount } from "./config.mjs";
import { newNote, saveNote, depositGasless, approvedLeaves, Tree, prove, verifyLocally, withdraw, poolAbi, shutdown } from "../src/pool.js";
import { screenPending } from "../src/screener.js";

const N = Number(process.argv[2] || 4);
const P = JSON.parse(fs.readFileSync("data/pool.json", "utf8"));
const operator = loadAccount();
const op = walletClient(operator);
const log = [];
const say = (s) => { console.log(s); log.push(s); };

// 1. Depositors: fresh wallets, 1 test USDC each, minted by the operator (same for every one).
const denom = await publicClient.readContract({ address: P.pool, abi: poolAbi, functionName: "denomination" });
const depositors = [];
for (let i = 0; i < N; i++) {
  const key = generatePrivateKey();
  const account = privateKeyToAccount(key);
  const h = await op.writeContract({ address: USDC, abi: usdcAbi, functionName: "mint", args: [account.address, denom] });
  await publicClient.waitForTransactionReceipt({ hash: h });
  depositors.push({ key, account, mintTx: h });
}
const deskIndex = Math.floor(Math.random() * N);
// The desk index is never printed or saved outside the keys folder: that is the secret.
say(`minted ${formatUnits(denom, 6)} USDC to ${N} fresh depositors; one of them is the desk`);

// 2. Each depositor signs; the operator relays. Notes are saved (the desk's matters; the others are seed).
fs.mkdirSync(path.join(KEYS, "depositors"), { recursive: true });
for (const [i, d] of depositors.entries()) {
  d.note = await newNote();
  d.depositTx = await depositGasless(d.account, operator, P.pool, d.note);
  fs.writeFileSync(path.join(KEYS, "depositors", `${d.account.address}.json`), JSON.stringify({ address: d.account.address, key: d.key, pool: P.pool, desk: i === deskIndex, depositTx: d.depositTx }, null, 2));
  saveNote(P.pool, d.note, { depositor: d.account.address, depositTx: d.depositTx, desk: i === deskIndex });
  say(`deposit  #${i} ${d.account.address}  tx ${d.depositTx}`);
}

// 3. Screening: every depositor wallet through Telegraph sanctions; approve on a clear answer.
const screened = await screenPending(operator, P.pool, P.deployBlock, say);
const approvedCount = screened.filter((s) => s.verdict === "approve").length;

// 4. Desk withdraws: rebuild the approved tree from events, prove membership, relay into a fresh payer.
const desk = depositors[deskIndex];
const leaves = await approvedLeaves(P.pool, P.deployBlock);
const tree = await Tree.create(leaves.map((l) => l.commitment));
const leafIndex = leaves.findIndex((l) => l.commitment === desk.note.commitment);
if (leafIndex < 0) throw new Error("desk deposit is not in the approved set");
const onchainRoot = await publicClient.readContract({ address: P.pool, abi: poolAbi, functionName: "latestRoot" });
if (onchainRoot !== tree.root) throw new Error(`root mismatch: chain ${onchainRoot} vs local ${tree.root}`);
say(`approved set: ${leaves.length} deposits, root matches the chain`);

const payerKey = generatePrivateKey();
const payer = privateKeyToAccount(payerKey);
const t0 = Date.now();
const p = await prove(desk.note, tree, leafIndex, { recipient: payer.address, relayer: operator.address, fee: 0n });
say(`proof made in ${((Date.now() - t0) / 1000).toFixed(1)} s, verifies locally: ${await verifyLocally(p.proof, p.publicSignals)}`);
const withdrawTx = await withdraw(operator, P.pool, p, { nullifierHash: desk.note.nullifierHash, recipient: payer.address });
// Read at the withdraw block: load-balanced RPCs can lag latest and show 0.
const { blockNumber: wBlock } = await publicClient.getTransactionReceipt({ hash: withdrawTx });
const escrow = await publicClient.readContract({ address: DIAMOND, abi: escrowAbi, functionName: "effectiveBalance", args: [payer.address], blockNumber: wBlock });
say(`withdraw tx ${withdrawTx}: one-time payer ${payer.address} escrow = ${formatUnits(escrow, 6)} USDC`);
fs.writeFileSync(path.join(KEYS, `${payer.address}.json`), JSON.stringify({ address: payer.address, key: payerKey, funder: P.pool, fundingTx: withdrawTx, amountUsd: Number(formatUnits(denom, 6)), label: "pool withdraw (e2e)", createdAt: new Date().toISOString() }, null, 2));

// 5. Double spend must fail.
let doubleSpend = "accepted (BUG)";
try {
  await publicClient.simulateContract({ account: operator, address: P.pool, abi: poolAbi, functionName: "withdraw", args: [p.a, p.b, p.c, p.root, desk.note.nullifierHash, payer.address, operator.address, 0n] });
} catch (e) {
  doubleSpend = `rejected (${(e.shortMessage || e.message).split("\n")[0].slice(0, 80)})`;
}
say(`second withdraw with the same note: ${doubleSpend}`);

// 6. Gas per step, from the receipts.
const gas = async (h) => (await publicClient.getTransactionReceipt({ hash: h })).gasUsed;
const g = { deposit: await gas(desk.depositTx), approve: await gas(screened.find((s) => s.verdict === "approve").tx), withdraw: await gas(withdrawTx) };
say(`gas: deposit ${g.deposit}, approve ${g.approve}, withdraw ${g.withdraw}`);

const record = {
  pool: P.pool, ranAt: new Date().toISOString(), depositors: N, approved: approvedCount, anonymitySet: leaves.length,
  deposits: depositors.map((d) => ({ address: d.account.address, depositTx: d.depositTx })),
  screening: screened.map(({ depositor, verdict, matched, score, signal, tx }) => ({ depositor, verdict, matched, score, signal, tx })),
  withdraw: { tx: withdrawTx, payer: payer.address, escrowUsd: Number(formatUnits(escrow, 6)), relayer: operator.address },
  doubleSpend, gas: Object.fromEntries(Object.entries(g).map(([k, v]) => [k, Number(v)])), log,
};
fs.writeFileSync("data/pool-e2e.json", JSON.stringify(record, null, 2));
console.log("wrote data/pool-e2e.json (the desk's index is not in it)");
await shutdown();
