// Pre-trade check: before an agent swaps through a Solana pool, is the pool deep enough for the
// trade size, and is the counterparty wallet clear of sanctions? Both are bought on Telegraph
// privately (one one-time payer, the real pool and wallet shuffled among decoys), so watching the
// public feed does not reveal which pool the agent is about to trade.
//
//   verdict STOP     counterparty matched a sanctions list
//   verdict HOLD     a check could not be answered (pool declined, no clear sanctions answer): don't trade blind
//   verdict CAUTION  answered, but the trade is large for the pool (price impact or size vs liquidity)
//   verdict GO       both checks answered and within limits
import { randomBytes } from "node:crypto";
import { SCREEN, isClear } from "./screener.js";
import { publicRecord } from "./telegraph.js";

// Telegraph hands the buyer only the intent's declared field (liquidity_usd); the miner's full
// answer (dex, route check, depth table) is in the public record of the same signal. Use it.
export async function fullDepthAnswer(res, fetchRecord = (h) => publicRecord(h, { waitMs: 90_000 })) {
  const r = res?.data?.result;
  if (r?.route_verified != null) return r;
  const direct = res?.data?.response ?? res?.data?.raw;
  if (direct?.route_verified != null) return { ...direct, ...r };
  const hash = res?.data?.signal_hash;
  if (!hash) return r;
  try { const rec = await fetchRecord(hash); const full = rec?.payload?.response; if (full?.liquidity_usd != null) return { ...full, ...r }; } catch {}
  return r;
}

export const DEPTH_MINER = 7314403;
export const DEPTH_INTENT = "LIQUIDITY_DEPTH_VERIFY_GENERAL";
// Ordinary, liquid Solana pools: a depth check on any of them looks like routine pre-trade work.
export const DECOY_POOLS = [
  "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE", // Orca SOL/USDC
  "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2", // Raydium SOL/USDC
  "C8Gr6AUuq9hEdSYJzoEpNcdjpojPZwqG5MtQbeouNNwg", // Meteora SOL/JUP
  "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv", // Raydium CLMM SOL/USDC
  "BZtgQEyS6eXUXicYPHecYQ7PybqodXQMvkjUbP4R8mUU", // Orca
  "8FnX3xo2yYw3EUE6w3nQA4GfXGS9wpK6oj3veJpbFzLo", // BisonFi SOL/USDC
  "23XoPQqGw9WMsLoqTu8HMzJLD6RnXsufbKyWPLJywsCT", // Byreal USDT/USDC
];
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// A decoy wallet in the same format as the real one (EVM hex or Solana base58, same length).
export function decoyWallet(real) {
  if (/^0x[0-9a-fA-F]{40}$/.test(real)) return "0x" + randomBytes(20).toString("hex");
  return Array.from(randomBytes(real.length), (b) => B58[b % 58]).join("");
}

export function pickDecoyPools(pool, n, list = DECOY_POOLS) {
  return list.filter((p) => p !== pool).sort(() => Math.random() - 0.5).slice(0, n);
}

// Pure: the verdict from the two answers. depth = the miner's result (or { error }), sanctions = a
// screenWallet-shaped result or null when no counterparty was given.
export function decide({ depth, sanctions, sizeUsd, maxImpactPct = 1, minLiquidityMultiple = 20 }) {
  const reasons = [];
  let verdict = "GO";
  const lower = (v) => { const order = ["GO", "CAUTION", "HOLD", "STOP"]; if (order.indexOf(v) > order.indexOf(verdict)) verdict = v; };

  if (sanctions) {
    if (!isClear(sanctions)) { lower("HOLD"); reasons.push(`Counterparty screening gave no clear answer${sanctions.error ? ` (${String(sanctions.error).slice(0, 80)})` : ""}.`); }
    else if (sanctions.matched) { lower("STOP"); reasons.push(`Counterparty matched a sanctions list (miner ${sanctions.miner}).`); }
    else reasons.push(`Counterparty clear of sanctions (miner ${sanctions.miner}).`);
  }

  if (!depth || depth.liquidity_usd == null) {
    lower("HOLD");
    reasons.push(`Pool depth unknown: ${depth?.error ?? "no answer"}.`);
  } else {
    const liq = depth.liquidity_usd;
    reasons.push(`Pool holds $${Math.round(liq).toLocaleString()} (${depth.dex ?? "Solana"} ${depth.pair ?? ""}).`.replace(" )", ")"));
    if (liq < sizeUsd * minLiquidityMultiple) { lower("CAUTION"); reasons.push(`Trade of $${sizeUsd.toLocaleString()} is more than 1/${minLiquidityMultiple} of the pool.`); }
    const row = (depth.depth || []).filter((d) => d.sell_usd >= sizeUsd).sort((a, b) => a.sell_usd - b.sell_usd)[0];
    if (!depth.route_verified) { lower("CAUTION"); reasons.push("Jupiter did not confirm trades route through this pool."); }
    else if (!row) { lower("CAUTION"); reasons.push(`Price impact not measured at $${sizeUsd.toLocaleString()} (largest measured: $${Math.max(0, ...(depth.depth || []).map((d) => d.sell_usd)).toLocaleString()}).`); }
    else if (row.price_impact_pct > maxImpactPct) { lower("CAUTION"); reasons.push(`Selling $${row.sell_usd.toLocaleString()} moves the price ${row.price_impact_pct}%, above the ${maxImpactPct}% limit.`); }
    else reasons.push(`Selling up to $${row.sell_usd.toLocaleString()} moves the price ${row.price_impact_pct}% (limit ${maxImpactPct}%).`);
  }
  return { verdict, reasons };
}

// Runs the checks with one payer client. jobs are shuffled and spaced; only the real answers return.
export async function preTradeRun(client, { fetchRecord, pool, chain = "solana", sizeUsd, counterparty = null, decoys = 3, maxImpactPct, minLiquidityMultiple, notBefore = 0, jitterMs = [300, 2500], depthMiner = DEPTH_MINER, sanctionsMiners = SCREEN.miners }) {
  if (!pool) throw new Error("preTrade needs { pool }");
  if (!(sizeUsd > 0)) throw new Error("preTrade needs { sizeUsd } > 0");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (notBefore > Date.now()) await sleep(notBefore - Date.now());
  const jobs = [
    { kind: "depth", real: true, params: { pool, chain } },
    ...pickDecoyPools(pool, decoys).map((p) => ({ kind: "depth", real: false, params: { pool: p, chain } })),
  ];
  if (counterparty) {
    jobs.push({ kind: "sanctions", real: true, name: counterparty });
    for (let i = 0; i < decoys; i++) jobs.push({ kind: "sanctions", real: false, name: decoyWallet(counterparty) });
  }
  jobs.sort(() => Math.random() - 0.5);
  let depth = null, depthSignal = null, sanctions = null;
  const cover = [];
  for (const job of jobs) {
    await sleep(jitterMs[0] + Math.random() * (jitterMs[1] - jitterMs[0]));
    if (job.kind === "depth") {
      let res;
      try { res = await client.askMiner(depthMiner, DEPTH_INTENT, job.params); } catch (e) { res = { ok: false, data: { error: e.shortMessage || e.message } }; }
      if (job.real) { depth = res?.ok && res.data?.result ? await fullDepthAnswer(res, fetchRecord) : { error: String(res?.data?.error ?? res?.data?.result?.error ?? "no answer").slice(0, 200) }; depthSignal = res?.data?.signal_hash ?? null; }
      else cover.push({ kind: "depth", pool: job.params.pool, signal: res?.data?.signal_hash ?? null });
    } else {
      // Sanctions: miners in order, first clear answer with a receipt decides (as the pool screener does).
      let s = null;
      for (const m of sanctionsMiners) {
        try {
          const res = await client.askMiner(m, SCREEN.intent, { name: job.name });
          const data = res.data || res;
          s = { miner: m, matched: data?.result?.matched, signal: data?.signal_hash, error: data?.error };
        } catch (e) { s = { miner: m, error: e.shortMessage || e.message }; }
        if (isClear(s)) break;
      }
      if (job.real) sanctions = s; else cover.push({ kind: "sanctions", signal: s?.signal ?? null });
    }
  }
  const { verdict, reasons } = decide({ depth, sanctions, sizeUsd, maxImpactPct, minLiquidityMultiple });
  return {
    verdict, reasons, pool, chain, sizeUsd, counterparty,
    depth, sanctions,
    receipts: { depth: depthSignal, sanctions: sanctions?.signal ?? null },
    privacy: { decoyPools: jobs.filter((j) => j.kind === "depth" && !j.real).length, decoyWallets: jobs.filter((j) => j.kind === "sanctions" && !j.real).length, cover },
  };
}
