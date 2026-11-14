// Deposit gate for the screened pool. For every deposit still waiting, the depositor's wallet is
// screened through Telegraph's sanctions intent, and the pool is told the verdict together with
// the Telegraph signal hash, so the approval can be re-checked by anyone at /engine/v1/signal/{hash}.
//
//   matched === false  -> approve (enters the approved set)
//   matched === true   -> reject  (refunded, never mixes)
//   anything else      -> left pending and retried later (no verdict without a clear answer)
import { parseAbiItem } from "viem";
import { publicClient, walletClient } from "./config.js";
import { createClient } from "./telegraph.js";
import { poolAbi } from "./pool.js";

export const SCREEN = { intent: "SANCTIONS_SCREENING_MATCH_GENERAL", miner: 731002 };

export async function pendingDeposits(pool, fromBlock) {
  const latest = await publicClient.getBlockNumber();
  const event = parseAbiItem("event Deposited(uint256 indexed commitment, address indexed depositor)");
  const out = [];
  for (let from = BigInt(fromBlock); from <= latest; from += 9000n) {
    const to = from + 8999n > latest ? latest : from + 8999n;
    for (const l of await publicClient.getLogs({ address: pool, event, fromBlock: from, toBlock: to })) {
      const still = await publicClient.readContract({ address: pool, abi: poolAbi, functionName: "pendingDepositor", args: [l.args.commitment] });
      if (still !== "0x0000000000000000000000000000000000000000") out.push({ commitment: l.args.commitment, depositor: l.args.depositor, tx: l.transactionHash });
    }
  }
  return out;
}

export async function screenWallet(client, address) {
  const res = await client.askMiner(SCREEN.miner, SCREEN.intent, { name: address });
  const data = res.data || res;
  const matched = data?.result?.matched;
  return { matched, score: data?.result?.match_score, signal: data?.signal_hash, receipt: res.receipt || data?.receipt, raw: data };
}

// screenerAccount must be the pool's screener; it also pays the Telegraph screening calls.
export async function screenPending(screenerAccount, pool, fromBlock, log = console.log) {
  const client = createClient(screenerAccount);
  const w = walletClient(screenerAccount);
  const results = [];
  for (const d of await pendingDeposits(pool, fromBlock)) {
    const s = await screenWallet(client, d.depositor);
    const signal = /^0x[0-9a-fA-F]{64}$/.test(s.signal || "") ? s.signal : null;
    let verdict = "pending";
    let tx = null;
    if (signal && s.matched === false) verdict = "approve";
    else if (signal && s.matched === true) verdict = "reject";
    if (verdict !== "pending") {
      tx = await w.writeContract({ address: pool, abi: poolAbi, functionName: verdict, args: [d.commitment, signal] });
      const r = await publicClient.waitForTransactionReceipt({ hash: tx });
      if (r.status !== "success") throw new Error(`${verdict} reverted: ${tx}`);
    }
    log(`${verdict.padEnd(8)} depositor ${d.depositor}  matched=${s.matched} score=${s.score}  signal ${signal ?? "-"}  ${tx ?? ""}`);
    results.push({ ...d, verdict, matched: s.matched, score: s.score, signal, tx });
  }
  return results;
}
