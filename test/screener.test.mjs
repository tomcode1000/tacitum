// Screening fallback: a down miner or an answer without a receipt never approves a deposit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { screenWithFallback, isClear } from "../src/screener.js";

const SIG = "0x" + "ab".repeat(32);
const fake = (table) => async (m) => {
  const r = table[m];
  if (r instanceof Error) throw r;
  return { miner: m, ...r };
};

test("skips a miner that is down and takes the next clear answer", async () => {
  const s = await screenWithFallback(fake({ 1: { error: "miner error 503 [LISTS_LOADING]" }, 2: { matched: false, signal: SIG } }), [1, 2]);
  assert.equal(s.miner, 2);
  assert.equal(s.matched, false);
});

test("an answer without a receipt is not clear, even if it says no match", async () => {
  assert.equal(isClear({ matched: false, signal: undefined }), false);
  const s = await screenWithFallback(fake({ 1: { matched: false }, 2: new Error("timeout") }), [1, 2]);
  assert.equal(isClear(s), false);
});

test("a match on the first clear miner stops there (no shopping for a clean answer)", async () => {
  const s = await screenWithFallback(fake({ 1: { matched: true, signal: SIG }, 2: { matched: false, signal: SIG } }), [1, 2]);
  assert.equal(s.miner, 1);
  assert.equal(s.matched, true);
});

test("a non-boolean matched value is not clear", () => {
  assert.equal(isClear({ matched: "ok", signal: SIG }), false);
});
