// Screens every deposit still waiting in the pool through Telegraph sanctions, then approves or rejects.
// Usage: node scripts/pool-screen.mjs            one pass
//        node scripts/pool-screen.mjs --watch    every 60 s, for a hosted screener (others' deposits
//                                                are approved without anyone running a command)
import fs from "node:fs";
import { loadAccount } from "./config.mjs";
import { screenPending } from "../src/screener.js";
import { approvedLeaves } from "../src/pool.js";

const P = JSON.parse(fs.readFileSync("data/pool.json", "utf8"));
const WATCH = process.argv.includes("--watch");
const operator = loadAccount();

async function pass() {
  const results = await screenPending(operator, P.pool, P.deployBlock);
  if (!results.length) return 0;
  console.log(`${new Date().toISOString()} ${results.length} screened; approved set now ${(await approvedLeaves(P.pool, P.deployBlock)).length}`);
  fs.mkdirSync("data/screening", { recursive: true });
  fs.writeFileSync(`data/screening/${new Date().toISOString().slice(0, 16).replace(/:/g, "")}.json`, JSON.stringify(results.map(({ commitment, ...r }) => ({ ...r, commitment: commitment.toString() })), null, 2));
  return results.length;
}

if (!WATCH) {
  const n = await pass();
  if (!n) console.log("nothing pending");
} else {
  console.log(`watching ${P.pool} for deposits to screen`);
  for (;;) {
    try { await pass(); } catch (e) { console.error(`${new Date().toISOString()} screen pass failed: ${e.shortMessage || e.message}`); }
    await new Promise((r) => setTimeout(r, 60_000));
  }
}
