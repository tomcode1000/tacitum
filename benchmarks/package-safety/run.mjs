// Runs the frozen cases against the top five SECURITY_REVIEW miners. Resumable; hard budget.
// Run: node benchmarks/package-safety/run.mjs
import "../../scripts/config.mjs";
import fs from "node:fs";
import crypto from "node:crypto";
import { parseUnits } from "viem";
import { loadAccount } from "../../scripts/config.mjs";
import { publicClient, walletClient, usdcAbi, usdcToken } from "../../src/config.js";
import { oneTimePayer, savedPayer } from "../../src/payers.js";
import { createClient } from "../../src/telegraph.js";

const DIR = "benchmarks/package-safety";
const MINERS = { 9002: "txlens", 20260828: "a1-preflight", 905227: "salence", 302: "chainsight-oracle", 4433: "livecert" };
const INTENT = "SECURITY_REVIEW_GENERAL";
const BUDGET_USD = 5.5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const body = fs.readFileSync(`${DIR}/cases.json`, "utf8");
const frozen = JSON.parse(fs.readFileSync(`${DIR}/cases.sha256.json`, "utf8"));
if (crypto.createHash("sha256").update(body).digest("hex") !== frozen.sha256) throw new Error("cases.json changed after it was frozen");
const cases = JSON.parse(body);

const OUT = `${DIR}/results.jsonl`;
const done = new Map();
if (fs.existsSync(OUT)) for (const l of fs.readFileSync(OUT, "utf8").split("\n").filter(Boolean)) { const r = JSON.parse(l); done.set(`${r.case}:${r.minerId}`, r); }
let spent = [...done.values()].reduce((s, r) => s + (r.costUsd || 0), 0);

const STATE = `${DIR}/payer.json`;
const operator = loadAccount();
let payer;
if (fs.existsSync(STATE)) payer = savedPayer(JSON.parse(fs.readFileSync(STATE, "utf8")).address);
else {
  const token = await usdcToken();
  const mint = await walletClient(operator).writeContract({ address: token, abi: usdcAbi, functionName: "mint", args: [operator.address, parseUnits("6", 6)] });
  await publicClient.waitForTransactionReceipt({ hash: mint, timeout: 600_000 });
  payer = await oneTimePayer(operator, BUDGET_USD.toFixed(2), "package-safety benchmark");
  fs.writeFileSync(STATE, JSON.stringify({ address: payer.account.address, fundingTx: payer.fundingTx }, null, 1));
  console.log(`benchmark payer ${payer.account.address} funded; waiting for the node to see it`);
  await sleep(130_000);
}
const client = createClient(payer.account);

const NET = /ENOTFOUND|ECONNRESET|ETIMEDOUT|UND_ERR|fetch failed|timeout|aborted|EAI_AGAIN/i;
for (const c of cases) for (const [id, slug] of Object.entries(MINERS)) {
  const key = `${c.id}:${id}`;
  if (done.has(key)) continue;
  if (spent + 0.01 > BUDGET_USD) { console.log(`budget reached at $${spent.toFixed(2)}; stopping`); process.exit(0); }
  let res, error, t0;
  for (let attempt = 1; attempt <= 12; attempt++) {
    t0 = Date.now(); error = undefined;
    try { res = await client.askMiner(Number(id), INTENT, { target: c.target }); }
    catch (e) { res = null; error = e.shortMessage || e.message; }
    const text = String(error ?? (res && !res.ok ? res.data?.error : "") ?? "");
    if (!NET.test(text)) break;
    await sleep(Math.min(30000, 4000 * attempt));
  }
  const rec = { case: c.id, minerId: Number(id), miner: slug, at: new Date().toISOString(), ms: Date.now() - t0, ok: Boolean(res?.ok && res.data?.result != null), status: res?.status ?? null, result: res?.data?.result ?? null, error: error ?? (res?.ok ? undefined : String(res?.data?.error ?? "").slice(0, 300)), signal: res?.data?.signal_hash ?? null, costUsd: res?.ok ? Number(res.data?.cost_usd || 0) : 0 };
  fs.appendFileSync(OUT, JSON.stringify(rec) + "\n");
  done.set(key, rec);
  spent += rec.costUsd;
  if (done.size % 25 === 0) console.log(`${done.size}/${cases.length * 5} calls, $${spent.toFixed(2)}`);
}
console.log(`finished: ${done.size} calls, $${spent.toFixed(2)}`);
process.exit(0);
