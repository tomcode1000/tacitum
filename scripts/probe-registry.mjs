// Re-probes every live CORPORATE_REGISTRY_LOOKUP_GENERAL miner against known UK answers, to pick
// a second registry source independent of 77393 (Companies House). Paid: $0.01 per call.
// Usage: node scripts/probe-registry.mjs
import fs from "node:fs";
import { NODE, loadAccount } from "./config.mjs";
import { createClient } from "../src/telegraph.js";

const INTENT = "CORPORATE_REGISTRY_LOOKUP_GENERAL";
const CASES = [
  { params: { company: "Barclays PLC", jurisdiction: "GB" }, want: /barclays/i },
  { params: { company: "GSK PLC", jurisdiction: "GB" }, want: /gsk|glaxo/i },
];
const SKIP = new Set(["77393"]); // already our primary

const live = (await (await fetch(`${NODE}/engine/v1/intents/${INTENT}`)).json()).miners;
const client = createClient(loadAccount());
const rows = [];
for (const m of live.filter((m) => !SKIP.has(String(m.id)))) {
  const row = { id: m.id, name: m.name, base_url: m.base_url, passed: 0, answers: [] };
  for (const c of CASES) {
    const res = await client.askMiner(m.id, INTENT, c.params);
    const r = res.data?.result || {};
    const isActive = ["true", "active", "yes", "1"].includes(String(r.active).toLowerCase());
    const ok = res.ok && isActive && c.want.test(String(r.legal_name || r.name || ""));
    if (ok) row.passed++;
    row.answers.push({ company: c.params.company, status: res.status, legal_name: r.legal_name, id: r.registration_number || r.company_number || r.id, active: r.active, ok });
    if (!res.ok || !ok) break; // a miss on the first case is enough to drop it
  }
  console.log(`${row.passed}/${CASES.length}  ${String(m.id).padEnd(9)} ${m.name.slice(0, 50).padEnd(50)} ${m.base_url}`);
  rows.push(row);
}
fs.writeFileSync("data/registry-probe.json", JSON.stringify({ probedAt: new Date().toISOString(), intent: INTENT, rows }, null, 2));
