// Private mode v0: one counterparty, assessed among k-1 matched decoys, paid by a one-time wallet.
// Usage: npm run private -- "Barclays PLC" GB [k]
import fs from "node:fs";
import { loadAccount } from "./config.mjs";
import { createClient } from "../src/telegraph.js";
import { privateAssess } from "../src/private.js";
import { oneTimePayer, poolPayer, savedPayer, escrowBalance } from "../src/payers.js";
import { renderMemo } from "../src/memo.js";

// Funding: default = desk funds the payer directly (v0, linkable). --pool = withdraw from the
// screened pool (P4). --payer <address> = reuse a payer already funded.
const argv = process.argv.slice(2);
const flag = (f) => { const i = argv.indexOf(f); if (i < 0) return undefined; const v = argv[i + 1]; argv.splice(i, v && !v.startsWith("--") ? 2 : 1); return v && !v.startsWith("--") ? v : true; };
const usePool = flag("--pool");
const reuse = flag("--payer");
const [name, jurisdiction = "GB", kArg = "4"] = argv;
if (!name) {
  console.error('Usage: npm run private -- "<company name>" <jurisdiction> [k]');
  process.exit(1);
}
const k = Number(kArg);
// 6-7 calls per party at $0.01 (13 Nov prices), plus headroom for a fallback miner.
const fundUsd = (0.1 * k).toFixed(2);

const poolInfo = (usePool || reuse) && fs.existsSync("data/pool.json") ? JSON.parse(fs.readFileSync("data/pool.json", "utf8")) : null;
const payer = reuse ? savedPayer(reuse)
  : usePool ? await poolPayer(loadAccount(), poolInfo, `private assessment via pool, k=${k}`)
  : await oneTimePayer(loadAccount(), fundUsd, `private assessment, k=${k}`);
if (payer.viaPool || (poolInfo && payer.funder?.toLowerCase() === poolInfo.pool.toLowerCase())) {
  payer.viaPool = true;
  if (payer.anonymitySet == null) {
    const { approvedLeaves } = await import("../src/pool.js");
    payer.anonymitySet = (await approvedLeaves(poolInfo.pool, poolInfo.deployBlock)).length;
  }
}
console.log(`one-time payer ${payer.account.address}, escrow funded with $${payer.amountUsd} by ${payer.viaPool ? "the screened pool" : "the desk"} (tx ${payer.fundingTx})`);

// 13 Nov: a payer called ~80 s after funding worked; one called within seconds was refused
// ("available=0") for the rest of the epoch. Wait 2 minutes, picking decoys meanwhile.
const run = await privateAssess(createClient(payer.account), { name, jurisdiction }, { k, notBefore: payer.fundedAt + 120_000 });
if (!run.costUsd) {
  console.error("No call was paid; not writing a memo.");
  process.exit(1);
}

const results = JSON.parse(fs.readFileSync("data/privacy-results.json", "utf8"));
const m = results.k === k ? results.strategies.matched : null;
const measured = m && { best: Math.max(m.first, m.famous, m.format, m.learned, m.rarest ?? 0).toFixed(2), ci: m.bestCI95, runs: m.runs };

const real = {
  ...run.real,
  privacy: { k, parties: run.parties, costUsd: run.costUsd, funder: payer.funder, fundedUsd: payer.amountUsd, fundingTx: payer.fundingTx, measured, viaPool: Boolean(payer.viaPool || (poolInfo && payer.funder?.toLowerCase() === poolInfo.pool.toLowerCase())), anonymitySet: payer.anonymitySet },
};
const memo = renderMemo(real);

const slug = `${new Date().toISOString().slice(0, 10)}-private-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
fs.mkdirSync("assessments", { recursive: true });
fs.writeFileSync(`assessments/${slug}.md`, memo);
// The full record, decoys included, is what an auditor would open (P5 encrypts it).
fs.writeFileSync(`assessments/${slug}.json`, JSON.stringify({ ...run, real }, null, 2));

console.log(memo);
// Escrow calls are debited when the node settles, not per call, so this can still show the full deposit.
console.log(`one-time escrow balance now: $${await escrowBalance(payer.account.address)} (debits settle later)`);
console.log(`Saved assessments/${slug}.md and .json`);
