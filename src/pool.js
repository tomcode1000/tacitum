// Client for the screened pool (contracts/ScreenedPool.sol).
//
//   note    = { nullifier, secret }           kept by the desk, never published
//   commit  = Poseidon(nullifier, secret)     goes on chain with the deposit
//   nullHash = Poseidon(nullifier)            published once, at withdraw, to stop double spend
//
// The approved tree is rebuilt from the pool's Approved events, so any client can produce a
// proof without trusting the screener for anything except the screening itself.
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildPoseidon } from "circomlibjs";
import * as snarkjs from "snarkjs";
import { encodeAbiParameters, getAddress, keccak256, parseAbi, parseAbiItem, parseSignature } from "viem";
import { KEYS, USDC, publicClient, walletClient, usdcAbi } from "./config.js";

export const LEVELS = 16;
const FIELD = 21888242871839275222987973346525843474722323733218440019324089856651904883201n;
const ARTIFACTS = fileURLToPath(new URL("../circuits/build/", import.meta.url));

export const poolAbi = parseAbi([
  "function deposit(uint256 commitment)",
  "function depositWithAuthorization(uint256 commitment, address from, uint256 validAfter, uint256 validBefore, uint8 v, bytes32 r, bytes32 s)",
  "function approve(uint256 commitment, bytes32 screeningSignal)",
  "function reject(uint256 commitment, bytes32 screeningSignal)",
  "function withdraw(uint256[2] a, uint256[2][2] b, uint256[2] c, uint256 root, uint256 nullifierHash, address recipient, address relayer, uint256 fee)",
  "function denomination() view returns (uint256)",
  "function screener() view returns (address)",
  "function latestRoot() view returns (uint256)",
  "function isKnownRoot(uint256) view returns (bool)",
  "function pendingDepositor(uint256) view returns (address)",
  "function approved(uint256) view returns (bool)",
  "function spent(uint256) view returns (bool)",
  "function nextIndex() view returns (uint32)",
  "event Deposited(uint256 indexed commitment, address indexed depositor)",
  "event Approved(uint256 indexed commitment, uint32 leafIndex, bytes32 screeningSignal, uint256 root)",
  "event Rejected(uint256 indexed commitment, address indexed depositor, bytes32 screeningSignal)",
  "event Withdrawn(address indexed recipient, uint256 nullifierHash, address relayer, uint256 fee)",
]);

let poseidonP;
async function H(...xs) {
  poseidonP ??= buildPoseidon();
  const p = await poseidonP;
  return p.F.toObject(p(xs));
}

const rand = () => BigInt("0x" + randomBytes(31).toString("hex")); // 248 bits < field

export async function newNote() {
  const nullifier = rand();
  const secret = rand();
  return { nullifier, secret, commitment: await H(nullifier, secret), nullifierHash: await H(nullifier) };
}

// Notes are kept next to the one-time payer keys: losing one loses the deposit.
export function saveNote(pool, note, extra = {}) {
  const dir = path.join(KEYS, "notes");
  fs.mkdirSync(dir, { recursive: true });
  const rec = { pool, nullifier: note.nullifier.toString(), secret: note.secret.toString(), commitment: note.commitment.toString(), nullifierHash: note.nullifierHash.toString(), ...extra };
  const file = path.join(dir, `${note.commitment.toString(16).padStart(64, "0").slice(0, 16)}.json`);
  fs.writeFileSync(file, JSON.stringify(rec, null, 2));
  return file;
}

export function loadNotes(pool) {
  const dir = path.join(KEYS, "notes");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((f) => ({ file: path.join(dir, f), ...JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) }))
    .filter((n) => getAddress(n.pool) === getAddress(pool))
    .map((n) => ({ ...n, nullifier: BigInt(n.nullifier), secret: BigInt(n.secret), commitment: BigInt(n.commitment), nullifierHash: BigInt(n.nullifierHash) }));
}

// ---- Merkle tree, same layout as the contract (zero leaves = 0, Poseidon(l, r)) ----

export class Tree {
  static async create(leaves = []) {
    const t = new Tree();
    t.zeros = [0n];
    for (let i = 1; i <= LEVELS; i++) t.zeros.push(await H(t.zeros[i - 1], t.zeros[i - 1]));
    t.leaves = [];
    for (const l of leaves) t.leaves.push(BigInt(l));
    await t.rebuild();
    return t;
  }

  async rebuild() {
    this.layers = [this.leaves.slice()];
    for (let lvl = 0; lvl < LEVELS; lvl++) {
      const cur = this.layers[lvl];
      const next = [];
      for (let i = 0; i < cur.length; i += 2) next.push(await H(cur[i], i + 1 < cur.length ? cur[i + 1] : this.zeros[lvl]));
      this.layers.push(next);
    }
  }

  get root() {
    return this.layers[LEVELS][0] ?? this.zeros[LEVELS];
  }

  path(index) {
    const pathElements = [];
    const pathIndices = [];
    for (let lvl = 0, i = index; lvl < LEVELS; lvl++, i >>= 1) {
      const sib = i ^ 1;
      pathElements.push(this.layers[lvl][sib] ?? this.zeros[lvl]);
      pathIndices.push(i & 1);
    }
    return { pathElements, pathIndices };
  }
}

// Public RPCs cap log ranges, so scan in chunks from the pool's deployment block.
export async function approvedLeaves(pool, fromBlock) {
  const latest = await publicClient.getBlockNumber();
  const event = parseAbiItem("event Approved(uint256 indexed commitment, uint32 leafIndex, bytes32 screeningSignal, uint256 root)");
  const out = [];
  for (let from = BigInt(fromBlock); from <= latest; from += 9000n) {
    const to = from + 8999n > latest ? latest : from + 8999n;
    const logs = await publicClient.getLogs({ address: pool, event, fromBlock: from, toBlock: to });
    for (const l of logs) out.push({ commitment: l.args.commitment, leafIndex: Number(l.args.leafIndex), signal: l.args.screeningSignal, root: l.args.root, tx: l.transactionHash });
  }
  return out.sort((a, b) => a.leafIndex - b.leafIndex);
}

// ---- Proofs ----

export async function prove(note, tree, leafIndex, { recipient, relayer, fee = 0n }) {
  const { pathElements, pathIndices } = tree.path(leafIndex);
  const input = {
    root: tree.root.toString(),
    nullifierHash: note.nullifierHash.toString(),
    recipient: BigInt(recipient).toString(),
    relayer: BigInt(relayer).toString(),
    fee: BigInt(fee).toString(),
    nullifier: note.nullifier.toString(),
    secret: note.secret.toString(),
    pathElements: pathElements.map(String),
    pathIndices: pathIndices.map(String),
  };
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, path.join(ARTIFACTS, "withdraw.wasm"), path.join(ARTIFACTS, "withdraw.zkey"));
  // snarkjs gives pi_b with the coordinates in the order the Solidity verifier expects reversed.
  const a = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
  const b = [[BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])], [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])]];
  const c = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];
  return { a, b, c, proof, publicSignals, root: tree.root };
}

export async function verifyLocally(proof, publicSignals) {
  const vk = JSON.parse(fs.readFileSync(path.join(ARTIFACTS, "verification_key.json"), "utf8"));
  return snarkjs.groth16.verify(vk, publicSignals, proof);
}

// ---- On-chain steps ----

export async function deposit(depositor, pool, note) {
  const w = walletClient(depositor);
  const denom = await publicClient.readContract({ address: pool, abi: poolAbi, functionName: "denomination" });
  const allowance = await publicClient.readContract({ address: USDC, abi: usdcAbi, functionName: "allowance", args: [depositor.address, pool] });
  if (allowance < denom) {
    const h = await w.writeContract({ address: USDC, abi: usdcAbi, functionName: "approve", args: [pool, denom * 20n] });
    await publicClient.waitForTransactionReceipt({ hash: h });
  }
  const hash = await retry(() => w.writeContract({ address: pool, abi: poolAbi, functionName: "deposit", args: [note.commitment] }));
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`deposit reverted: ${hash}`);
  return hash;
}

// Gasless deposit: the depositor only signs (EIP-3009 ReceiveWithAuthorization, nonce bound to
// the commitment); the relayer submits. The depositor wallet needs USDC and no ETH.
export async function depositGasless(depositor, relayer, pool, note, validForSec = 3600) {
  const value = await publicClient.readContract({ address: pool, abi: poolAbi, functionName: "denomination" });
  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + validForSec);
  const nonce = keccak256(encodeAbiParameters([{ type: "uint256" }], [note.commitment]));
  const signature = await depositor.signTypedData({
    domain: { name: "USD Coin", version: "2", chainId: 11155111, verifyingContract: USDC },
    types: { ReceiveWithAuthorization: [
      { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
    ] },
    primaryType: "ReceiveWithAuthorization",
    message: { from: depositor.address, to: pool, value, validAfter, validBefore, nonce },
  });
  const { r, s, v } = parseSignature(signature);
  const w = walletClient(relayer);
  const hash = await retry(() => w.writeContract({ address: pool, abi: poolAbi, functionName: "depositWithAuthorization", args: [note.commitment, depositor.address, validAfter, validBefore, Number(v), r, s] }));
  const rc = await publicClient.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") throw new Error(`gasless deposit reverted: ${hash}`);
  return hash;
}

// The relayer sends the withdraw transaction, so the desk's wallet never touches it.
export async function withdraw(relayer, pool, p, { nullifierHash, recipient, fee = 0n }) {
  const w = walletClient(relayer);
  const hash = await retry(() => w.writeContract({ address: pool, abi: poolAbi, functionName: "withdraw", args: [p.a, p.b, p.c, p.root, nullifierHash, recipient, relayer.address, fee] }));
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`withdraw reverted: ${hash}`);
  return hash;
}

// Load-balanced public RPCs sometimes simulate against a stale block (allowance not yet seen).
async function retry(fn, tries = 6) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= tries - 1 || !/allowance|nonce|underpriced|timeout|fetch failed/i.test(err.shortMessage || err.message)) throw err;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
}

export { FIELD };

// snarkjs keeps a worker pool alive after proving; close it so scripts and tests can exit.
export async function shutdown() {
  if (globalThis.curve_bn128) await globalThis.curve_bn128.terminate();
}
