// Scoring correction, made after the first look at replies and recorded here openly:
// a "scanner false alarm" case names one advisory that does not affect the version, but the same
// version can still be affected by OTHER advisories. For those, blocking is the right install decision.
// This file looks up every advisory OSV lists for each such version. cases.json stays unchanged.
// Run: node benchmarks/package-safety/annotate.mjs
import fs from "node:fs";
const DIR = "benchmarks/package-safety";
const cases = JSON.parse(fs.readFileSync(`${DIR}/cases.json`, "utf8"));
const ECO = { npm: "npm", pypi: "PyPI" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function osv(eco, name, version) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch("https://api.osv.dev/v1/query", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ package: { name, ecosystem: ECO[eco] }, version }), signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(String(r.status));
      return ((await r.json()).vulns || []).filter((v) => !v.withdrawn);
    } catch (e) { if (i >= 30) throw e; await sleep(Math.min(30000, 3000 * i)); }
  }
}
const out = {};
for (const c of cases.filter((x) => x.label === "not_affected")) {
  const flagged = c.target.match(/GHSA-[a-z0-9-]+/i)[0];
  const vulns = await osv(c.ecosystem, c.package, c.version);
  const other = vulns.filter((v) => v.id !== flagged && !(v.aliases || []).includes(flagged));
  out[c.id] = { flagged, otherAdvisories: other.map((v) => v.id), otherAliases: other.flatMap((v) => v.aliases || []), installDecision: other.length ? "block" : "allow" };
  console.log(c.id, c.package, c.version, "other advisories:", other.length);
}
fs.writeFileSync(`${DIR}/annotations.json`, JSON.stringify({ note: "not_affected cases: advisories other than the flagged one, from OSV at scoring time", at: new Date().toISOString(), cases: out }, null, 1));
