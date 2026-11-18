// Spend caps are on by default. These checks run offline: the cap trips before any network call.
import { test } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { tacitum } from "../src/index.js";

const funder = privateKeyToAccount(generatePrivateKey());

test("default total cap ($2) refuses an assessment that would fund more", async () => {
  const t = tacitum({ funder });
  await assert.rejects(t.assess({ name: "Example Ltd", jurisdiction: "GB" }, { fundUsd: 2.5 }), /spend cap/);
});

test("a raised cap is honoured only when set explicitly", async () => {
  const t = tacitum({ funder, maxTotalUsd: 0.05 });
  await assert.rejects(t.assess({ name: "Example Ltd", jurisdiction: "GB" }, { fundUsd: 0.1 }), /maxTotalUsd 0\.05/);
});

test("ask() is capped the same way", async () => {
  const t = tacitum({ funder, maxTotalUsd: 0.01 });
  await assert.rejects(t.ask("NEWS_SEARCH_GENERAL", { query: "a" }, { decoys: [{ query: "b" }] }), /spend cap/);
});
