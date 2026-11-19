// Watchlist monitor, offline: verdict rule, change detection, and that decoys are bought but not reported.
import { test } from "node:test";
import assert from "node:assert/strict";
import { monitorRun, newsVerdict, diff } from "../src/monitor.js";

const ok = (result) => ({ ok: true, data: { result, cost_usd: 0.01, signal_hash: "0x" + "cd".repeat(32) } });

test("news verdict: clean screen, items found, and failures", () => {
  assert.equal(newsVerdict(ok({ answer: "No adverse media found for Acme", result_count: 0 })), "CLEAR");
  assert.equal(newsVerdict(ok({ answer: "2 adverse items", result_count: 2 })), "FLAG");
  assert.equal(newsVerdict({ ok: false, data: { error: "503" } }), "REVIEW");
  assert.equal(newsVerdict(ok({ answer: "", result_count: 0 })), "REVIEW");
});

test("every name is asked with its decoys, only real names are reported", async () => {
  const asked = [];
  const client = { askMiner: async (m, intent, p) => { asked.push(p.query); return ok({ answer: p.query === "Bad Co" ? "1 adverse item" : "No adverse media", result_count: p.query === "Bad Co" ? 1 : 0 }); } };
  const run = await monitorRun(client, [{ name: "Bad Co", jurisdiction: "GB" }, { name: "Good Co", jurisdiction: "GB" }], {
    k: 3, jitterMs: [0, 0], decoysFor: (t) => [{ name: t.name + " D1" }, { name: t.name + " D2" }],
  });
  assert.equal(asked.length, 6);
  assert.equal(run.calls, 6);
  assert.equal(run.coverCalls, 4);
  assert.deepEqual(run.results.map((r) => [r.name, r.verdict]), [["Bad Co", "FLAG"], ["Good Co", "CLEAR"]]);
  assert.equal(run.costUsd, 0.06);
});

test("diff reports new names and changed verdicts only", () => {
  const prev = { results: [{ name: "A", verdict: "CLEAR" }, { name: "B", verdict: "FLAG" }] };
  const now = [{ name: "A", verdict: "FLAG" }, { name: "B", verdict: "FLAG" }, { name: "C", verdict: "CLEAR" }];
  assert.deepEqual(diff(prev, now), [
    { name: "A", change: "CLEAR -> FLAG", verdict: "FLAG" },
    { name: "C", change: "new on watchlist", verdict: "CLEAR" },
  ]);
});
