// Runs supplier checks before payment release. Usage:
//   node scripts/supplier-check.mjs cases/supplier/1-siemens-clean.json [more.json ...] [--open]
// Default: each run is paid by a fresh one-time payer (Tacitum), so the feed does not show who asked.
// --open pays from the operator wallet directly (the no-privacy baseline).
// Writes assessments/supplier/<case>-<time>.json and .md, and prints the decision against the expected one.
import "./config.mjs";
import fs from "node:fs";
import path from "node:path";
import { loadAccount } from "./config.mjs";
import { createClient } from "../src/telegraph.js";
import { oneTimePayer } from "../src/payers.js";
import { FUNDING_SETTLE_MS } from "../src/index.js";
import { supplierCheck, renderSupplier } from "../src/supplier.js";

const args = process.argv.slice(2);
const files = args.filter((a) => a.endsWith(".json"));
const open = args.includes("--open");
const operator = loadAccount();
const out = "assessments/supplier";
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let client, payer = null;
if (open) client = createClient(operator);
else {
  const p = await oneTimePayer(operator, (0.16 * files.length + 0.04).toFixed(2), "supplier-check");
  payer = p.account.address;
  client = createClient(p.account);
  const wait = p.fundedAt + FUNDING_SETTLE_MS - Date.now();
  if (wait > 0) { console.log(`one-time payer ${payer} funded; waiting ${Math.round(wait / 1000)}s for the node to see it`); await sleep(wait); }
}

const summary = [];
for (const f of files) {
  const c = JSON.parse(fs.readFileSync(f, "utf8"));
  const r = await supplierCheck(client, c);
  const name = path.basename(f, ".json");
  const stamp = new Date().toISOString().slice(0, 16).replace(/:/g, "");
  const { raw, ...pub } = r;
  fs.writeFileSync(path.join(out, `${name}-${stamp}.json`), JSON.stringify({ case: name, title: c.title, expect: c.expect, payer: open ? operator.address : payer, mode: open ? "open" : "one-time payer", ...pub, raw }, null, 2));
  fs.writeFileSync(path.join(out, `${name}-${stamp}.md`), `${c.title}\n\n${renderSupplier(r)}\n`);
  const hit = r.decision === c.expect;
  summary.push({ case: name, expect: c.expect, decision: r.decision, hit, why: [...r.failed, ...r.missing].map((k) => `${k}: ${r.results[k].why}`).join(" | "), costUsd: r.costUsd, seconds: r.seconds });
  console.log(`${hit ? "✓" : "✗"} ${name.padEnd(28)} expected ${c.expect.padEnd(7)} got ${r.decision.padEnd(7)} $${r.costUsd} ${r.seconds}s  ${summary.at(-1).why}`);
}
fs.writeFileSync(path.join(out, `summary-${new Date().toISOString().slice(0, 16).replace(/:/g, "")}.json`), JSON.stringify({ mode: open ? "open" : "one-time payer", payer, results: summary }, null, 2));
console.log(`${summary.filter((s) => s.hit).length} of ${summary.length} decisions as expected`);
process.exit(0);
