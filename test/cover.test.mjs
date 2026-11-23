// Timing rule: the newest deposits cannot be spent, because "most recent deposit" would identify them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hasCover, MIN_LATER_DEPOSITS } from "../src/payers.js";

test("the newest deposit is never spendable", () => {
  assert.equal(hasCover(16, 17), false);
});

test("a deposit becomes spendable once enough newer deposits exist", () => {
  assert.equal(MIN_LATER_DEPOSITS, 3);
  assert.equal(hasCover(14, 17), false);
  assert.equal(hasCover(13, 17), true);
});

test("an unknown deposit is not spendable", () => {
  assert.equal(hasCover(-1, 17), false);
});
