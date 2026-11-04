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
];

const mode = process.argv[2] || "score";
fs.mkdirSync("data/runs", { recursive: true });

if (mode === "run") {
  const client = createClient(loadAccount());
  for (const strategy of ["random", "matched"]) {
    for (const target of TARGETS) {
      const file = `data/runs/${strategy}-${target.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
      if (fs.existsSync(file)) continue;
      const run = await privateAssess(client, target, { k: K, strategy });
      const signals = [run.real, ...run.decoys].flatMap((a) => Object.values(a.checks).flatMap((c) => c.answers.map((x) => x.signal))).filter(Boolean);
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
  runs.push({ ...r, bundles: await features(rows) });
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
  row.learned = Number((learned.filter((g, i) => g === set[i].target).length / set.length).toFixed(3));
  row.runs = set.length;
  row.costUsd = Number(set.reduce((s, r) => s + r.costUsd, 0).toFixed(2));
  results.strategies[decoys] = row;
}

fs.writeFileSync("data/privacy-results.json", JSON.stringify(results, null, 2));
console.log(`\nAttacker success rate (chance = ${(1 / K).toFixed(2)} with k=${K})`);
console.table(results.strategies);
