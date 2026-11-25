// Scores results.jsonl against the frozen cases. Run: node benchmarks/package-safety/score.mjs
// Decision: should an agent install this exact version? allow = vulnerable? no / block = yes.
//   vulnerable, malicious, does_not_exist -> block      not_affected, no_known_issue -> allow
// Exact: the reply must also name the category (malicious as malware, a missing package as missing).
// A "false safe" is allowing something that should be blocked: the costly mistake.
import fs from "node:fs";
const DIR = "benchmarks/package-safety";
const cases = Object.fromEntries(JSON.parse(fs.readFileSync(`${DIR}/cases.json`, "utf8")).map((c) => [c.id, c]));
const rows = fs.readFileSync(`${DIR}/results.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l));

const SHOULD = { vulnerable: "block", malicious: "block", does_not_exist: "block", not_affected: "allow", no_known_issue: "allow" };
const text = (r) => JSON.stringify(r.result ?? "").toLowerCase();
const MISSING = /not (published|found|exist)|does ?n[o']t exist|no such (package|version|release)|never published|unknown package|not on (npm|pypi|the registry)|has no [^ ]+ release|cannot be reviewed/;
// Correction (see annotate.mjs): a false-alarm version can still carry other advisories, and then blocking is right.
const notes = fs.existsSync(`${DIR}/annotations.json`) ? JSON.parse(fs.readFileSync(`${DIR}/annotations.json`, "utf8")).cases : {};
const shouldFor = (c) => (c.label === "not_affected" && notes[c.id] ? notes[c.id].installDecision : SHOULD[c.label]);
const MALWARE = /malware|malicious|cwe-506|backdoor|typosquat/;
const NOT_AFFECTED = /does not apply|not affected|false positive|is the (patched|fixed)|patched release|first fixed/;
function decide(r) {
  if (!r.ok || r.result == null) return "none";
  const t = text(r), v = String(r.result.verdict ?? "").toLowerCase();
  if (MISSING.test(t)) return "block";
  if (/insecure|needs changes|vulnerable|unsafe/.test(v)) return "block";
  if (/^secure$|safe/.test(v)) return "allow";
  return "none";
}
function exact(r, c) {
  const d = decide(r), t = text(r);
  if (c.label === "does_not_exist") return MISSING.test(t);
  if (c.label === "malicious") return d === "block" && MALWARE.test(t);
  if (c.label === "not_affected") {
    // Right decision, and it must not claim the flagged advisory applies.
    const flagged = (notes[c.id]?.flagged || "").toLowerCase();
    return d === shouldFor(c) && (NOT_AFFECTED.test(t) || !flagged || !t.includes(flagged));
  }
  return d === SHOULD[c.label];
}

const by = {};
for (const r of rows) {
  const c = cases[r.case];
  const m = (by[r.miner] ||= { n: 0, decision: 0, exact: 0, falseSafe: 0, falseAlarm: 0, none: 0, perLabel: {} });
  const d = decide(r), want = shouldFor(c);
  m.n++;
  if (d === want) m.decision++;
  if (exact(r, c)) m.exact++;
  if (d === "none") m.none++;
  if (want === "block" && d === "allow") m.falseSafe++;
  if (want === "allow" && d === "block") m.falseAlarm++;
  const p = (m.perLabel[c.label] ||= { n: 0, exact: 0 });
  p.n++; if (exact(r, c)) p.exact++;
}
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const table = Object.entries(by).map(([miner, m]) => ({ miner, answered: m.n, decisionPct: pct(m.decision, m.n), exactPct: pct(m.exact, m.n), falseSafe: m.falseSafe, falseAlarm: m.falseAlarm, noUsableAnswer: m.none, byCategory: Object.fromEntries(Object.entries(m.perLabel).map(([k, p]) => [k, `${p.exact}/${p.n}`])) })).sort((a, b) => b.decisionPct - a.decisionPct);
const casesDone = new Set(rows.map((r) => r.case)).size;
console.log(`scored ${rows.length} replies over ${casesDone} cases`);
for (const t of table) console.log(`${t.miner.padEnd(18)} decision ${String(t.decisionPct).padStart(3)}%  exact ${String(t.exactPct).padStart(3)}%  false-safe ${t.falseSafe}  false-alarm ${t.falseAlarm}  no-answer ${t.noUsableAnswer}  ${JSON.stringify(t.byCategory)}`);
const best = table[0];
if (casesDone === Object.keys(cases).length) console.log(best && best.decisionPct >= 90 ? `KILL: ${best.miner} already makes the right install decision ${best.decisionPct}% of the time` : `BUILD: the best miner (${best?.miner}) decides right only ${best?.decisionPct}% of the time`);
fs.writeFileSync(`${DIR}/scores.json`, JSON.stringify({ scoredAt: new Date().toISOString(), replies: rows.length, cases: casesDone, table }, null, 1));
