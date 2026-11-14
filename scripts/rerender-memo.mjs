// Re-verify a saved assessment's receipts against Telegraph's public record and re-render its memo.
// Free: no calls are bought. Usage: node scripts/rerender-memo.mjs assessments/<slug>.json
import fs from "node:fs";
import "./config.mjs";
import { publicRecord } from "../src/telegraph.js";
import { renderMemo } from "../src/memo.js";
import { approvedLeaves } from "../src/pool.js";

const file = process.argv[2];
const rec = JSON.parse(fs.readFileSync(file, "utf8"));
const real = rec.real;

// Rebuilt from the answers themselves, so it works even if the saved list is incomplete.
const answers = Object.values(real.checks).flatMap((c) => c.answers.filter((a) => a.signal));
real.verification = [];
for (const v of answers) {
  const pub = await publicRecord(v.signal, { waitMs: 60_000 });
  real.verification.push({
    signal: v.signal,
    found: Boolean(pub),
    payerMatches: pub?.signal?.wallet_address?.toLowerCase() === real.payer.toLowerCase(),
    txMatches: !v.tx || pub?.signal?.tx_hash?.toLowerCase() === v.tx.toLowerCase(),
    publicQuestion: pub?.payload?.request,
  });
}

const p = real.privacy;
const pool = fs.existsSync("data/pool.json") ? JSON.parse(fs.readFileSync("data/pool.json", "utf8")) : null;
if (pool && p.funder?.toLowerCase() === pool.pool.toLowerCase()) {
  p.viaPool = true;
  p.anonymitySet ??= (await approvedLeaves(pool.pool, pool.deployBlock)).length;
}

const ok = real.verification.filter((r) => r.found && r.payerMatches && r.txMatches).length;
fs.writeFileSync(file, JSON.stringify(rec, null, 2));
fs.writeFileSync(file.replace(/\.json$/, ".md"), renderMemo(real));
console.log(`${ok} of ${real.verification.length} receipts verified; rewrote ${file.replace(/\.json$/, ".md")}`);
