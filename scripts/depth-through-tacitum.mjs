// Before/after on Telegraph, bought through Tacitum: the Solana pools no miner had answered, asked
// privately (one-time payer, each real pool among 3 decoy pools) of tacitum-pool-depth (7314403);
// then once per pool with no miner named, to see whether Telegraph's router picks a miner that answers.
// Writes evidence/depth-through-tacitum-<date>.json with every signal hash. Cost about $0.20 test USDC.
// Run: node scripts/depth-through-tacitum.mjs
import "./config.mjs";
import fs from "node:fs";
import { loadAccount } from "./config.mjs";
import { tacitum, createClient } from "../src/index.js";
import { NODE } from "../src/config.js";
import { oneTimePayer } from "../src/payers.js";

const INTENT = "LIQUIDITY_DEPTH_VERIFY_GENERAL";
const MINER = 7314403;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REAL = [
  { pool: "8FnX3xo2yYw3EUE6w3nQA4GfXGS9wpK6oj3veJpbFzLo", dex: "BisonFi", askedBefore: 216 },
  { pool: "FJnaiidSLXFweWkgbinxEHRykVHsnkzDcYbNDR3RF5LN", dex: "BisonFi", askedBefore: 6 },
  { pool: "23XoPQqGw9WMsLoqTu8HMzJLD6RnXsufbKyWPLJywsCT", dex: "Byreal", askedBefore: 8 },
];
// Decoys: ordinary, liquid pools that look like any other pre-trade check.
const DECOYS = ["Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE", "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2", "C8Gr6AUuq9hEdSYJzoEpNcdjpojPZwqG5MtQbeouNNwg", "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv", "BZtgQEyS6eXUXicYPHecYQ7PybqodXQMvkjUbP4R8mUU"];
const pick = (n, not) => DECOYS.filter((d) => d !== not).sort(() => Math.random() - 0.5).slice(0, n);
const brief = (res) => ({ status: res?.status ?? null, ok: Boolean(res?.ok), miner: res?.data?.miner_slug ?? res?.data?.routing?.miner_slug ?? null, liquidity_usd: res?.data?.result?.liquidity_usd ?? null, dex: res?.data?.result?.dex ?? null, route_verified: res?.data?.result?.route_verified ?? null, error: res?.ok ? undefined : String(res?.data?.error ?? res?.error ?? "").slice(0, 200), signal: res?.data?.signal_hash ?? null });

const funder = loadAccount();
const t = tacitum({ funder, k: 4, maxPerPaymentUsd: 0.05, maxTotalUsd: 1, log: (m) => console.log("  ", m) });
const out = { at: new Date().toISOString(), intent: INTENT, miner: MINER, private: [], routed: [] };

// 1. Private, through Tacitum, aimed at our miner.
for (const r of REAL) {
  let got;
  for (let i = 1; i <= 4 && !got; i++) {
    try { got = await t.ask(INTENT, { pool: r.pool, chain: "solana" }, { decoys: pick(3, r.pool).map((pool) => ({ pool, chain: "solana" })), minerId: MINER, fundUsd: 0.06 }); }
    catch (e) { console.log("  retry:", e.shortMessage || e.message); await sleep(15000 * i); }
  }
  const rec = { ...r, answer: brief(got?.answer), payer: got?.payer, fundingTx: got?.fundingTx, cover: got?.cover };
  out.private.push(rec);
  console.log(`private ${r.dex} ${r.pool.slice(0, 8)} -> ${rec.answer.ok ? "$" + Math.round(rec.answer.liquidity_usd).toLocaleString() : "ERR " + rec.answer.error} signal ${rec.answer.signal}`);
}

// 2. Open, no miner named: does Telegraph's router send it to a miner that answers?
const payer = await oneTimePayer(funder, "0.05", "depth routed check");
await sleep(130_000);
const client = createClient(payer.account);
for (const r of REAL) {
  let res;
  for (let i = 1; i <= 4; i++) { try { res = await client.ask(INTENT, { pool: r.pool, chain: "solana" }); break; } catch (e) { res = { ok: false, error: e.shortMessage || e.message }; await sleep(8000 * i); } }
  const rec = { ...r, answer: brief(res) };
  out.routed.push(rec);
  console.log(`routed  ${r.dex} ${r.pool.slice(0, 8)} -> ${rec.answer.ok ? "$" + Math.round(rec.answer.liquidity_usd ?? 0).toLocaleString() : "ERR " + rec.answer.error} via ${rec.answer.miner} signal ${rec.answer.signal}`);
}

// 3. Read every real answer back from the public record.
for (const rec of [...out.private, ...out.routed]) {
  if (!rec.answer.signal) continue;
  try { const s = await (await fetch(`${NODE}/engine/v1/signal/${rec.answer.signal}`)).json(); rec.publicRecord = { url: `${NODE}/engine/v1/signal/${rec.answer.signal}`, miner: s?.miner_slug ?? s?.routing?.miner_slug ?? s?.miner ?? null, found: !s?.error }; } catch {}
}
const file = `evidence/depth-through-tacitum-${new Date().toISOString().slice(0, 10)}.json`;
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log("saved", file);
process.exit(0);
