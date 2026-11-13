// Splits the surveyed SEC filers into fixed cover sets of 4. Filers are too few for greedy picking:
// each famous filer target took the nearest ones, so the same names recurred across bundles and
// the target was the name seen least often. A partition gives every filer exactly one set.
// Sets already used on the live feed are kept as they are; the rest are split so that the widest
// fame + filings gap inside any set is as small as possible (exhaustive search).
// Usage: node scripts/filer-covers.mjs   (free: reads data/filers.json and the fame cache)
import fs from "node:fs";
import path from "node:path";
import { HOME, SHIPPED } from "./config.mjs";
import { fameHits } from "../src/decoys.js";

const K = 4;
const COVERS = path.join(HOME, "cover-sets.json");
const level = (x) => Math.log10(1 + x);
const lc = (s) => s.toLowerCase();

const filers = JSON.parse(fs.readFileSync(fs.existsSync(path.join(HOME, "filers.json")) ? path.join(HOME, "filers.json") : path.join(SHIPPED, "filers.json"), "utf8"));
const names = Object.keys(filers).filter((n) => filers[n] > 0);
const point = {};
for (const n of names) point[lc(n)] = [level(await fameHits(n)), level(filers[n])];

const covers = JSON.parse(fs.readFileSync(COVERS, "utf8"));
const live = covers.filter((s) => s.live);
const fixed = new Set(live.flatMap((s) => s.members.map(lc)));
const free = names.filter((n) => !fixed.has(lc(n)));
if (free.length % K) throw new Error(`${free.length} free filers do not split into sets of ${K}`);

const gap = (a, b) => Math.abs(point[lc(a)][0] - point[lc(b)][0]) + Math.abs(point[lc(a)][1] - point[lc(b)][1]);
const spread = (set) => Math.max(...set.flatMap((a, i) => set.slice(i + 1).map((b) => gap(a, b))));

let best = { cost: Infinity, sets: null };
function search(rest, sets, worst) {
  if (worst >= best.cost) return;
  if (!rest.length) return void (best = { cost: worst, sets: sets.map((s) => [...s]) });
  const [first, ...others] = rest;
  // Choose the 3 companions of the first remaining name.
  const choose = (from, picked, start) => {
    if (picked.length === K - 1) {
      const set = [first, ...picked];
      search(others.filter((n) => !picked.includes(n)), [...sets, set], Math.max(worst, spread(set)));
      return;
    }
    for (let i = start; i < from.length; i++) choose(from, [...picked, from[i]], i + 1);
  };
  choose(others, [], 0);
}
search(free, [], 0);

const at = new Date().toISOString();
const filerSets = best.sets.map((members) => ({ jurisdiction: "GB", members, createdAt: at, note: "filer partition" }));
// Drop earlier greedy sets that contain a filer; they overlap the partition.
const kept = covers.filter((s) => s.live || !s.members.some((m) => names.some((n) => lc(n) === lc(m))));
fs.writeFileSync(COVERS, JSON.stringify([...kept, ...filerSets], null, 2));

for (const s of [...live, ...filerSets]) console.log(`spread ${spread(s.members).toFixed(2)}  ${s.members.join(" | ")}${s.live ? "  (live)" : ""}`);
console.log(`worst spread in the new sets: ${best.cost.toFixed(2)}; kept ${kept.length} sets, wrote ${filerSets.length}`);
