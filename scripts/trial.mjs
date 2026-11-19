// Privacy trial, meant to run once or twice a day. Each run:
//   1. Spends one trial deposit made by an earlier run (chosen at random among those at least
//      MIN_AGE_H hours old) to fund a one-time payer, which buys a private assessment.
//   2. Runs the tracer on that purchase: public data only, can it find the deposit that paid?
//   3. Creates a brand-new desk wallet, mints it test USDC, and deposits it (gasless) for a later run.
//   4. Screens pending deposits.
// Results: data/trials/<time>.json and data/trials/summary.json (tracer hit rate against chance).
// Usage: node scripts/trial.mjs [--min-age-h 6]
import "./config.mjs";
import fs from "node:fs";
import path from "node:path";
import { parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { loadAccount } from "./config.mjs";
import { KEYS, usdcToken, usdcAbi, publicClient, walletClient } from "../src/config.js";
import { poolPayer } from "../src/payers.js";
import { newNote, saveNote, depositGasless, shutdown } from "../src/pool.js";
import { screenPending } from "../src/screener.js";
import { createClient } from "../src/telegraph.js";
import { privateAssess } from "../src/private.js";
import { FUNDING_SETTLE_MS } from "../src/index.js";
import { trace } from "../src/tracer.js";

const args = process.argv.slice(2);
const MIN_AGE_H = Number(args[args.indexOf("--min-age-h") + 1]) || 6;
const P = JSON.parse(fs.readFileSync("data/pool.json", "utf8"));
const operator = loadAccount(); // screener + relayer, as in the pool's normal operation
const TARGETS = JSON.parse(fs.readFileSync("watchlists/trial-targets.json", "utf8"));
const now = new Date();
const rec = { startedAt: now.toISOString(), pool: P.pool, minAgeH: MIN_AGE_H };
const DIR = "data/trials";
fs.mkdirSync(DIR, { recursive: true });

// 1 + 2. Spend an older trial deposit, then trace it.
let spentNote = null;
try {
  const payer = await poolPayer(operator, P, "trial", {
    pick: (notes) => {
      const ripe = notes.filter((n) => n.trial && Date.parse(n.createdAt) <= Date.now() - MIN_AGE_H * 3600e3);
      for (let i = ripe.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ripe[i], ripe[j]] = [ripe[j], ripe[i]]; }
      return ripe;
    },
  });
  spentNote = loadSpent(payer.account.address);
  const target = TARGETS[Math.floor(Math.random() * TARGETS.length)];
  const run = await privateAssess(createClient(payer.account), target, { k: 4, notBefore: payer.fundedAt + FUNDING_SETTLE_MS });
  const t = await trace(P.pool, P.deployBlock, payer.fundingTx, spentNote.commitment);
  rec.spend = {
    payer: payer.account.address, withdrawTx: payer.fundingTx, anonymitySet: payer.anonymitySet,
    depositAgeH: Math.round((Date.now() - Date.parse(spentNote.createdAt)) / 360e3) / 10,
    costUsd: run.costUsd, parties: run.parties.length,
    receipts: run.real?.receipts ? `${run.real.receipts.verified ?? "?"} of ${run.real.receipts.total ?? "?"}` : undefined,
  };
  rec.trace = t;
  console.log(`spent a ${rec.spend.depositAgeH}h-old deposit; payer ${payer.account.address}; set ${t.candidates}`);
  console.log(`tracer (chance ${t.chance.toFixed(3)}): latest ${t.latestDeposit.toFixed(3)} · latestApproval ${t.latestApproval.toFixed(3)} · oldest ${t.oldestDeposit.toFixed(3)} · sameRelayer ${t.sameRelayer.toFixed(3)} · freshest ${t.freshestDepositor.toFixed(3)}`);
} catch (e) {
  rec.spend = { skipped: e.message.slice(0, 200) };
  console.log(`no spend this run: ${rec.spend.skipped}`);
}

function loadSpent(payerAddr) {
  const p = JSON.parse(fs.readFileSync(path.join(KEYS, `${payerAddr}.json`), "utf8"));
  return JSON.parse(fs.readFileSync(p.note, "utf8"));
}

// 3. New desk wallet and deposit.
const key = generatePrivateKey();
const desk = privateKeyToAccount(key);
fs.mkdirSync(path.join(KEYS, "trials"), { recursive: true });
fs.writeFileSync(path.join(KEYS, "trials", `${desk.address}.json`), JSON.stringify({ address: desk.address, key, createdAt: now.toISOString() }, null, 2));
const USDC = await usdcToken();
const mintTx = await walletClient(operator).writeContract({ address: USDC, abi: usdcAbi, functionName: "mint", args: [desk.address, parseUnits(String(P.denominationUsd), 6)] });
await publicClient.waitForTransactionReceipt({ hash: mintTx, timeout: 600_000 });
const note = await newNote();
const depositTx = await depositGasless(desk, operator, P.pool, note);
saveNote(P.pool, note, { depositor: desk.address, depositTx, desk: true, trial: true, createdAt: new Date().toISOString() });
rec.deposit = { desk: desk.address, mintTx, depositTx };
console.log(`new desk ${desk.address} deposited (tx ${depositTx})`);

// 4. Screen.
const screened = await screenPending(operator, P.pool, P.deployBlock, () => {});
rec.screened = screened.map((s) => ({ verdict: s.verdict, miner: s.miner }));
await shutdown();

rec.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(DIR, `${rec.startedAt.slice(0, 16).replace(/:/g, "")}.json`), JSON.stringify(rec, null, 2));

// Summary across all trials: mean tracer score per heuristic against mean chance.
const all = fs.readdirSync(DIR).filter((f) => /^\d{4}-.*\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"))).filter((r) => r.trace);
const mean = (k) => (all.length ? all.reduce((s, r) => s + r.trace[k], 0) / all.length : null);
const summary = { trials: all.length, updatedAt: rec.finishedAt, chance: mean("chance"), latestDeposit: mean("latestDeposit"), latestApproval: mean("latestApproval"), oldestDeposit: mean("oldestDeposit"), sameRelayer: mean("sameRelayer"), freshestDepositor: mean("freshestDepositor") };
fs.writeFileSync(path.join(DIR, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
process.exit(0);
