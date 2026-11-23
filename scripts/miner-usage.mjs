// Counts requests served by our miner since its current registration, split by who paid:
// our own wallets (the operator and every one-time payer whose key we hold) against everyone else.
// Reads Telegraph's public feed (/daemon/api/questions) and each signal's public record.
// Usage: node scripts/miner-usage.mjs   -> writes evidence/miner-usage-<date>.json
import "./config.mjs";
import fs from "node:fs";
import path from "node:path";
import { NODE, KEYS } from "../src/config.js";
import { publicRecord } from "../src/telegraph.js";

const miner = JSON.parse(fs.readFileSync("data/miner.json", "utf8"));
const since = new Date(miner.registeredAt || "2026-11-17T14:25:00Z").getTime();
const slug = miner.slug;

const ours = new Set([process.env.OPERATOR_ADDRESS || "0xdbEE317b429c8EADFcE1825691cF10C7fa46b608"].map((a) => a.toLowerCase()));
for (const f of fs.existsSync(KEYS) ? fs.readdirSync(KEYS) : []) if (/^0x[0-9a-fA-F]{40}\.json$/.test(f)) ours.add(f.slice(0, 42).toLowerCase());
for (const sub of ["depositors"]) {
  const d = path.join(KEYS, sub);
  if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (/^0x/.test(f)) ours.add(f.slice(0, 42).toLowerCase());
}

const hits = [];
for (let page = 0, done = false; !done && page < 400; page++) {
  // The feed is long and connections drop; a page that cannot be read must stop the count, not skew it.
  let j;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${NODE}/daemon/api/questions?limit=100&offset=${page * 100}`, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`feed ${res.status}`);
      j = await res.json();
      break;
    } catch (e) {
      if (attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  const rows = j.results || [];
  if (!rows.length) break;
  for (const q of rows) {
    if (new Date(q.created_at).getTime() < since) { done = true; break; }
    if (q.routing?.miner_slug === slug) hits.push({ at: q.created_at, status: q.status, signal: q.signal_hash, question: q.question?.text, routing: q.routing_mode });
  }
}

for (const h of hits) {
  const rec = h.signal ? await publicRecord(h.signal, { waitMs: 0 }) : null;
  h.payer = rec?.signal?.wallet_address || null;
  h.ours = h.payer ? ours.has(h.payer.toLowerCase()) : null;
}

const count = (f) => hits.filter(f).length;
const summary = {
  miner: slug, registration: miner.registrationId, since: new Date(since).toISOString(), countedAt: new Date().toISOString(),
  total: hits.length,
  ours: count((h) => h.ours === true),
  others: count((h) => h.ours === false),
  unknownPayer: count((h) => h.ours === null),
  succeeded: count((h) => h.status === "success" || h.status === "completed"),
  otherPayers: [...new Set(hits.filter((h) => h.ours === false).map((h) => h.payer))].length,
};
fs.mkdirSync("evidence", { recursive: true });
const out = `evidence/miner-usage-${new Date().toISOString().slice(0, 10)}.json`;
// Other people's questions are summarised, not republished: only counts, status and time.
fs.writeFileSync(out, JSON.stringify({ ...summary, requests: hits.map(({ at, status, ours, routing }) => ({ at, status, ours, routing })) }, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log(`wrote ${out}`);
