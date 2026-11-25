// Builds the frozen kill-test set BEFORE any miner is called. Answers come from OSV and the official
// npm / PyPI registries. Run: node benchmarks/package-safety/make-cases.mjs
// Labels: vulnerable | not_affected | no_known_issue | malicious | does_not_exist
import fs from "node:fs";
import crypto from "node:crypto";

const DIR = "benchmarks/package-safety";
const SEED = "tacitum-package-safety-v1";
let counter = 0;
const rand = () => { const h = crypto.createHash("sha256").update(`${SEED}:${counter++}`).digest(); return h.readUInt32BE(0) / 2 ** 32; };
const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(url, opts = {}) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(30000) });
      if (r.status === 404) return { status: 404, json: null };
      if (!r.ok) throw new Error(`${url} ${r.status}`);
      return { status: r.status, json: await r.json() };
    } catch (e) { if (i >= 30) throw e; await sleep(Math.min(30000, 3000 * i)); }
  }
}
const OSV = { npm: "npm", pypi: "PyPI" };
async function osv(eco, name, version) {
  const out = [];
  let page_token;
  do {
    const body = { package: { name, ecosystem: OSV[eco] }, ...(version ? { version } : {}), ...(page_token ? { page_token } : {}) };
    const { json } = await req("https://api.osv.dev/v1/query", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    out.push(...(json?.vulns || []));
    page_token = json?.next_page_token;
  } while (page_token);
  return out.filter((v) => !v.withdrawn);
}
const encodeName = (n) => n.startsWith("@") ? n.replace("/", "%2f") : n;
async function registry(eco, name) {
  const { status, json } = await req(eco === "npm" ? `https://registry.npmjs.org/${encodeName(name)}` : `https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
  if (status === 404) return null;
  if (eco === "npm") return { latest: json["dist-tags"]?.latest, versions: Object.keys(json.versions || {}), unpublished: Boolean(json.time?.unpublished) };
  return { latest: json.info?.version, versions: Object.keys(json.releases || {}).filter((v) => json.releases[v]?.length), unpublished: false };
}
const purl = (eco, name, version) => `pkg:${eco}/${name.replace("@", "%40")}@${version}`;
const STABLE = /^\d+(\.\d+)*$/;
const cmp = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
const isMal = (v) => /^MAL-/.test(v.id) || /malware|malicious|backdoor/i.test(`${v.summary || ""}`);

const POPULAR = {
  npm: ["lodash", "minimist", "axios", "express", "jquery", "moment", "node-fetch", "ws", "tar", "semver", "json5", "qs", "handlebars", "ejs", "marked", "shell-quote", "follow-redirects", "ansi-regex", "glob-parent", "nanoid", "jsonwebtoken", "underscore", "serialize-javascript", "postcss", "vite"],
  pypi: ["django", "flask", "requests", "urllib3", "jinja2", "pyyaml", "pillow", "cryptography", "werkzeug", "numpy", "aiohttp", "tornado", "sqlparse", "paramiko", "twisted", "scrapy", "gunicorn", "lxml", "certifi", "setuptools"],
};
const MAL_SEEDS = [["npm", "flatmap-stream", "0.1.1"], ["npm", "event-stream", "3.3.6"], ["npm", "ua-parser-js", "0.7.29"], ["npm", "coa", "2.0.3"], ["npm", "rc", "1.2.9"], ["npm", "node-ipc", "10.1.1"], ["npm", "eslint-scope", "3.7.2"], ["npm", "crossenv", "1.0.0"], ["npm", "cross-env.js", "0.0.1"], ["npm", "getcookies", "1.0.0"], ["npm", "bootstrap-sass", "3.2.0.3"], ["npm", "peacenotwar", "9.1.6"], ["npm", "discord.dll", "1.0.0"], ["npm", "fallguys", "1.0.0"], ["npm", "twilio-npm", "1.0.1"], ["npm", "electorn", "1.0.0"], ["npm", "loadyaml", "1.0.0"], ["pypi", "ctx", "0.2.2"], ["pypi", "colourama", "0.3.9"], ["pypi", "python3-dateutil", "2.8.1"], ["pypi", "jeIlyfish", "0.7.1"], ["pypi", "ssh-decorate", "0.0.1"], ["pypi", "acqusition", "1.0.0"], ["pypi", "diango", "1.0.0"], ["pypi", "setup-tools", "1.0.0"], ["pypi", "urllib", "1.21.1"], ["pypi", "pytagora", "1.0"]];
const FAKE_NAMES = { npm: ["react-secure-auth-helper", "express-jwt-validator-pro", "lodash-deep-safe-merge", "axios-retry-queue-plus", "next-auth-session-guard", "vite-plugin-env-sentry-lite", "node-crypto-hash-utils-v2", "fastify-rate-guard-core", "prisma-soft-delete-kit-pro", "tailwind-merge-utils-plus"], pypi: ["flask-secure-jwt-helper", "django-rest-auth-guard", "pandas-safe-merge-utils", "requests-retry-queue-plus", "fastapi-session-guard-lite", "numpy-fast-hash-utils", "pydantic-env-sentry", "langchain-memory-guard-pro", "sqlalchemy-soft-delete-kit", "openai-retry-wrapper-plus"] };

const cases = [];
const add = (category, label, eco, name, version, target, evidence) => cases.push({ category, label, ecosystem: eco, package: name, version, target, evidence });

// Vulnerable and patched pairs from real advisories with a clean introduced/fixed range.
const pairs = [];
for (const eco of ["npm", "pypi"]) for (const name of POPULAR[eco]) {
  const reg = await registry(eco, name);
  if (!reg) continue;
  const vulns = shuffle((await osv(eco, name)).filter((v) => v.id.startsWith("GHSA-") && !isMal(v)));
  for (const v of vulns.slice(0, 8)) {
    const aff = (v.affected || []).find((a) => a.package?.name?.toLowerCase() === name.toLowerCase() && a.package?.ecosystem === OSV[eco]);
    const range = aff?.ranges?.find((r) => r.type === "ECOSYSTEM" || r.type === "SEMVER");
    const fixed = range?.events?.find((e) => e.fixed)?.fixed;
    const introduced = range?.events?.find((e) => e.introduced)?.introduced;
    if (!fixed || introduced == null || !STABLE.test(fixed) || !reg.versions.includes(fixed) || range.events.filter((e) => e.introduced).length !== 1) continue;
    // OSV often gives only a range: take the newest stable release inside it, then confirm both sides with OSV below.
    const bad = reg.versions.filter((x) => STABLE.test(x) && cmp(x, fixed) < 0 && (introduced === "0" || !STABLE.test(introduced) || cmp(x, introduced) >= 0)).sort(cmp).at(-1);
    if (!bad) continue;
    const atBad = await osv(eco, name, bad);
    const atFixed = await osv(eco, name, fixed);
    if (!atBad.some((x) => x.id === v.id) || atFixed.some((x) => x.id === v.id)) continue;
    pairs.push({ eco, name, bad, fixed, id: v.id });
    break;
  }
  console.log("checked", eco, name, pairs.length);
}
for (const p of shuffle(pairs).slice(0, 30)) add("known_vulnerable", "vulnerable", p.eco, p.name, p.bad, purl(p.eco, p.name, p.bad), `OSV lists ${p.id} for this version; fixed in ${p.fixed}`);
for (const p of shuffle(pairs).slice(0, 25)) add("scanner_false_alarm", "not_affected", p.eco, p.name, p.fixed, `Our scanner flags ${p.id} on ${p.name} ${p.fixed} (${p.eco}). Is this exact version affected by that advisory?`, `${p.fixed} is the first fixed version of ${p.id} in OSV`);

// Current releases with no known advisory.
const clean = [];
for (const eco of ["npm", "pypi"]) for (const name of POPULAR[eco]) {
  const reg = await registry(eco, name);
  if (!reg?.latest || /[-]|rc|a\d|b\d/i.test(reg.latest)) continue;
  if (!(await osv(eco, name, reg.latest)).length) clean.push({ eco, name, version: reg.latest });
}
for (const c of shuffle(clean).slice(0, 15)) add("current_clean", "no_known_issue", c.eco, c.name, c.version, purl(c.eco, c.name, c.version), "latest registry release; OSV lists no advisory for it");

// Malicious releases confirmed by OSV.
const mal = [];
for (const [eco, name, version] of MAL_SEEDS) {
  const hits = (await osv(eco, name, version)).filter(isMal);
  if (hits.length) mal.push({ eco, name, version, id: hits[0].id });
}
for (const m of shuffle(mal).slice(0, 15)) add("malicious", "malicious", m.eco, m.name, m.version, purl(m.eco, m.name, m.version), `OSV ${m.id} marks this release as malicious`);

// Packages and versions that do not exist (what an agent invents).
const fake = [];
for (const eco of ["npm", "pypi"]) for (const name of FAKE_NAMES[eco]) if (!(await registry(eco, name))) fake.push({ eco, name, version: "1.0.0", why: "package is not on the registry" });
for (const [eco, name, version] of [["npm", "lodash", "99.0.0"], ["npm", "express", "9.9.9"], ["npm", "axios", "42.0.0"], ["pypi", "django", "99.0"], ["pypi", "requests", "42.0.0"], ["pypi", "flask", "99.1.0"]]) {
  const reg = await registry(eco, name);
  if (reg && !reg.versions.includes(version)) fake.push({ eco, name, version, why: "package exists; this version was never published" });
}
for (const f of shuffle(fake).slice(0, 15)) add("does_not_exist", "does_not_exist", f.eco, f.name, f.version, purl(f.eco, f.name, f.version), f.why);

const frozen = shuffle(cases).map((c, i) => ({ id: i + 1, ...c }));
const counts = frozen.reduce((m, c) => ((m[c.category] = (m[c.category] || 0) + 1), m), {});
const body = JSON.stringify(frozen, null, 1);
const sha256 = crypto.createHash("sha256").update(body).digest("hex");
fs.writeFileSync(`${DIR}/cases.json`, body);
fs.writeFileSync(`${DIR}/cases.sha256.json`, JSON.stringify({ sha256, frozenAt: new Date().toISOString(), total: frozen.length, counts, seed: SEED, sources: ["api.osv.dev", "registry.npmjs.org", "pypi.org"] }, null, 1));
console.log(JSON.stringify({ total: frozen.length, counts, sha256 }));
