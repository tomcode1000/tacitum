// Ongoing adverse-media monitoring: a desk's watchlist re-screened through the adverse-media miner,
// each name hidden among matched decoys, all queries shuffled into one batch from one payer.
// Compliance teams re-check counterparties continuously, not once at onboarding; this is that job.
//
// The verdict rule is the assessment's news rule for this miner: "No adverse media..." is CLEAR,
// items found is FLAG (needs a human look), anything else is REVIEW.
import fs from "node:fs";
import path from "node:path";
import { ADVERSE_MINER } from "./assess.js";
import { pickDecoys } from "./decoys.js";

export const MONITOR = { intent: "NEWS_SEARCH_GENERAL", miner: ADVERSE_MINER };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export function newsVerdict(res) {
  const r = res?.data?.result;
  if (!res?.ok || !r) return "REVIEW";
  if (/^no adverse media/i.test(r.answer || "")) return "CLEAR";
  return Number(r.result_count) > 0 ? "FLAG" : "REVIEW";
}

// What changed since the last run: names that newly flag, and names that cleared.
export function diff(previous, current) {
  const before = new Map((previous?.results || []).map((r) => [r.name.toLowerCase(), r.verdict]));
  const changes = [];
  for (const r of current) {
    const was = before.get(r.name.toLowerCase());
    if (was === undefined) changes.push({ name: r.name, change: "new on watchlist", verdict: r.verdict });
    else if (was !== r.verdict) changes.push({ name: r.name, change: `${was} -> ${r.verdict}`, verdict: r.verdict });
  }
  return changes;
}

// client: a one-time payer's Telegraph client. watchlist: [{ name, jurisdiction }].
// decoysFor (optional, for tests): target -> decoy list.
export async function monitorRun(client, watchlist, { k = 4, notBefore = 0, jitterMs = [200, 1500], decoysFor = (t) => pickDecoys(t, k - 1) } = {}) {
  const startedAt = new Date().toISOString();
  const jobs = [];
  for (const t of watchlist) {
    jobs.push({ real: true, party: t });
    for (const d of await decoysFor(t)) jobs.push({ real: false, party: d });
  }
  shuffle(jobs);
  if (Date.now() < notBefore) await sleep(notBefore - Date.now());

  const results = [];
  let costUsd = 0;
  let cover = 0;
  for (const job of jobs) {
    await sleep(jitterMs[0] + Math.random() * (jitterMs[1] - jitterMs[0]));
    const res = await client.askMiner(MONITOR.miner, MONITOR.intent, { query: job.party.name });
    if (res.ok) costUsd += Number(res.data?.cost_usd || 0);
    if (!job.real) { cover++; continue; }
    const r = res.data?.result || {};
    results.push({
      name: job.party.name,
      jurisdiction: job.party.jurisdiction,
      verdict: newsVerdict(res),
      answer: r.answer ?? null,
      resultCount: r.result_count ?? null,
      sources: (r.sources || []).slice(0, 5),
      signal: res.data?.signal_hash ?? null,
      error: res.ok ? undefined : res.data?.error,
    });
  }
  results.sort((a, b) => a.name.localeCompare(b.name));
  return { startedAt, finishedAt: new Date().toISOString(), miner: MONITOR.miner, k, calls: jobs.length, coverCalls: cover, costUsd: Math.round(costUsd * 100) / 100, results };
}

export function lastRun(dir, list) {
  if (!fs.existsSync(dir)) return null;
  const f = fs.readdirSync(dir).filter((x) => x.startsWith(list + "-") && x.endsWith(".json")).sort().pop();
  return f ? JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) : null;
}
