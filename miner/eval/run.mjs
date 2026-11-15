// Scores the miner's headline classifier against the hand-labelled set. Free and repeatable:
// it reads eval/sample.json (64 real headlines collected 16 Nov 2026 from GDELT/Google News for
// 8 companies, half that the miner flagged and half it rejected) and eval/labels.json.
// Usage: node miner/eval/run.mjs   -> writes miner/eval/results.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "../lib/adverse.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
function score(sampleFile, labelFile) {
  const sample = JSON.parse(fs.readFileSync(path.join(dir, sampleFile), "utf8"));
  const { guide, labels } = JSON.parse(fs.readFileSync(path.join(dir, labelFile), "utf8"));
  const rows = sample.map((s) => {
    const c = classify(s.title, s.entity);
    const predicted = Boolean(c && !c.solicitation); // law-firm adverts are returned but not counted
    const [gold, why] = labels[String(s.id)];
    return { ...s, gold, why, predicted, categories: c?.categories || [], outcome: predicted && gold ? "TP" : predicted ? "FP" : gold ? "FN" : "TN" };
  });
  const n = (o) => rows.filter((r) => r.outcome === o).length;
  const [tp, fp, fn, tn] = ["TP", "FP", "FN", "TN"].map(n);
  const precision = tp / (tp + fp), recall = tp / (tp + fn);
  return {
    headlines: rows.length, entities: [...new Set(rows.map((r) => r.entity))], confusion: { tp, fp, fn, tn },
    precision: +precision.toFixed(3), recall: +recall.toFixed(3), f1: +((2 * precision * recall) / (precision + recall)).toFixed(3), accuracy: +((tp + tn) / rows.length).toFixed(3),
    guide, errors: rows.filter((r) => r.outcome === "FP" || r.outcome === "FN").map(({ id, entity, title, outcome, why, categories }) => ({ id, entity, title, outcome, why, categories })),
  };
}
// tuning: rules adjusted on it (v2). holdout: rules adjusted on its errors (v3), so no longer clean.
// test: collected after v3 was frozen and labelled blind. The test score is the honest number.
const results = { scoredAt: new Date().toISOString(), tuning: score("sample.json", "labels.json"), holdout: score("holdout-sample.json", "holdout-labels.json"), test: score("test-sample.json", "test-labels.json"), history: { v1_tuning: { precision: 0.71, recall: 0.815 }, v2_holdout_before_v3: { precision: 0.625, recall: 0.625 } } };
fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify(results, null, 2));
for (const [name, r] of Object.entries({ tuning: results.tuning, holdout: results.holdout, test: results.test })) {
  console.log(`${name.padEnd(8)} headlines ${r.headlines}  TP ${r.confusion.tp} FP ${r.confusion.fp} FN ${r.confusion.fn} TN ${r.confusion.tn}  precision ${r.precision}  recall ${r.recall}  F1 ${r.f1}  accuracy ${r.accuracy}`);
  if (name === "test") for (const e of r.errors) console.log(`  ${e.outcome} #${e.id} ${e.entity}: ${e.title.slice(0, 95)}  (${e.why}${e.categories.length ? "; predicted " + e.categories.join("+") : ""})`);
}
