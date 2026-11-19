// Exports every Approved event of the current pool, read from chain, with the deciding miner taken
// from each screening receipt's public record. Usage: node scripts/pool-approvals.mjs
import "./config.mjs";
import fs from "node:fs";
import { parseAbiItem } from "viem";
import { logsClient, NODE } from "../src/config.js";

const P = JSON.parse(fs.readFileSync("data/pool.json", "utf8"));
const event = parseAbiItem("event Approved(uint256 indexed commitment, uint32 leafIndex, bytes32 screeningSignal, uint256 root)");
const latest = await logsClient.getBlockNumber();
const depEvent = parseAbiItem("event Deposited(uint256 indexed commitment, address indexed depositor)");
const depositors = new Map();
for (let from = BigInt(P.deployBlock); from <= latest; from += 9000n) {
  const to = from + 8999n > latest ? latest : from + 8999n;
  for (const l of await logsClient.getLogs({ address: P.pool, event: depEvent, fromBlock: from, toBlock: to })) depositors.set(l.args.commitment.toString(), l.args.depositor);
}
const out = [];
for (let from = BigInt(P.deployBlock); from <= latest; from += 9000n) {
  const to = from + 8999n > latest ? latest : from + 8999n;
  for (const l of await logsClient.getLogs({ address: P.pool, event, fromBlock: from, toBlock: to })) {
    const signal = l.args.screeningSignal;
    let miner = null;
    try { const r = await (await fetch(`${NODE}/engine/v1/signal/${signal}`)).json(); miner = r?.signal?.subnet_id ? `${r.signal.subnet_id} (${r.signal.miner_slug})` : null; } catch {}
    out.push({ leafIndex: l.args.leafIndex, depositor: depositors.get(l.args.commitment.toString()) ?? null, signal, miner, verify: `${NODE}/engine/v1/signal/${signal}`, tx: l.transactionHash, block: Number(l.blockNumber) });
  }
}
const file = "data/screening/pool-v4-approvals.json";
fs.writeFileSync(file, JSON.stringify({ pool: P.pool, exportedAt: new Date().toISOString(), approved: out.length, approvals: out }, null, 2));
console.log(`${out.length} approvals; miners: ${JSON.stringify(out.reduce((m, a) => ((m[a.miner] = (m[a.miner] || 0) + 1), m), {}))}; wrote ${file}`);
