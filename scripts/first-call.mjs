// One paid Telegraph request over x402, then shows what the public feed reveals about it.
// This is the baseline Tacitum exists to fix: the question and the payer are both public.
import fs from "node:fs";
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { NETWORK, USDC, NODE, loadAccount } from "./config.mjs";

const account = loadAccount();
const pay = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: NETWORK, client: new ExactEvmScheme(account) }],
  // Telegraph's test USDC is not a default asset, so allow it explicitly and cap each payment at $0.10.
  spendControls: { allowedAssets: [{ network: NETWORK, asset: USDC, maxAmountPerPayment: "100000" }] },
});

const body = { intent: "SANCTIONS_SCREENING_MATCH_GENERAL", params: { name: process.argv[2] || "Acme Trading Ltd" } };
const res = await pay(`${NODE}/engine/v1/ask`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const data = await res.json();
if (!res.ok) {
  console.error(`HTTP ${res.status}`, JSON.stringify(data, null, 2));
  process.exit(1);
}

const paid = res.headers.get("PAYMENT-RESPONSE");
const receiptHeader = res.headers.get("X-TELEGRAPH-RECEIPT");
const receipt = receiptHeader ? JSON.parse(Buffer.from(receiptHeader, "base64").toString()) : null;
console.log("miner      ", data.miner_name || data.miner_id);
console.log("cost       ", data.cost_usd);
console.log("signal     ", data.signal_hash);
console.log("payment    ", paid ? decodePaymentResponseHeader(paid) : null);
console.log("result     ", JSON.stringify(data.result).slice(0, 300));

// What anyone can see, with no login.
const pub = await (await fetch(`${NODE}/engine/v1/signal/${data.signal_hash}`)).json();
console.log("\nPublic record of this call:");
console.log("  wallet   ", pub.signal?.wallet_address);
console.log("  question ", pub.payload?.request);
console.log("  tx       ", pub.signal?.tx_hash);

fs.mkdirSync("evidence", { recursive: true });
fs.writeFileSync(`evidence/${data.signal_hash}.json`, JSON.stringify({ request: body, response: data, receipt, public: pub }, null, 2));
console.log(`\nSaved evidence/${data.signal_hash}.json`);
