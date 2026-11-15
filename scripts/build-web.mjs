// Collects what the web demo shows into web/data.json, from committed evidence only.
// Usage: node scripts/build-web.mjs [assessments/<file>.json]
import fs from "node:fs";
import path from "node:path";
import "./config.mjs";
import { approvedLeaves } from "../src/pool.js";
import { NODE } from "../src/config.js";

const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const memoFile = process.argv[2] || fs.readdirSync("assessments").filter((f) => /private.*\.json$/.test(f)).sort().map((f) => path.join("assessments", f)).pop();
const run = read(memoFile);
const real = run.real;
const pool = read("data/pool.json");
const miner = read("data/miner.json");

const summarise = (check, a) => {
  const r = a.result || {};
  if (!a.ok) return `no answer (${a.status}${a.error ? `, ${String(a.error).slice(0, 40)}` : ""})`;
  if (check === "sanctions") return `matched = ${r.matched}`;
  if (check === "registry") return `${r.legal_name || r.name || "?"} · active = ${r.active}`;
  if (check === "filings") return `${r.filing_count ?? "?"} filings in the last 12 months`;
  if (check === "news") return r.brief || r.answer?.slice(0, 120) || `${r.result_count} items`;
  return JSON.stringify(r).slice(0, 80);
};

const checks = Object.entries(real.checks).map(([name, c]) => ({
  name,
  verdict: real.verdicts[name],
  answers: c.answers.map((a) => ({ miner: a.miner || `miner ${a.minerId}`, minerId: a.minerId, ok: a.ok, summary: summarise(name, a), signal: a.signal || null, costUsd: a.costUsd })),
}));

// Screening results for the pool, newest files last; only our own seeded/desk wallets appear.
const screening = [];
for (const f of ["data/pool-e2e.json", ...fs.readdirSync("data").filter((f) => /^pool-screen-.*\.json$/.test(f)).map((f) => `data/${f}`), ...(fs.existsSync("data/screening") ? fs.readdirSync("data/screening").map((f) => `data/screening/${f}`) : []), ...fs.readdirSync("data").filter((f) => /^pool-deposits-.*\.json$/.test(f)).map((f) => `data/${f}`)]) {
  if (!fs.existsSync(f)) continue;
  const j = read(f);
  for (const s of Array.isArray(j) ? j : j.screening || []) screening.push({ depositor: s.depositor, verdict: s.verdict, matched: s.matched, signal: s.signal, tx: s.tx });
}
const seen = new Set();
const screened = screening.filter((s) => s.depositor && !seen.has(s.depositor) && seen.add(s.depositor));

const results = read("data/privacy-results.json");
const minerSample = read("evidence/miner-paid-call-5.json");

const data = {
  builtAt: new Date().toISOString(),
  node: NODE,
  repo: "https://github.com/tomcode1000/tacitum",
  memo: {
    file: memoFile.replace(/\\/g, "/"),
    counterparty: real.counterparty,
    finishedAt: real.finishedAt,
    overall: real.overall,
    verified: real.verification.filter((v) => v.found && v.payerMatches && v.txMatches).length,
    receipts: real.verification.length,
    costUsd: real.costUsd,
    checks,
  },
  observed: {
    payer: real.payer,
    funder: real.privacy.funder,
    fundingTx: real.privacy.fundingTx,
    viaPool: Boolean(real.privacy.viaPool),
    anonymitySet: real.privacy.anonymitySet,
    parties: run.parties,
    real: run.parties[run.targetIndex],
    order: run.order,
    bundleCostUsd: run.costUsd,
  },
  privacy: {
    k: results.k,
    chance: results.chance,
    versions: [
      { v: "Random", best: 1.0, lo: 0.68, hi: 1.0, runs: 8, change: "Decoys picked at random" },
      { v: "v1", best: 0.5, lo: 0.28, hi: 0.72, runs: 16, change: "Match fame and name format" },
      { v: "v2", best: 0.57, lo: 0.33, hi: 0.77, runs: 16, change: "Match registry answers" },
      { v: "v3", best: 0.45, lo: 0.23, hi: 0.67, runs: 16, change: "Match SEC filer status" },
      { v: "v4", best: 0.38, lo: 0.18, hi: 0.61, runs: 16, change: "Match filing volume" },
      { v: "v5", best: Math.max(...["first", "famous", "format", "learned", "rarest"].map((k) => results.strategies.matched[k])), lo: results.strategies.matched.bestCI95[0], hi: results.strategies.matched.bestCI95[1], runs: results.strategies.matched.runs, change: "Fixed cover sets, re-probed miners" },
    ],
    attackers: results.strategies.matched,
    perPartyUsd: +(run.costUsd / run.k).toFixed(3),
  },
  pool: {
    address: pool.pool,
    denominationUsd: pool.denominationUsd,
    approvedSet: (await approvedLeaves(pool.pool, pool.deployBlock)).length,
    screener: { intent: "SANCTIONS_SCREENING_MATCH_GENERAL", miner: 731002 },
    flaggedExample: { wallet: "0x098B716B8Aaf21512996dC57EB0615e2383E2f96", label: "Ronin bridge exploiter (OFAC SDN)", matched: true },
    screened: screened.slice(-12),
    screenedTotal: screened.length,
  },
  miner: {
    id: miner.id,
    slug: miner.slug,
    registrationId: miner.registrationId,
    endpoint: "https://tacitum-adverse.vercel.app/api/adverse",
    // The inline Telegraph result keeps only the intent fields; the public record has the full answer.
    sample: { query: minerSample.request.params.query, result: (await (await fetch(`${NODE}/engine/v1/signal/${minerSample.response.signal_hash}`)).json()).payload?.response || minerSample.response.result, signal: minerSample.response.signal_hash },
  },
};

fs.mkdirSync("web", { recursive: true });
fs.writeFileSync("web/data.json", JSON.stringify(data, null, 2));
console.log(`web/data.json from ${memoFile}: approved set ${data.pool.approvedSet}, ${data.pool.screenedTotal} screened wallets, v5 best ${data.privacy.versions.at(-1).best}`);
