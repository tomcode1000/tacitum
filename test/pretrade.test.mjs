// Pre-trade check: every verdict path, the privacy mix, and the decoy formats. Offline.
import test from "node:test";
import assert from "node:assert/strict";
import { decide, decoyWallet, pickDecoyPools, preTradeRun, DEPTH_MINER, DECOY_POOLS } from "../src/pretrade.js";

const SIG = "0x" + "ab".repeat(32);
const POOL = "8FnX3xo2yYw3EUE6w3nQA4GfXGS9wpK6oj3veJpbFzLo";
const deep = { liquidity_usd: 4_000_000, dex: "BisonFi", pair: "USDC/SOL", route_verified: true, depth: [{ sell_usd: 1000, price_impact_pct: 0.01 }, { sell_usd: 10000, price_impact_pct: 0.02 }, { sell_usd: 100000, price_impact_pct: 0.2 }] };
const clear = { miner: 731002, matched: false, signal: SIG };

test("GO: deep pool, small trade, clear counterparty", () => {
  const r = decide({ depth: deep, sanctions: clear, sizeUsd: 5000 });
  assert.equal(r.verdict, "GO");
  assert.ok(r.reasons.some((x) => /moves the price 0.02%/.test(x)), "uses the smallest measured size at or above the trade");
});

test("GO without a counterparty: depth only", () => {
  assert.equal(decide({ depth: deep, sanctions: null, sizeUsd: 1000 }).verdict, "GO");
});

test("STOP: sanctions match beats everything", () => {
  const r = decide({ depth: deep, sanctions: { ...clear, matched: true }, sizeUsd: 1000 });
  assert.equal(r.verdict, "STOP");
});

test("HOLD: sanctions answer without a receipt is not clear", () => {
  assert.equal(decide({ depth: deep, sanctions: { miner: 1, matched: false, signal: null }, sizeUsd: 1000 }).verdict, "HOLD");
  assert.equal(decide({ depth: deep, sanctions: { miner: 1, error: "503" }, sizeUsd: 1000 }).verdict, "HOLD");
});

test("HOLD: pool declined by the miner (no figure)", () => {
  const r = decide({ depth: { error: "reserves_not_attributable" }, sanctions: clear, sizeUsd: 1000 });
  assert.equal(r.verdict, "HOLD");
  assert.ok(r.reasons.some((x) => /reserves_not_attributable/.test(x)));
});

test("STOP outranks HOLD", () => {
  assert.equal(decide({ depth: { error: "x" }, sanctions: { ...clear, matched: true }, sizeUsd: 1 }).verdict, "STOP");
});

test("CAUTION: price impact above the limit", () => {
  const r = decide({ depth: deep, sanctions: clear, sizeUsd: 50_000, maxImpactPct: 0.1 });
  assert.equal(r.verdict, "CAUTION");
  assert.ok(r.reasons.some((x) => /0.2%, above the 0.1% limit/.test(x)));
});

test("CAUTION: trade larger than the measured sizes", () => {
  assert.equal(decide({ depth: deep, sanctions: clear, sizeUsd: 150_000 }).verdict, "CAUTION");
});

test("CAUTION: trade too large relative to the pool", () => {
  const small = { ...deep, liquidity_usd: 50_000 };
  const r = decide({ depth: small, sanctions: clear, sizeUsd: 5000 });
  assert.equal(r.verdict, "CAUTION");
  assert.ok(r.reasons.some((x) => /more than 1\/20 of the pool/.test(x)));
});

test("CAUTION: route not confirmed through this pool", () => {
  assert.equal(decide({ depth: { ...deep, route_verified: false }, sanctions: clear, sizeUsd: 1000 }).verdict, "CAUTION");
});

test("decoy wallets keep the real wallet's format", () => {
  const evm = decoyWallet("0x098B716B8Aaf21512996dC57EB0615e2383E2f96");
  assert.match(evm, /^0x[0-9a-f]{40}$/);
  const sol = decoyWallet(POOL);
  assert.equal(sol.length, POOL.length);
  assert.match(sol, /^[1-9A-HJ-NP-Za-km-z]+$/);
  assert.notEqual(sol, POOL);
});

test("decoy pools never include the real pool", () => {
  for (let i = 0; i < 20; i++) {
    const d = pickDecoyPools(POOL, 3);
    assert.equal(d.length, 3);
    assert.ok(!d.includes(POOL));
    assert.ok(d.every((p) => DECOY_POOLS.includes(p)));
  }
});

function fakeClient({ depthOk = true, matched = false } = {}) {
  const calls = [];
  return {
    calls,
    askMiner: async (miner, intent, params) => {
      calls.push({ miner, intent, params });
      if (intent === "LIQUIDITY_DEPTH_VERIFY_GENERAL") return depthOk ? { ok: true, data: { result: { ...deep, pool: params.pool }, signal_hash: SIG } } : { ok: false, data: { error: "reserves_not_attributable" } };
      return { ok: true, data: { result: { matched: params.name.startsWith("0xbad") ? true : matched }, signal_hash: SIG } };
    },
  };
}

test("run: real pool and wallet are hidden among decoys, only the real answer returns", async () => {
  const c = fakeClient();
  const r = await preTradeRun(c, { pool: POOL, sizeUsd: 5000, counterparty: "0x098B716B8Aaf21512996dC57EB0615e2383E2f96", jitterMs: [0, 0] });
  const depthCalls = c.calls.filter((x) => x.intent === "LIQUIDITY_DEPTH_VERIFY_GENERAL");
  const sanctionCalls = c.calls.filter((x) => x.intent !== "LIQUIDITY_DEPTH_VERIFY_GENERAL");
  assert.equal(depthCalls.length, 4);
  assert.ok(depthCalls.every((x) => x.miner === DEPTH_MINER));
  assert.equal(depthCalls.filter((x) => x.params.pool === POOL).length, 1);
  assert.equal(sanctionCalls.length, 4);
  assert.equal(r.depth.pool, POOL);
  assert.equal(r.verdict, "GO");
  assert.equal(r.privacy.decoyPools, 3);
  assert.equal(r.privacy.decoyWallets, 3);
  assert.equal(r.receipts.depth, SIG);
});

test("run: sanctions match on the real wallet only -> STOP", async () => {
  const r = await preTradeRun(fakeClient(), { pool: POOL, sizeUsd: 1000, counterparty: "0xbad0000000000000000000000000000000000001", jitterMs: [0, 0] });
  assert.equal(r.verdict, "STOP");
});

test("run: miner declines the pool -> HOLD, decoys still bought", async () => {
  const c = fakeClient({ depthOk: false });
  const r = await preTradeRun(c, { pool: POOL, sizeUsd: 1000, jitterMs: [0, 0] });
  assert.equal(r.verdict, "HOLD");
  assert.equal(c.calls.length, 4);
});

test("run: sanctions fall back to the next miner when the first gives no receipt", async () => {
  const calls = [];
  const c = { askMiner: async (miner, intent, params) => {
    calls.push(miner);
    if (intent === "LIQUIDITY_DEPTH_VERIFY_GENERAL") return { ok: true, data: { result: deep, signal_hash: SIG } };
    return miner === 731002 ? { ok: false, data: { error: "503 LISTS_LOADING" } } : { ok: true, data: { result: { matched: false }, signal_hash: SIG } };
  } };
  const r = await preTradeRun(c, { pool: POOL, sizeUsd: 1000, counterparty: "0x098B716B8Aaf21512996dC57EB0615e2383E2f96", decoys: 1, jitterMs: [0, 0] });
  assert.equal(r.verdict, "GO");
  assert.equal(r.sanctions.miner, 710637);
});

test("run: input checks", async () => {
  await assert.rejects(preTradeRun(fakeClient(), { sizeUsd: 1 }), /pool/);
  await assert.rejects(preTradeRun(fakeClient(), { pool: POOL, sizeUsd: 0 }), /sizeUsd/);
});

import { fullDepthAnswer } from "../src/pretrade.js";
test("full answer: taken from the public record when the buyer only gets liquidity_usd", async () => {
  const res = { ok: true, data: { result: { liquidity_usd: 4_170_000 }, signal_hash: SIG } };
  const full = await fullDepthAnswer(res, async (h) => (h === SIG ? { payload: { response: { ...deep, liquidity_usd: 4_170_000 } } } : null));
  assert.equal(full.route_verified, true);
  assert.equal(full.dex, "BisonFi");
  assert.equal(decide({ depth: full, sanctions: clear, sizeUsd: 25_000 }).verdict, "GO");
});

test("full answer: record unavailable -> thin answer kept, and the verdict stays cautious", async () => {
  const res = { ok: true, data: { result: { liquidity_usd: 4_170_000 }, signal_hash: SIG } };
  const thin = await fullDepthAnswer(res, async () => null);
  assert.equal(thin.route_verified, undefined);
  assert.equal(decide({ depth: thin, sanctions: clear, sizeUsd: 25_000 }).verdict, "CAUTION");
});

test("full answer: used as-is when the buyer already has it", async () => {
  let fetched = false;
  const out = await fullDepthAnswer({ data: { result: deep, signal_hash: SIG } }, async () => { fetched = true; });
  assert.equal(out, deep);
  assert.equal(fetched, false);
});
