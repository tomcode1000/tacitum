// Re-screens a watchlist for adverse media (Tacitum's monitor), saves the run, prints what changed.
// Usage: node scripts/monitor.mjs [watchlists/uk-suppliers.json] [--pool] [--k 4]
// Run it daily (cron or systemd timer) for ongoing monitoring. Costs about $0.01 x names x k.
import "./config.mjs";
import fs from "node:fs";
import path from "node:path";
import { loadAccount } from "./config.mjs";
import { tacitum } from "../src/index.js";
import { diff, lastRun } from "../src/monitor.js";
import { privateKeyToAccount } from "viem/accounts";

const args = process.argv.slice(2);
const file = args.find((a) => a.endsWith(".json")) || "watchlists/uk-suppliers.json";
const k = Number(args[args.indexOf("--k") + 1]) || 4;
const list = path.basename(file, ".json");
const watchlist = JSON.parse(fs.readFileSync(file, "utf8"));

let pool = null;
if (args.includes("--pool")) {
  if (!process.env.TACITUM_RELAYER_KEY) throw new Error("--pool needs TACITUM_RELAYER_KEY (a separate wallet with Sepolia ETH)");
  pool = { relayer: privateKeyToAccount(process.env.TACITUM_RELAYER_KEY) };
}

const t = tacitum({ funder: loadAccount(), k, pool, log: console.log, maxTotalUsd: Number(process.env.TACITUM_MAX_TOTAL_USD || 2) });
const out = "assessments/monitor";
const previous = lastRun(out, list);
const run = await t.monitor(watchlist);
const changes = diff(previous, run.results);

fs.mkdirSync(out, { recursive: true });
const stamp = run.startedAt.slice(0, 16).replace(/:/g, "");
// Decoy names are not saved: only how many cover queries were bought.
fs.writeFileSync(path.join(out, `${list}-${stamp}.json`), JSON.stringify({ watchlist: list, ...run, changes }, null, 2));

console.log(`\n${list}: ${run.results.length} names, ${run.calls} paid calls (${run.coverCalls} cover), $${run.costUsd}`);
for (const r of run.results) console.log(`  ${r.verdict.padEnd(6)} ${r.name}${r.resultCount ? `  (${r.resultCount} items)` : ""}  ${r.signal ?? r.error ?? ""}`);
console.log(changes.length ? `changes since last run:\n${changes.map((c) => `  ${c.name}: ${c.change}`).join("\n")}` : "no changes since last run");
