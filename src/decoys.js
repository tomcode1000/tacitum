// Decoy counterparties. A decoy only hides the target if an observer cannot tell it
// apart, and the strongest public tell is how well known a company is: the answers
// to news and filings checks are published, so a famous target among obscure decoys
// stands out. "matched" decoys share the target's jurisdiction and fame bucket;
// "random" decoys are any active company in the jurisdiction (the naive baseline).
//
// Fame is measured on Wikipedia, never through Telegraph, so measuring it leaks nothing to the feed.
import fs from "node:fs";
import path from "node:path";
import { HOME, SHIPPED } from "./config.js";

const UA = "tacitum/0.1 (https://github.com/tomcode1000/tacitum)";
const CACHE_DIR = path.join(HOME, "cache");
const CACHE = path.join(CACHE_DIR, "fame.json");
// State written by this install, falling back to the copy shipped with the package.
const stateOrShipped = (file) => (fs.existsSync(path.join(HOME, file)) ? path.join(HOME, file) : path.join(SHIPPED, file));
const fameCache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};

// Lists of well-known companies per jurisdiction, used for the famous/known buckets.
const LISTED = {
  GB: ["Companies listed on the London Stock Exchange", "Companies in the FTSE 250 Index"],
  US: ["Companies listed on the New York Stock Exchange", "Companies listed on the Nasdaq"],
};

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Retries dropped connections; throws rather than returning a guess, so a failed lookup is never cached as "0 hits".
async function wikiJson(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.ok) return res.json();
      if (attempt >= 4) throw new Error(`Wikipedia ${res.status}`);
    } catch (err) {
      if (attempt >= 4) throw err;
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
}

export async function fameHits(name) {
  if (name in fameCache) return fameCache[name];
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`"${name}"`)}&srlimit=1&format=json`;
  const hits = (await wikiJson(url)).query?.searchinfo?.totalhits ?? 0;
  fameCache[name] = hits;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(fameCache));
  return hits;
}

export const fameBucket = (hits) => (hits === 0 ? "obscure" : hits <= 30 ? "known" : "famous");

// A random page of active entities registered in `country`, from the GLEIF LEI index.
// GLEIF only pages through the first 10,000 results (alphabetical), so sampling pages of the
// whole country only ever returns names starting with A or B, which is itself a tell; and its
// name filter matches whole words only, so prefixes do not work either. Instead we pick a random
// LEI registration day: when a company registered says nothing about its name. Days are accepted
// in proportion to how many entities registered on them (rejection sampling), so quiet days are
// not over-represented.
const GLEIF = "https://api.gleif.org/api/v1/lei-records";
const FIRST_DAY = Date.parse("2013-01-01");
const BUSY_DAY = 200; // days with more registrations than this are always accepted (they are rare)
const gleifQuery = (country, day) =>
  `${GLEIF}?filter%5Bentity.legalAddress.country%5D=${country}&filter%5Bentity.status%5D=ACTIVE` +
  `&filter%5Bregistration.initialRegistrationDate%5D=${day}`;

// GLEIF allows about 60 requests a minute and drops connections past it: space and retry.
let lastGleif = 0;
async function gleifJson(url) {
  for (let attempt = 0; ; attempt++) {
    const wait = lastGleif + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastGleif = Date.now();
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
      if (attempt >= 4) throw new Error(`GLEIF ${res.status}`);
    } catch (err) {
      if (attempt >= 4) throw err;
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
}

async function gleifSample(country, size = 50) {
  for (let tries = 0; tries < 150; tries++) {
    const day = new Date(FIRST_DAY + Math.random() * (Date.now() - 30 * 864e5 - FIRST_DAY)).toISOString().slice(0, 10);
    const first = await gleifJson(`${gleifQuery(country, day)}&page%5Bsize%5D=1`);
    const total = first.meta?.pagination?.total ?? 0;
    if (!total || Math.random() > Math.min(1, total / BUSY_DAY)) continue;
    const page = 1 + Math.floor(Math.random() * Math.ceil(total / size));
    const data = await gleifJson(`${gleifQuery(country, day)}&page%5Bsize%5D=${size}&page%5Bnumber%5D=${page}`);
    return (data.data || []).map((x) => x.attributes.entity.legalName.name);
  }
  throw new Error(`could not sample GLEIF entities for ${country}`);
}

// Desks screen companies, not family trusts or pension schemes.
const COMPANY = /\b(limited|ltd\.?|plc|llp|inc\.?|llc|corp\.?|corporation)$/i;

export async function listedSample(country) {
  const names = [];
  for (const cat of LISTED[country] || []) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(`Category:${cat}`)}&cmlimit=500&cmtype=page&format=json`;
    names.push(...(await wikiJson(url)).query.categorymembers.map((m) => m.title.replace(/ \(.*\)$/, "")));
  }
  return names;
}

// Name format is the second tell: registry dumps are ALL CAPS with legal suffixes, people
// type "Barclays PLC". Matched decoys copy the target's casing and suffix habit.
const SUFFIX = /\s+(plc|p\.l\.c\.|ltd\.?|limited|inc\.?|llc|corp\.?|corporation|group|holdings)$/i;

export function styleLike(target, name) {
  const t = target.trim();
  let out = name.trim().replace(SUFFIX, "");
  const targetSuffix = t.match(SUFFIX)?.[1];
  if (targetSuffix) out = `${out} ${targetSuffix}`;
  if (t === t.toUpperCase()) return out.toUpperCase();
  // Names that already have mixed case (Wikipedia titles) keep it, so acronyms like GCP or SSE survive.
  if (name !== name.toUpperCase()) return out.replace(/\b(plc|llc)\b/gi, (s) => s.toUpperCase());
  // All-caps source: title-case it, but keep short acronyms (BP, GSK, SSE, 3I) as they are.
  // "Bp PLC" is a spelling no person types, so it would mark the decoy.
  return out
    .split(/(\s+)/)
    .map((w) => (/^[A-Z0-9&]{1,3}$/.test(w) && !WORDS.has(w) ? w : w.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase())))
    .join("")
    .replace(/\b(Plc|Llc)\b/g, (s) => s.toUpperCase());
}
const WORDS = new Set(["THE", "AND", "OF", "FOR", "NEW", "OLD", "ONE", "TWO", "BIG", "TOP", "SEA", "OIL", "GAS", "CAR", "ART", "BAY", "SUN"]);

// The third tell is the registry answer, which is published: the target's exact legal name
// resolves, while a re-styled decoy ("Persimmon PLC", "... Limited" for "... LTD") often does
// not. So a decoy must resolve in GLEIF, by exactly the name we will send, the same way the
// target does. GLEIF is the registry source the miners read; asking it directly leaks nothing to Telegraph.
const EXACT = path.join(CACHE_DIR, "gleif-exact.json");
const FILERS = stateOrShipped("filers.json");
const exactCache = fs.existsSync(EXACT) ? JSON.parse(fs.readFileSync(EXACT, "utf8")) : {};
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9&]+/g, " ").trim();

export async function resolves(name, country) {
  const key = `${country}:${name}`;
  if (key in exactCache) return exactCache[key];
  const url =
    `${GLEIF}?filter%5Bentity.legalAddress.country%5D=${country}&filter%5Bentity.status%5D=ACTIVE` +
    `&filter%5Bentity.legalName%5D=${encodeURIComponent(name)}&page%5Bsize%5D=20`;
  const data = await gleifJson(url);
  exactCache[key] = (data.data || []).some((r) => norm(r.attributes.entity.legalName.name) === norm(name));
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(EXACT, JSON.stringify(exactCache));
  return exactCache[key];
}

// Cover sets. Picking the nearest decoys afresh each time leaks across runs: the famous filers
// are few, so the same ones recur as decoys (AstraZeneca and Barclays in 4 of 16 runs each), and
// the one name in a bundle never seen elsewhere is the target (rarest-name attacker: 0.40 on those
// runs, chance 0.25). Fresh decoys for a repeated target leak too: intersect the bundles.
// So a matched cover set, once chosen, is kept, and every member of it is screened with exactly
// that set. A bundle then looks the same whichever member was wanted. New sets avoid names already
// in a set, so the sets partition the pool.
const COVERS_OUT = path.join(HOME, "cover-sets.json");
const loadCovers = () => {
  const file = stateOrShipped("cover-sets.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
};
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

export function coverSetFor(target, size) {
  return loadCovers().find((s) => s.jurisdiction === target.jurisdiction && s.members.length === size && s.members.some((m) => sameName(m, target.name)));
}

export async function pickDecoys(target, count, strategy = "matched") {
  if (strategy === "random") {
    const names = shuffle((await gleifSample(target.jurisdiction)).filter((n) => !sameName(n, target.name)));
    return names.slice(0, count).map((name) => ({ name, jurisdiction: target.jurisdiction }));
  }

  const known = coverSetFor(target, count + 1);
  if (known) return known.members.filter((m) => !sameName(m, target.name)).map((name) => ({ name, jurisdiction: target.jurisdiction }));

  const covers = loadCovers();
  const taken = new Set(covers.filter((s) => s.jurisdiction === target.jurisdiction).flatMap((s) => s.members.map((m) => m.toLowerCase())));
  let decoys;
  try {
    decoys = await pickMatched(target, count, taken);
  } catch {
    // The famous-filer pool is small; if the unused names cannot cover the target, share names.
    decoys = await pickMatched(target, count, new Set());
  }
  covers.push({ jurisdiction: target.jurisdiction, members: [target.name, ...decoys.map((d) => d.name)], createdAt: new Date().toISOString() });
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(COVERS_OUT, JSON.stringify(covers, null, 2));
  return decoys;
}

async function pickMatched(target, count, taken) {
  const exclude = new Set([target.name.toLowerCase()]);
  const fresh = (names) => names.filter((n) => !exclude.has(n.toLowerCase()));
  const unused = (decoy) => !taken.has(decoy.name.toLowerCase());

  // Fame is measured on the name exactly as it will be sent: "Konami" has many exact-phrase
  // hits, "Konami PLC" has none, and the observer only ever sees the styled name.
  const level = (hits) => Math.log10(1 + hits);
  const targetLevel = level(await fameHits(target.name));
  const as = (name) => ({ name: styleLike(target.name, name), jurisdiction: target.jurisdiction });
  const targetResolves = await resolves(target.name, target.jurisdiction);
  const sameRegistry = async (decoy) => (await resolves(decoy.name, decoy.jurisdiction)) === targetResolves;

  if (targetLevel === 0) {
    const picked = [];
    // Obscure pools come one registration day at a time, so keep drawing days until there are enough.
    for (let round = 0; picked.length < count && round < 8; round++) {
      for (const name of shuffle(fresh((await gleifSample(target.jurisdiction)).filter((n) => COMPANY.test(n))))) {
        if (picked.length === count) break;
        const decoy = as(name);
        if (!unused(decoy) || (await fameHits(decoy.name)) !== 0 || !(await sameRegistry(decoy))) continue;
        exclude.add(name.toLowerCase());
        picked.push(decoy);
      }
    }
    if (picked.length < count) throw new Error(`only found ${picked.length}/${count} obscure decoys for ${target.jurisdiction}`);
    return picked;
  }

  // The fourth tell is the filings answer: a famous SEC filer among decoys with no filings stands
  // out. data/filers.json is the filer survey (scripts/survey-filings.mjs), asked ahead of time
  // from a separate wallet; when it covers the target, decoys must share its filer status. Volume
  // tells too (a bank files ~280 times a year, Aviva 6), so the filings level counts toward the gap.
  const filers = Object.fromEntries(
    Object.entries(fs.existsSync(FILERS) ? JSON.parse(fs.readFileSync(FILERS, "utf8")) : {}).map(([n, c]) => [n.toLowerCase(), c]),
  );
  const filings = (name) => filers[name.toLowerCase()];
  const isFiler = (name) => (filings(name) === undefined ? null : filings(name) > 0);
  const targetFiler = isFiler(target.name);
  const filingsGap = (name) => (targetFiler ? Math.abs(level(filings(name)) - level(filings(target.name))) : 0);
  if (targetFiler === null) console.warn(`${target.name} is not in the filer survey: decoys are not matched on filings`);

  // Known targets: score listed companies by how close their (styled) fame is to the target's,
  // and take the nearest. Within TOLERANCE (a factor of ~1.8 in hits) counts as indistinguishable.
  const TOLERANCE = 0.25;
  const scored = [];
  // Filers are rare, so a filer target needs the whole pool searched.
  const candidates = shuffle(fresh(await listedSample(target.jurisdiction)));
  for (const name of targetFiler ? candidates : candidates.slice(0, 250)) {
    const decoy = as(name);
    // The listed sample comes from two overlapping categories, so the same company can appear twice.
    if (exclude.has(decoy.name.toLowerCase()) || !unused(decoy)) continue;
    exclude.add(decoy.name.toLowerCase());
    if (targetFiler !== null && isFiler(decoy.name) !== targetFiler) continue;
    const gap = Math.abs(level(await fameHits(decoy.name)) - targetLevel) + filingsGap(decoy.name);
    // The registry check costs a GLEIF call, so only run it for candidates already close on fame.
    if (gap <= TOLERANCE * 2 && !(await sameRegistry(decoy))) continue;
    scored.push({ decoy, gap });
    if (scored.filter((s) => s.gap <= TOLERANCE).length >= count * 2) break;
  }
  const nearest = scored.sort((a, b) => a.gap - b.gap).slice(0, count);
  if (nearest.length < count) throw new Error(`only found ${nearest.length}/${count} decoys for ${target.jurisdiction}`);
  // Keeping sets apart is worth less than a close match: a far-off decoy is a tell in every run.
  if (taken.size && nearest.at(-1).gap > TOLERANCE * 2) throw new Error(`unused names too far from ${target.name}`);
  if (nearest.some((s) => s.gap > TOLERANCE)) console.warn(`decoys for ${target.name}: fame and filings gap up to ${nearest.at(-1).gap.toFixed(2)}`);
  return nearest.map((s) => s.decoy);
}
