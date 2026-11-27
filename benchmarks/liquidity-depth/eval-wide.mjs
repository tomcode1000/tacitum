// Out-of-sample accuracy: pools we did not pick. GeckoTerminal's top Solana pools (pages 1-3, its
// own ranking), frozen to wide-cases.json with sha256 before the miner runs; --reuse keeps the set.
// Truth: GeckoTerminal reserve_in_usd from the same listing. Run: node benchmarks/liquidity-depth/eval-wide.mjs
import fs from "node:fs";
import { createHash } from "node:crypto";
import { poolLiquidity } from "../../depth-miner/lib/depth.js";

const DIR = "benchmarks/liquidity-depth";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let cases;
if (process.argv.includes("--reuse") && fs.existsSync(`${DIR}/wide-cases.json`)) cases = JSON.parse(fs.readFileSync(`${DIR}/wide-cases.json`, "utf8")).cases;
else {
  cases = [];
  for (let page = 1; page <= 3; page++) {
    const j = await (await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools?page=${page}&include=dex`)).json();
    for (const p of j.data || []) cases.push({ pool: p.attributes.address, name: p.attributes.name, geckoDex: p.relationships?.dex?.data?.id ?? null, geckoUsd: Number(p.attributes.reserve_in_usd) });
    await sleep(2500);
  }
  const body = JSON.stringify(cases);
  fs.writeFileSync(`${DIR}/wide-cases.json`, JSON.stringify({ frozenAt: new Date().toISOString(), source: "https://api.geckoterminal.com/api/v2/networks/solana/pools?page=1..3", sha256: createHash("sha256").update(body).digest("hex"), cases }, null, 1));
}
console.log(`${cases.length} pools`);
const rows = [];
for (const c of cases) {
  let ours = null, decline = null;
  try { ours = await poolLiquidity({ pool: c.pool, chain: "solana" }); } catch (e) { decline = e.code ?? String(e.message).slice(0, 80); }
  // Re-read GeckoTerminal now, so both numbers are from the same minutes.
  let truth = c.geckoUsd;
  try { const g = await (await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${c.pool}`)).json(); if (g?.data?.attributes?.reserve_in_usd) truth = Number(g.data.attributes.reserve_in_usd); } catch {}
  await sleep(2100);
  const err = ours && truth ? Math.abs(ours.liquidity_usd - truth) / truth : null;
  rows.push({ ...c, geckoNow: truth, ours: ours?.liquidity_usd ?? null, dex: ours?.dex ?? null, route_verified: ours?.route_verified ?? null, decline, relErr: err });
  console.log(`${c.pool.slice(0, 8)} ${String(c.geckoDex).padEnd(14)} ${c.name.slice(0, 22).padEnd(22)} ours ${ours ? "$" + Math.round(ours.liquidity_usd).toLocaleString() : decline}  gecko $${Math.round(truth).toLocaleString()}  ${err == null ? "" : (100 * err).toFixed(2) + "%"}`);
}
// Percent error is meaningless on near-empty pools: accuracy counts pools GeckoTerminal values at $1k or more.
const tiny = rows.filter((r) => !(r.geckoNow >= 1000));
const ans = rows.filter((r) => r.ours != null && r.geckoNow >= 1000);
const within = (x) => ans.filter((r) => r.relErr <= x).length;
const byDex = {};
for (const r of rows) { const d = (byDex[r.geckoDex] ||= { pools: 0, answered: 0, within5: 0, declined: {} }); d.pools++; if (r.ours != null) { d.answered++; if (r.relErr <= 0.05) d.within5++; } else d.declined[r.decline] = (d.declined[r.decline] || 0) + 1; }
const summary = { ranAt: new Date().toISOString(), pools: rows.length, poolsUnder1k: { pools: tiny.length, answered: tiny.filter((r) => r.ours != null).length, declined: tiny.filter((r) => r.decline).map((r) => r.decline) }, scoredPools: rows.length - tiny.length, answered: ans.length, declined: rows.filter((r) => r.geckoNow >= 1000 && r.ours == null).map((r) => ({ pool: r.pool, name: r.name, dex: r.geckoDex, why: r.decline })), within2pct: within(0.02), within5pct: within(0.05), within10pct: within(0.10), over10pct: ans.filter((r) => r.relErr > 0.10).map((r) => ({ pool: r.pool, name: r.name, ours: r.ours, gecko: r.geckoNow })), medianErrPct: ans.length ? Number((100 * ans.map((r) => r.relErr).sort((a, b) => a - b)[Math.floor(ans.length / 2)]).toFixed(2)) : null, byDex };
fs.writeFileSync(`${DIR}/eval-wide-results.json`, JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify(summary, null, 1));
