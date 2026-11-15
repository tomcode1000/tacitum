// Audit envelope: round trip, wrong key, tampering. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { auditorKeygen, seal, open } from "../src/audit.js";

const k = auditorKeygen();
const record = { kind: "tacitum-audit", real: "Barclays PLC", parties: ["Barclays PLC", "GSK PLC"], amount: 21n };

test("the auditor opens what was sealed to them", () => {
  const back = open(seal(record, k.publicKey), k.privateKey, k.publicKey);
  assert.equal(back.real, "Barclays PLC");
  assert.equal(back.amount, "21");
});

test("another key cannot open it", () => {
  const other = auditorKeygen();
  assert.throws(() => open(seal(record, k.publicKey), other.privateKey, other.publicKey), /different auditor key/);
});

test("a changed byte is detected", () => {
  const env = seal(record, k.publicKey);
  const ct = Buffer.from(env.ct, "base64url");
  ct[5] ^= 1;
  env.ct = ct.toString("base64url");
  assert.throws(() => open(env, k.privateKey, k.publicKey));
});

test("the envelope reveals nothing readable", () => {
  const env = JSON.stringify(seal(record, k.publicKey));
  assert.ok(!env.includes("Barclays") && !env.includes("GSK"));
});
