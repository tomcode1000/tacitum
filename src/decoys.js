// Decoy counterparties. A decoy only hides the target if an observer cannot tell it
// apart, and the strongest public tell is how well known a company is: the answers
// to news and filings checks are published, so a famous target among obscure decoys
// stands out. "matched" decoys share the target's jurisdiction and fame bucket;
// "random" decoys are any active company in the jurisdiction (the naive baseline).
//
// Fame is measured on Wikipedia, never through Telegraph, so measuring it leaks nothing to the feed.
import fs from "node:fs";

const UA = "tacitum/0.1 (https://github.com/tomcode1000/tacitum)";
const CACHE = "data/cache/fame.json";
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

export async function fameHits(name) {
  if (name in fameCache) return fameCache[name];
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`"${name}"`)}&srlimit=1&format=json`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  const hits = res.ok ? (await res.json()).query?.searchinfo?.totalhits ?? 0 : 0;
  fameCache[name] = hits;
  fs.mkdirSync("data/cache", { recursive: true });
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
const BUSY_DAY = 600; // roughly the most GB registrations seen on one day
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
  for (let tries = 0; tries < 40; tries++) {
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

async function listedSample(country) {
  const names = [];
  for (const cat of LISTED[country] || []) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(`Category:${cat}`)}&cmlimit=500&cmtype=page&format=json`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) names.push(...(await res.json()).query.categorymembers.map((m) => m.title.replace(/ \(.*\)$/, "")));
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
  return out
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(Plc|Llc)\b/g, (s) => s.toUpperCase());
}

export async function pickDecoys(target, count, strategy = "matched") {
  const exclude = new Set([target.name.toLowerCase()]);
  const fresh = (names) => names.filter((n) => !exclude.has(n.toLowerCase()));

  if (strategy === "random") {
    const names = shuffle(fresh(await gleifSample(target.jurisdiction)));
    return names.slice(0, count).map((name) => ({ name, jurisdiction: target.jurisdiction }));
  }

  const bucket = fameBucket(await fameHits(target.name));
  const picked = [];
  // Obscure pools come one registration day at a time, so keep drawing days until there are enough.
  for (let round = 0; picked.length < count && round < 8; round++) {
    const pool = shuffle(
      fresh(bucket === "obscure" ? (await gleifSample(target.jurisdiction)).filter((n) => COMPANY.test(n)) : await listedSample(target.jurisdiction)),
    );
    for (const name of pool) {
      if (picked.length === count) break;
      if (fameBucket(await fameHits(name)) !== bucket) continue;
      exclude.add(name.toLowerCase());
      picked.push({ name: styleLike(target.name, name), jurisdiction: target.jurisdiction });
    }
    if (bucket !== "obscure") break;
  }
  if (picked.length < count) throw new Error(`only found ${picked.length}/${count} ${bucket} decoys for ${target.jurisdiction}`);
  return picked;
}
