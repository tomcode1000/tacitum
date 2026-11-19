// Supplier check decision rules, offline: every check, the three-way match, and the final decision.
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeRegistry, judgeSanctions, judgeTls, judgeUrl, judgeFx, threeWayMatch, decide, hostOf } from "../src/supplier.js";

const ans = (...results) => ({ answers: results.map((r) => (r instanceof Error ? { ok: false, result: null } : { ok: true, result: r })) });
const supplier = { legalName: "Siemens Aktiengesellschaft", jurisdiction: "DE", lei: "W38RGI023J3WT1HWRP32", website: "https://www.siemens.com" };
const docs = (o = {}) => ({
  invoice: { currency: "EUR", units: 12, unitPrice: 700, total: 8400, ...o.invoice },
  po: { currency: "EUR", units: 12, unitPrice: 700, ...o.po },
  acceptance: { unitsAccepted: 12, date: "2026-11-10", ...o.acceptance },
});

test("registry passes only when two registries confirm an active company with the same legal name", () => {
  const good = { legal_name: "Siemens Aktiengesellschaft", active: true, registration_id: "HRB 6684" };
  assert.equal(judgeRegistry(ans(good, good), supplier).status, "PASSED");
  assert.equal(judgeRegistry(ans(good, new Error()), supplier).status, "MISSING");
  assert.equal(judgeRegistry(ans(good, { ...good, active: false }), supplier).status, "FAILED");
  assert.equal(judgeRegistry(ans({ active: null, candidates: [{}, {}] }, new Error()), supplier).why.includes("ambiguous"), true);
  assert.equal(judgeRegistry(ans({ legal_name: "Other GmbH", active: true }, new Error()), supplier).status, "FAILED");
});

test("sanctions: any match fails, two clear screens pass, one is not enough", () => {
  assert.equal(judgeSanctions(ans({ matched: false }, { matched: false }, new Error())).status, "PASSED");
  assert.equal(judgeSanctions(ans({ matched: false }, { matched: true })).status, "FAILED");
  assert.equal(judgeSanctions(ans({ matched: false }, new Error(), new Error())).status, "MISSING");
});

test("TLS and URL safety", () => {
  assert.equal(judgeTls(ans({ certificate_valid: true }, { certificate_valid: true })).status, "PASSED");
  assert.equal(judgeTls(ans({ certificate_valid: true }, { certificate_valid: false })).status, "FAILED");
  assert.equal(judgeTls(ans(new Error(), new Error())).status, "MISSING");
  assert.equal(judgeUrl(ans({ verdict: "Safe" }, { verdict: "Unknown" })).status, "PASSED");
  assert.equal(judgeUrl(ans({ verdict: "Malicious" }, { verdict: "Safe" })).status, "FAILED");
  assert.equal(judgeUrl(ans({ verdict: "Unknown" })).status, "MISSING");
  assert.equal(hostOf("https://www.siemens.com/de"), "www.siemens.com");
});

test("FX needs two agreeing sources; EUR rate is EUR per USD", () => {
  const inv = docs().invoice;
  const r = judgeFx(ans({ converted_amount: 9233.28 }, { converted_amount: 9233.27 }), ans({ rate: 0.90975 }), inv);
  assert.equal(r.status, "PASSED");
  assert.equal(r.usd, 9233.28);
  assert.equal(judgeFx(ans({ converted_amount: 9233.28 }), ans(new Error()), inv).status, "MISSING");
  assert.equal(judgeFx(ans({ converted_amount: 9900 }), ans({ rate: 0.90975 }), inv).status, "FAILED");
});

test("three-way match catches unit, price, total and acceptance mismatches", () => {
  assert.equal(threeWayMatch(docs()).status, "PASSED");
  assert.match(threeWayMatch(docs({ invoice: { units: 13, total: 9100 } })).why, /units/);
  assert.match(threeWayMatch(docs({ invoice: { unitPrice: 750, total: 9000 } })).why, /unit price/);
  assert.match(threeWayMatch(docs({ invoice: { total: 8500 } })).why, /total/);
  assert.match(threeWayMatch(docs({ acceptance: { unitsAccepted: 10 } })).why, /accepted 10/);
  assert.equal(threeWayMatch({ invoice: docs().invoice }).status, "MISSING");
});

test("decision: any failure holds, any gap reviews, all pass approves", () => {
  const P = { status: "PASSED" }, F = { status: "FAILED" }, M = { status: "MISSING" };
  assert.equal(decide({ a: P, b: P }).decision, "APPROVE");
  assert.equal(decide({ a: P, b: M }).decision, "REVIEW");
  assert.equal(decide({ a: F, b: M }).decision, "HOLD");
});
