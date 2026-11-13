// Tests candidate miners for each counterparty check against cases with known
// answers, and writes the ranking to data/miner-probe.json. Each call is paid ($0.01).
import fs from "node:fs";
import { loadAccount } from "./config.mjs";
import { createClient } from "../src/telegraph.js";

// expect(result) returns true when the miner got the known answer right.
const CHECKS = [
  {
    intent: "SANCTIONS_SCREENING_MATCH_GENERAL",
    // 13 Nov re-probe: 9002 went offline (503 no_compatible_miner); newer miners added.
    miners: [710637, 9002, 731002, 711637, 501, 5185, 4433],
    cases: [
      { params: { name: "Banco Nacional de Cuba" }, expect: (r) => isTrue(r.matched) },
      { params: { name: "Unilever PLC" }, expect: (r) => isFalse(r.matched) },
    ],
  },
  {
    intent: "CORPORATE_REGISTRY_LOOKUP_GENERAL",
    miners: [7393, 9002, 77393, 77419, 5185, 4433],
    cases: [
      { params: { company: "Barclays PLC", jurisdiction: "GB" }, expect: (r) => isTrue(r.active) && /barclays/i.test(r.legal_name || "") },
      { params: { company: "GSK PLC", jurisdiction: "GB" }, expect: (r) => isTrue(r.active) && /gsk/i.test(r.legal_name || "") },
    ],
  },
  {
    intent: "REGULATORY_FILING_MONITOR_GENERAL",
    miners: [4433, 77131, 190160, 80011, 302, 9002],
    cases: [
      { params: { entity: "Apple Inc", period: "last 12 months" }, expect: (r) => Number(r.filing_count) > 0 },
    ],
  },
  {
    intent: "NEWS_SEARCH_GENERAL",
    miners: [7329, 5530, 9004, 4433, 302],
    cases: [
      { params: { query: "Barclays" }, expect: (r) => Number(r.result_count) > 0 },
    ],
  },
];

const isTrue = (v) => ["true", "yes", "match", "matched", "1"].includes(String(v).toLowerCase());
const isFalse = (v) => ["false", "no", "0", "no match", "not matched", "clear"].includes(String(v).toLowerCase());

// `node scripts/probe-miners.mjs NEWS` probes only the checks whose intent contains NEWS,
// and merges them into the existing data/miner-probe.json.
const only = process.argv[2];
const client = createClient(loadAccount());
const prev = fs.existsSync("data/miner-probe.json") ? JSON.parse(fs.readFileSync("data/miner-probe.json", "utf8")) : null;
const out = { probedAt: new Date().toISOString(), payer: client.payer, checks: { ...(only && prev?.checks) } };
let spent = only ? prev?.spentUsd || 0 : 0;

for (const check of CHECKS.filter((c) => !only || c.intent.includes(only))) {
  const rows = [];
  for (const minerId of check.miners) {
    const row = { minerId, passed: 0, cases: [] };
    for (const c of check.cases) {
      const t0 = Date.now();
      const res = await client.askMiner(minerId, check.intent, c.params);
      const result = res.data?.result ?? null;
      const pass = res.ok && result ? Boolean(c.expect(result)) : false;
      if (res.ok) spent += Number(res.data.cost_usd || 0);
      row.passed += pass ? 1 : 0;
      row.name ??= res.data?.miner_name;
      row.cases.push({ params: c.params, status: res.status, pass, ms: Date.now() - t0, signal: res.data?.signal_hash, result, error: res.ok ? undefined : res.data });
      console.log(`${check.intent.padEnd(36)} ${String(minerId).padEnd(7)} ${res.status} ${pass ? "PASS" : "fail"} ${JSON.stringify(result ?? res.data).slice(0, 110)}`);
    }
    row.score = row.passed / check.cases.length;
    rows.push(row);
  }
  rows.sort((a, b) => b.score - a.score || a.cases[0].ms - b.cases[0].ms);
  out.checks[check.intent] = rows;
}

out.spentUsd = Number(spent.toFixed(4));
fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/miner-probe.json", JSON.stringify(out, null, 2));
console.log(`\nspent $${out.spentUsd}. Wrote data/miner-probe.json`);
