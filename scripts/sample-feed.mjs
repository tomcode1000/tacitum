// Samples the public question feed and writes aggregate statistics only
// (data/feed-stats.json): which intents users buy, how names are typed, how calls are
// spaced. Raw rows stay in data/feed-raw/ (git-ignored); other users' questions are never committed.
import fs from "node:fs";
import { NODE } from "./config.mjs";

const PAGES = Number(process.argv[2] || 10);
const rows = [];
for (let p = 0; p < PAGES; p++) {
  const res = await fetch(`${NODE}/daemon/api/questions?limit=100&offset=${p * 100}`);
  if (!res.ok) break;
  const page = (await res.json()).results || [];
  rows.push(...page);
  if (page.length < 100) break;
}

const seen = new Set();
const user = rows.filter((r) => r.source === "user" && !seen.has(r.id) && seen.add(r.id));
fs.mkdirSync("data/feed-raw", { recursive: true });
fs.writeFileSync(`data/feed-raw/${Date.now()}.json`, JSON.stringify(user));

const count = (xs) => xs.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {});
const intents = count(user.map((r) => r.routing?.intent || "unrouted"));

const names = user
  .map((r) => r.question?.text?.split("→")[1])
  .filter(Boolean)
  .map((j) => {
    try {
      const p = JSON.parse(j);
      return p.name ?? p.company ?? p.entity ?? null;
    } catch {
      return null;
    }
  })
  .filter((n) => typeof n === "string" && /[a-z]/i.test(n));
const style = count(names.map((n) => (n === n.toUpperCase() ? "UPPER" : n === n.toLowerCase() ? "lower" : "Mixed")));
const suffix = count(names.map((n) => (n.match(/\s(plc|ltd\.?|limited|inc\.?|llc|corp\.?|group|holdings)$/i)?.[1]?.toLowerCase() ?? "none")));

const times = user.map((r) => Date.parse(r.created_at)).sort((a, b) => a - b);
const gaps = times.slice(1).map((t, i) => (t - times[i]) / 1000).sort((a, b) => a - b);
const q = (p) => gaps[Math.floor(p * (gaps.length - 1))] ?? null;

const stats = {
  sampledAt: new Date().toISOString(),
  window: { from: new Date(times[0]).toISOString(), to: new Date(times.at(-1)).toISOString() },
  userQuestions: user.length,
  intents: Object.fromEntries(Object.entries(intents).sort((a, b) => b[1] - a[1])),
  entityNames: { total: names.length, style, suffix },
  gapSeconds: { p10: q(0.1), median: q(0.5), p90: q(0.9) },
};
fs.writeFileSync("data/feed-stats.json", JSON.stringify(stats, null, 2));
console.log(JSON.stringify(stats, null, 2));
