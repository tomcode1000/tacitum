// Counterparty assessment: the institutional workflow from Mission 03.
// Each check is bought from miners chosen by scripts/probe-miners.mjs (data/miner-probe.json),
// and every answer keeps its receipt and signal hash so the memo can be verified later.
import { publicRecord } from "./telegraph.js";

// Sanctions are screened by two independent miners, because one call cannot tell you
// when a miner is wrong. The other checks use a primary miner with fallbacks.
export const CHECKS = {
  sanctions: { intent: "SANCTIONS_SCREENING_MATCH_GENERAL", miners: [710637, 9002], mode: "all", params: (c) => ({ name: c.name }) },
  registry: { intent: "CORPORATE_REGISTRY_LOOKUP_GENERAL", miners: [7393, 9002], mode: "all", params: (c) => ({ company: c.name, jurisdiction: c.jurisdiction }) },
  filings: { intent: "REGULATORY_FILING_MONITOR_GENERAL", miners: [77131], mode: "first", params: (c) => ({ entity: c.name, period: "last 12 months" }) },
  news: { intent: "NEWS_SEARCH_GENERAL", miners: [7329, 302], mode: "first", params: (c) => ({ query: c.name }) },
};

const ADVERSE = /sanction|fraud|fine[ds]?\b|penalt|probe|lawsuit|sued|charged|indict|investigat|money laundering|bribery|default|insolven|bankrupt/i;
const TRUE = ["true", "yes", "match", "matched", "1"];
const FALSE = ["false", "no", "0", "no match", "not matched", "clear"];
const bool = (v) => (TRUE.includes(String(v).toLowerCase()) ? true : FALSE.includes(String(v).toLowerCase()) ? false : null);

export async function runCheck(client, check, counterparty) {
  const params = check.params(counterparty);
  const answers = [];
  for (const minerId of check.miners) {
    const res = await client.askMiner(minerId, check.intent, params);
    answers.push({
      minerId,
      miner: res.data?.miner_name,
      ok: res.ok && res.data?.result != null,
      status: res.status,
      result: res.data?.result ?? null,
      error: res.ok ? undefined : res.data?.error,
      costUsd: res.ok ? Number(res.data?.cost_usd || 0) : 0,
      signal: res.data?.signal_hash,
      tx: res.payment?.transaction,
      receipt: res.receipt,
    });
    if (check.mode === "first" && answers.at(-1).ok) break;
  }
  return { intent: check.intent, params, answers };
}

function judge(checks) {
  const ok = (name) => checks[name].answers.filter((a) => a.ok);

  const hits = ok("sanctions").map((a) => bool(a.result.matched));
  const sanctions =
    hits.includes(true) ? "FLAG" : hits.length >= 2 && hits.every((h) => h === false) ? "CLEAR" : "REVIEW";

  const active = ok("registry").map((a) => bool(a.result.active));
  const registry = active.includes(false) ? "FLAG" : active.includes(true) ? "CLEAR" : "REVIEW";

  const filing = ok("filings")[0]?.result;
  const filings = filing ? "INFO" : "REVIEW";

  const story = ok("news")[0]?.result;
  const text = story ? [story.answer, story.brief, ...(story.titles || [])].filter(Boolean).join(" ") : "";
  // No sources is not the same as no adverse news.
  const news = !story || !Number(story.result_count) ? "REVIEW" : ADVERSE.test(text) ? "FLAG" : "CLEAR";

  const verdicts = { sanctions, registry, filings, news };
  const values = Object.values(verdicts);
  const overall = values.includes("FLAG") ? "FLAG" : values.includes("REVIEW") ? "REVIEW" : "CLEAR";
  return { overall, verdicts };
}

// Re-fetch each answer's public record and confirm it is the call we paid for.
async function verify(checks, payer) {
  const rows = [];
  for (const check of Object.values(checks)) {
    for (const a of check.answers.filter((x) => x.signal)) {
      const pub = await publicRecord(a.signal);
      rows.push({
        signal: a.signal,
        found: Boolean(pub),
        payerMatches: pub?.signal?.wallet_address?.toLowerCase() === payer.toLowerCase(),
        txMatches: !a.tx || pub?.signal?.tx_hash?.toLowerCase() === a.tx.toLowerCase(),
        publicQuestion: pub?.payload?.request,
      });
    }
  }
  return rows;
}

export async function assess(client, counterparty) {
  const startedAt = new Date().toISOString();
  const checks = {};
  for (const [name, check] of Object.entries(CHECKS)) checks[name] = await runCheck(client, check, counterparty);
  return finish(client, counterparty, checks, startedAt);
}

// Builds the assessment record from checks that have already been bought.
export async function finish(client, counterparty, checks, startedAt) {
  const all = Object.values(checks).flatMap((c) => c.answers);
  const verification = await verify(checks, client.payer);
  return {
    counterparty,
    startedAt,
    finishedAt: new Date().toISOString(),
    payer: client.payer,
    ...judge(checks),
    costUsd: Number(all.reduce((s, a) => s + a.costUsd, 0).toFixed(4)),
    paidCalls: all.filter((a) => a.costUsd > 0).length,
    checks,
    verification,
  };
}
