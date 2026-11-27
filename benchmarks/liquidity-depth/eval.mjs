// Accuracy eval for depth-miner, free (no Telegraph payments).
// Cases: every distinct Solana pool asked on Telegraph's public feed for LIQUIDITY_DEPTH_VERIFY_GENERAL,
// frozen to cases.json (with sha256) before the miner is called; --reuse keeps the frozen set.
// Truth where it exists: GeckoTerminal reserve_in_usd, an independent indexer. Pools it doesn't index
// are reported separately (answered / declined), since nothing outside the chain can check them.
// Run: node benchmarks/liquidity-depth/eval.mjs [--reuse]
import fs from "node:fs";
import { createHash } from "node:crypto";
import { poolLiquidity } from "../../depth-miner/lib/depth.js";

const DIR = "benchmarks/liquidity-depth";
const NODE = "https://devnode.telegraphprotocol.com";
const INTENT = "LIQUIDITY_DEPTH_VERIFY_GENERAL";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(u, tries = 25) {
  for (let i = 1; ; i++) {
    try { const r = await fetch(u, { signal: AbortSignal.timeout(30000) }); if (r.status === 404) return { notFound: true }; if (!r.ok) throw new Error(String(r.status)); return await r.json(); }
    catch (e) { if (i >= tries) return { error: String(e) }; await sleep(Math.min(20000, 3000 * i)); }
  }
}

let cases;
if (process.argv.includes("--reuse") && fs.existsSync(`${DIR}/cases.json`)) cases = JSON.parse(fs.readFileSync(`${DIR}/cases.json`, "utf8")).cases;
else {
  const by = {};
  for (let p = 0; p < 100; p++) {
    const j = await get(`${NODE}/daemon/api/questions?limit=100&offset=${p * 100}`);
    if (!j.results?.length) break;
    for (const q of j.results) {
      if (q.routing?.intent !== INTENT) continue;
      const m = (q.question?.text || "").match(/\{.*\}$/);
      let params; try { params = JSON.parse(m?.[0] ?? "null"); } catch { continue; }
      if (!/^sol/i.test(params?.chain ?? "") || !params.pool) continue;
      const c = (by[params.pool] ||= { pool: params.pool, asks: 0, okOnFeed: 0 });
      c.asks++; if (q.status === "success") c.okOnFeed++;
    }
  }
  cases = Object.values(by).sort((a, b) => b.asks - a.asks);
  const body = JSON.stringify(cases);
  fs.writeFileSync(`${DIR}/cases.json`, JSON.stringify({ frozenAt: new Date().toISOString(), source: `${NODE}/daemon/api/questions`, sha256: createHash("sha256").update(body).digest("hex"), cases }, null, 1));
}
console.log(`${cases.length} distinct Solana pools, ${cases.reduce((t, c) => t + c.asks, 0)} asks`);

const rows = [];
for (const c of cases) {
  let ours, decline;
  try { ours = await poolLiquidity({ pool: c.pool, chain: "solana" }); } catch (e) { decline = { code: e.code, message: e.message }; }
  const g = await get(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${c.pool}`, 6);
  await sleep(2100); // GeckoTerminal free tier: 30 calls/min
  const truth = g?.data?.attributes?.reserve_in_usd != null ? Number(g.data.attributes.reserve_in_usd) : null;
  const err = ours && truth ? Math.abs(ours.liquidity_usd - truth) / truth : null;
  const r = { ...c, dex: ours?.dex ?? decline?.extra?.dex ?? null, ours: ours?.liquidity_usd ?? null, route_verified: ours?.route_verified ?? null, decline: decline?.code ?? null, gecko: truth, relErr: err };
  rows.push(r);
  console.log(`${c.pool.slice(0, 8)} asks ${String(c.asks).padStart(3)} feed-ok ${String(c.okOnFeed).padStart(3)}  ours ${ours ? "$" + Math.round(ours.liquidity_usd).toLocaleString() : decline.code}  gecko ${truth == null ? "-" : "$" + Math.round(truth).toLocaleString()}  ${err == null ? "" : "err " + (100 * err).toFixed(1) + "%"}`);
}

const withTruth = rows.filter((r) => r.gecko != null);
const compared = withTruth.filter((r) => r.ours != null);
const within = (x) => compared.filter((r) => r.relErr <= x).length;
const failedOnFeed = rows.filter((r) => r.okOnFeed === 0);
const summary = {
  ranAt: new Date().toISOString(), pools: rows.length, asks: rows.reduce((t, r) => t + r.asks, 0),
  answered: rows.filter((r) => r.ours != null).length, declined: rows.filter((r) => r.decline).length,
  vsGeckoTerminal: { poolsWithTruth: withTruth.length, answered: compared.length, within2pct: within(0.02), within5pct: within(0.05), within10pct: within(0.10), declinedWhereTruthExists: withTruth.length - compared.length, medianErrPct: compared.length ? Number((100 * compared.map((r) => r.relErr).sort((a, b) => a - b)[Math.floor(compared.length / 2)]).toFixed(2)) : null },
  poolsNoMinerAnswered: { pools: failedOnFeed.length, asks: failedOnFeed.reduce((t, r) => t + r.asks, 0), nowAnswered: failedOnFeed.filter((r) => r.ours != null).length, asksNowAnswered: failedOnFeed.filter((r) => r.ours != null).reduce((t, r) => t + r.asks, 0), nowDeclinedWithReason: failedOnFeed.filter((r) => r.decline).length },
};
fs.writeFileSync(`${DIR}/eval-results.json`, JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify(summary, null, 1));
