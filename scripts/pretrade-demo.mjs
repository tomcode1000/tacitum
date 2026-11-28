// Live pre-trade checks through Tacitum on Telegraph. Writes evidence/pretrade-<date>.json.
// Run: node scripts/pretrade-demo.mjs        (about $0.30 test USDC)
//   1. BisonFi SOL/USDC, $25k, counterparty = our own funder wallet      -> expect GO
//   2. same pool, counterparty = Lazarus Group (Ronin) address, OFAC SDN  -> expect STOP
import "./config.mjs";
import fs from "node:fs";
import { loadAccount } from "./config.mjs";
import { tacitum } from "../src/index.js";

const POOL = "8FnX3xo2yYw3EUE6w3nQA4GfXGS9wpK6oj3veJpbFzLo";
const LAZARUS = "0x098B716B8Aaf21512996dC57EB0615e2383E2f96"; // public OFAC SDN listing (Lazarus Group, Ronin bridge)
const funder = loadAccount();
const t = tacitum({ funder, k: 4, maxPerPaymentUsd: 0.05, maxTotalUsd: 1, log: (m) => console.log("  ", m) });
const runs = [
  { label: "own wallet", counterparty: funder.address, sizeUsd: 25_000, expect: "GO" },
  { label: "OFAC-listed wallet", counterparty: LAZARUS, sizeUsd: 25_000, expect: "STOP" },
];
const out = { at: new Date().toISOString(), pool: POOL, runs: [] };
for (const r of runs) {
  let res;
  for (let i = 1; i <= 3 && !res; i++) {
    try { res = await t.preTrade({ pool: POOL, sizeUsd: r.sizeUsd, counterparty: r.counterparty }); }
    catch (e) { console.log("  retry:", e.shortMessage || e.message); await new Promise((ok) => setTimeout(ok, 15000 * i)); }
  }
  const rec = { ...r, verdict: res?.verdict, reasons: res?.reasons, liquidity_usd: res?.depth?.liquidity_usd ?? null, receipts: res?.receipts, sanctionsMiner: res?.sanctions?.miner ?? null, privacy: res && { decoyPools: res.privacy.decoyPools, decoyWallets: res.privacy.decoyWallets }, payer: res?.payer, fundingTx: res?.fundingTx };
  out.runs.push(rec);
  console.log(`${r.label}: ${rec.verdict} (expected ${r.expect})`);
  for (const x of rec.reasons || []) console.log("   -", x);
  console.log("   receipts", JSON.stringify(rec.receipts));
}
const file = `evidence/pretrade-${new Date().toISOString().slice(0, 10)}.json`;
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log("saved", file);
process.exit(0);
