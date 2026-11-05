// Privacy experiment. Runs private assessments for a list of targets with naive (random)
// and matched decoys, then scores every attacker strategy against them.
//   node scripts/experiment.mjs run      paid: buys the assessments, saves data/runs/*.json
//   node scripts/experiment.mjs score    free: re-scores saved runs, writes data/privacy-results.json
import fs from "node:fs";
import { loadAccount } from "./config.mjs";
import { createClient } from "../src/telegraph.js";
import { privateAssess } from "../src/private.js";
import { observe, features, STRATEGIES, learnedGuesses } from "../src/attacker.js";

const K = 4;
// A desk's mix: well-known listed names and obscure private companies, typed the way a person types them.
const TARGETS = [
  { name: "Barclays PLC", jurisdiction: "GB" },
  { name: "Vodafone Group PLC", jurisdiction: "GB" },
  { name: "Tesco PLC", jurisdiction: "GB" },
  { name: "Rolls-Royce Holdings PLC", jurisdiction: "GB" },
  { name: "Satobe Limited", jurisdiction: "GB" },
  { name: "Zakhs Holdings Ltd", jurisdiction: "GB" },
  { name: "Three Shires Property Investment Limited", jurisdiction: "GB" },
  { name: "Hillside Housing Trust Limited", jurisdiction: "GB" },
  // Second batch (matched only: random decoys already lose every run).
  { name: "HSBC Holdings PLC", jurisdiction: "GB", matchedOnly: true },
  { name: "Unilever PLC", jurisdiction: "GB", matchedOnly: true },
  { name: "AstraZeneca PLC", jurisdiction: "GB", matchedOnly: true },
  { name: "Lloyds Banking Group PLC", jurisdiction: "GB", matchedOnly: true },
  { name: "Petrocell Holdings Limited", jurisdiction: "GB", matchedOnly: true },
  { name: "Recircle Consulting Limited", jurisdiction: "GB", matchedOnly: true },
  { name: "Barton Fabrications Limited", jurisdiction: "GB", matchedOnly: true },
  { name: "Klicco Limited", jurisdiction: "GB", matchedOnly: true },
];

// 95% Wilson interval for a success rate.
function wilson(hits, n, z = 1.96) {
  const p = hits / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Number((c - h).toFixed(2)), Number((c + h).toFixed(2))];
}

const mode = process.argv[2] || "score";
fs.mkdirSync("data/runs", { recursive: true });

if (mode === "run") {
  const client = createClient(loadAccount());
  for (const strategy of ["random", "matched"]) {
    for (const target of TARGETS.filter((t) => strategy === "matched" || !t.matchedOnly)) {
      const file = `data/runs/${strategy}-${target.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
      if (fs.existsSync(file)) continue;
      const run = await privateAssess(client, target, { k: K, strategy });
      const signals = [run.real, ...run.decoys].flatMap((a) => Object.values(a.checks).flatMap((c) => c.answers.map((x) => x.signal))).filter(Boolean);
      // A run caught by a node outage says nothing about privacy; leave it unsaved so the next `run` redoes it.
      if (signals.length < K * 3) {
        console.log(`skipped  ${target.name}: only ${signals.length} answered calls`);
        continue;
      }
      fs.writeFileSync(file, JSON.stringify({ strategy, k: K, target: target.name, parties: run.parties, costUsd: run.costUsd, signals, order: run.order }, null, 2));
      console.log(`${strategy.padEnd(8)} ${target.name.padEnd(42)} $${run.costUsd}  [${run.parties.join(" | ")}]`);
    }
  }
}

// Score: rebuild what the observer sees for each saved run, then let each strategy guess.
const runs = [];
for (const f of fs.readdirSync("data/runs").filter((f) => f.endsWith(".json"))) {
  const r = JSON.parse(fs.readFileSync(`data/runs/${f}`, "utf8"));
  const rows = await observe(r.signals);
  const bundles = await features(rows);
  if (bundles.length !== r.parties.length) continue; // incomplete run: some party got no answered call
  runs.push({ ...r, bundles });
}

const results = { k: K, chance: 1 / K, scoredAt: new Date().toISOString(), strategies: {} };
for (const decoys of ["random", "matched"]) {
  const set = runs.filter((r) => r.strategy === decoys);
  if (!set.length) continue;
  const row = {};
  for (const [name, guess] of Object.entries(STRATEGIES)) {
    // Ties are broken at random, so average several passes.
    let hits = 0;
    for (let p = 0; p < 50; p++) hits += set.filter((r) => guess(r.bundles).entity === r.target).length;
    row[name] = Number((hits / (50 * set.length)).toFixed(3));
  }
  const learned = learnedGuesses(set);
  const learnedHits = learned.filter((g, i) => g === set[i].target).length;
  row.learned = Number((learnedHits / set.length).toFixed(3));
  // The best attacker sets the privacy level, so report its interval.
  const best = Math.max(...Object.values(row));
  row.bestCI95 = wilson(Math.round(best * set.length), set.length);
  row.runs = set.length;
  row.costUsd = Number(set.reduce((s, r) => s + r.costUsd, 0).toFixed(2));
  results.strategies[decoys] = row;
}

fs.writeFileSync("data/privacy-results.json", JSON.stringify(results, null, 2));
console.log(`\nAttacker success rate (chance = ${(1 / K).toFixed(2)} with k=${K})`);
console.table(results.strategies);
