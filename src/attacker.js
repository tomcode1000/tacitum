// The observer Tacitum defends against. It sees only public data: the signal records
// for one wallet in a time window (question, answer, timestamp), exactly what anyone can
// get from /daemon/api/questions plus /engine/v1/signal/{hash}. It groups the calls
// into one bundle per counterparty and guesses which bundle was the real one.
import { publicRecord } from "./telegraph.js";
import { fameHits } from "./decoys.js";

const SUFFIX = /\s(plc|ltd\.?|limited|inc\.?|llc|corp\.?|group|holdings)$/i;

function entityOf(request) {
  const json = request?.split("→")[1];
  if (!json) return null;
  const p = JSON.parse(json);
  return p.name ?? p.company ?? p.entity ?? p.query ?? null;
}

export async function observe(signals) {
  const rows = [];
  for (const s of signals) {
    const pub = await publicRecord(s);
    if (!pub?.payload) continue;
    rows.push({ at: pub.payload.timestamp, intent: pub.payload.intent_id, entity: entityOf(pub.payload.request), response: pub.payload.response });
  }
  return rows.sort((a, b) => a.at.localeCompare(b.at));
}

// One feature vector per counterparty bundle, from public data only.
export async function features(rows) {
  const bundles = new Map();
  rows.forEach((r, i) => {
    if (!bundles.has(r.entity)) bundles.set(r.entity, { entity: r.entity, first: i, last: i, calls: 0, rows: [] });
    const b = bundles.get(r.entity);
    b.last = i;
    b.calls++;
    b.rows.push(r);
  });
  const out = [];
  for (const b of bundles.values()) {
    const by = (intent) => b.rows.find((r) => r.intent.startsWith(intent))?.response || {};
    out.push({
      entity: b.entity,
      first: b.first / rows.length,
      last: b.last / rows.length,
      calls: b.calls,
      news: Number(by("NEWS_SEARCH").result_count) || 0,
      filings: Math.log10(1 + (Number(by("REGULATORY_FILING").filing_count) || 0)),
      registryFound: by("CORPORATE_REGISTRY").legal_name ? 1 : 0,
      sanctionsHit: String(by("SANCTIONS").matched) === "true" ? 1 : 0,
      upper: b.entity === b.entity.toUpperCase() ? 1 : 0,
      suffix: SUFFIX.test(b.entity) ? 1 : 0,
      fame: Math.log10(1 + (await fameHits(b.entity))),
    });
  }
  return out;
}

export const FEATURES = ["first", "last", "calls", "news", "filings", "registryFound", "sanctionsHit", "upper", "suffix", "fame"];

const argmax = (xs, f) => {
  const best = Math.max(...xs.map(f));
  const top = xs.filter((x) => f(x) === best);
  return top[Math.floor(Math.random() * top.length)];
};

// The odd one out on name format: the bundle whose casing/suffix differs from the majority.
function oddFormat(bundles) {
  const key = (b) => `${b.upper}${b.suffix}`;
  const counts = {};
  bundles.forEach((b) => (counts[key(b)] = (counts[key(b)] || 0) + 1));
  return argmax(bundles, (b) => -counts[key(b)]);
}

export const STRATEGIES = {
  first: (bs) => argmax(bs, (b) => -b.first),
  famous: (bs) => argmax(bs, (b) => b.fame + b.news / 10 + b.filings),
  format: oddFormat,
};

// Within-run z-scores, so the model learns "stands out from its own run".
function standardize(bundles) {
  return bundles.map((b) =>
    FEATURES.map((f) => {
      const xs = bundles.map((x) => x[f]);
      const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
      const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length) || 1;
      return (b[f] - mean) / sd;
    }),
  );
}

function trainLogistic(X, y, { epochs = 400, lr = 0.1, l2 = 0.01 } = {}) {
  const w = new Array(X[0].length + 1).fill(0);
  for (let e = 0; e < epochs; e++) {
    const g = new Array(w.length).fill(0);
    X.forEach((x, i) => {
      const z = w[0] + x.reduce((s, v, j) => s + v * w[j + 1], 0);
      const err = 1 / (1 + Math.exp(-z)) - y[i];
      g[0] += err;
      x.forEach((v, j) => (g[j + 1] += err * v + l2 * w[j + 1]));
    });
    w.forEach((_, j) => (w[j] -= (lr * g[j]) / X.length));
  }
  return w;
}

// Leave-one-run-out: the learned attacker is trained on every other run, then guesses this one.
export function learnedGuesses(runs) {
  return runs.map((run, i) => {
    const X = [];
    const y = [];
    runs.forEach((r, j) => {
      if (j === i) return;
      standardize(r.bundles).forEach((x, n) => {
        X.push(x);
        y.push(r.bundles[n].entity === r.target ? 1 : 0);
      });
    });
    const w = trainLogistic(X, y);
    const xs = standardize(run.bundles);
    const scores = xs.map((x) => w[0] + x.reduce((s, v, j) => s + v * w[j + 1], 0));
    return run.bundles[scores.indexOf(Math.max(...scores))].entity;
  });
}
