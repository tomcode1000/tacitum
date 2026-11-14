// Compiles and deploys the screened pool on Sepolia: Poseidon hasher, Groth16 verifier, pool.
// Usage: node scripts/pool-deploy.mjs [denominationUsd=1]
// The deployer becomes the screener. Writes data/pool.json (addresses, block, tx hashes).
import fs from "node:fs";
import solc from "solc";
import { poseidonContract } from "circomlibjs";
import { parseUnits } from "viem";
import { USDC, DIAMOND, publicClient, walletClient, loadAccount } from "./config.mjs";

const denomUsd = process.argv[2] || "1";
const account = loadAccount();
const wallet = walletClient(account);

function compile() {
  const sources = {};
  for (const f of ["ScreenedPool.sol", "Verifier.sol"]) sources[f] = { content: fs.readFileSync(`contracts/${f}`, "utf8") };
  const input = { language: "Solidity", sources, settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun", outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } } };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors || []).filter((e) => e.severity === "error");
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join("\n"));
  for (const w of (out.errors || []).filter((e) => e.severity !== "error")) console.warn(w.formattedMessage.split("\n")[0]);
  return { pool: out.contracts["ScreenedPool.sol"].ScreenedPool, verifier: out.contracts["Verifier.sol"].Groth16Verifier };
}

async function deploy(label, abi, bytecode, args = []) {
  const hash = await wallet.deployContract({ abi, bytecode: bytecode.startsWith("0x") ? bytecode : `0x${bytecode}`, args });
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success" || !r.contractAddress) throw new Error(`${label} deploy failed: ${hash}`);
  console.log(`${label.padEnd(9)} ${r.contractAddress}  gas ${r.gasUsed}  tx ${hash}`);
  return { address: r.contractAddress, tx: hash, block: Number(r.blockNumber) };
}

const c = compile();
if (process.argv.includes("--compile-only")) {
  console.log("compiled: pool", c.pool.evm.bytecode.object.length / 2, "bytes, verifier", c.verifier.evm.bytecode.object.length / 2, "bytes");
  process.exit(0);
}

const hasher = await deploy("poseidon", poseidonContract.generateABI(2), poseidonContract.createCode(2));
const verifier = await deploy("verifier", c.verifier.abi, c.verifier.evm.bytecode.object);
const denomination = parseUnits(denomUsd, 6);
const pool = await deploy("pool", c.pool.abi, c.pool.evm.bytecode.object, [USDC, DIAMOND, hasher.address, verifier.address, denomination, account.address]);

const record = { network: "sepolia", pool: pool.address, deployBlock: pool.block, hasher: hasher.address, verifier: verifier.address, usdc: USDC, escrow: DIAMOND, denominationUsd: Number(denomUsd), screener: account.address, txs: { hasher: hasher.tx, verifier: verifier.tx, pool: pool.tx }, deployedAt: new Date().toISOString() };
fs.writeFileSync("data/pool.json", JSON.stringify(record, null, 2));
console.log("wrote data/pool.json");
