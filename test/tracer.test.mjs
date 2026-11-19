// Tracer scoring rule: the probability its top pick is the real deposit, with ties shared.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreHeuristics } from "../src/tracer.js";

const c = (commitment, depositBlock, approvalBlock, depositSender, depositorNonce) => ({ commitment, depositBlock, approvalBlock, depositSender, depositorNonce });

test("timing attack wins when the real deposit is the most recent one", () => {
  const s = scoreHeuristics([c("a", 10, 11, "r", 0), c("b", 20, 21, "r", 0), c("real", 30, 31, "r", 0)], "real", { sender: "r" });
  assert.equal(s.latestDeposit, 1);
  assert.equal(s.oldestDeposit, 0);
  assert.equal(s.chance, 1 / 3);
});

test("ties share the score; a feature every candidate shares scores chance", () => {
  const s = scoreHeuristics([c("a", 10, 11, "r", 0), c("real", 10, 11, "r", 0), c("b", 5, 6, "r", 0), c("d", 1, 2, "r", 0)], "real", { sender: "r" });
  assert.equal(s.latestDeposit, 0.5);
  assert.equal(s.sameRelayer, 0.25);
  assert.equal(s.freshestDepositor, 0.25);
});

test("a heuristic that points elsewhere scores 0", () => {
  const s = scoreHeuristics([c("a", 30, 31, "x", 0), c("real", 10, 11, "r", 5)], "real", { sender: "x" });
  assert.equal(s.latestDeposit, 0);
  assert.equal(s.sameRelayer, 0);
  assert.equal(s.freshestDepositor, 0);
});
