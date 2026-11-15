// Headline classification cases taken from real answers. Run: node --test miner/test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../lib/adverse.js";

const cases = [
  ["Technology 24h: Meta fined, Binance is about to resume withdrawals", "Binance", null],
  ["Barclays fined £40m over fraud failings", "Barclays PLC", ["fraud", "regulatory_action"]],
  ["Binance Restores Withdrawals Across 87 Networks After $6.3bn Security Breach", "Binance", ["data_breach"]],
  ["Lloyds Banking Group’s quantum leap in fraud detection", "Lloyds Banking Group PLC", null],
  ["Barclays warns customers of Black Friday scams", "Barclays PLC", null],
  ["Barclays (LSE:BARC) Faces Class Action Probe Over Alleged Misleading Disclosures", "Barclays PLC", ["litigation", "investigation"]],
  ["Barclays, Fidera Seek Payout From Bankrupt UAE Remittances Firm", "Barclays PLC", null],
];

for (const [title, entity, want] of cases) {
  test(`${entity}: ${title.slice(0, 60)}`, () => {
    const got = classify(title, entity);
    if (want === null) assert.equal(got, null);
    else assert.deepEqual(got?.categories, want);
  });
}
