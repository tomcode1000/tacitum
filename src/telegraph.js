// Paid Telegraph client. Every paid call goes through one queue: concurrent x402
// payments from the same payer are rejected with a bare 402, which looks exactly
// like not paying, so we serialize and retry instead.
import fs from "node:fs";
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { NETWORK, USDC, NODE } from "../scripts/config.mjs";

const STAGGER_MS = 450;
const RETRIES = 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Escrow rail: answer the 402 by signing the node's escrow message (EIP-191) instead of an
// on-chain transfer. Nothing settles per call, so a call takes as long as the miner does,
// and no per-call transaction links the payer to the question.
function escrowFetch(account, maxPerPayment) {
  return async (url, init) => {
    const first = await fetch(url, init);
    if (first.status !== 402) return first;
    const challenge = JSON.parse(Buffer.from(first.headers.get("PAYMENT-REQUIRED") || "", "base64").toString() || "{}");
    const offer = challenge.accepts?.find((a) => a.scheme === "escrow");
    if (!offer) return first;
    if (BigInt(offer.amount) > BigInt(maxPerPayment)) throw new Error(`price ${offer.amount} uUSDC is over the cap ${maxPerPayment}`);

    // Use the node's clock, not ours: a local clock running ahead gives "authorization is not valid yet".
    // The node allows a window of at most 2 minutes.
    const now = Math.floor((Date.parse(first.headers.get("Date")) || Date.now()) / 1000);
    const authorization = {
      from: account.address.toLowerCase(),
      to: offer.payTo,
      value: offer.amount,
      validAfter: String(now - 30),
      validBefore: String(now + 85),
      nonce: `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`,
    };
    const message = offer.extra.message
      .replace("{from}", authorization.from)
      .replace("{nonce}", authorization.nonce)
      .replace("{validAfter}", authorization.validAfter)
      .replace("{validBefore}", authorization.validBefore);
    const signature = await account.signMessage({ message });
    const header = Buffer.from(JSON.stringify({ x402Version: 2, scheme: "escrow", network: NETWORK, payload: { signature, authorization } })).toString("base64");
    return fetch(url, { ...init, headers: { ...init.headers, "X-PAYMENT": header } });
  };
}

export function createClient(account, { maxPerPayment = "100000", rail = "escrow" } = {}) {
  const pay =
    rail === "escrow"
      ? escrowFetch(account, maxPerPayment)
      : wrapFetchWithPaymentFromConfig(fetch, {
          schemes: [{ network: NETWORK, client: new ExactEvmScheme(account) }],
          spendControls: { allowedAssets: [{ network: NETWORK, asset: USDC, maxAmountPerPayment: maxPerPayment }] },
        });

  let queue = Promise.resolve();
  const serial = (fn) => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {}).then(() => sleep(STAGGER_MS));
    return run;
  };

  async function post(path, body) {
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await pay(`${NODE}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (err) {
        // Dropped connections (ECONNRESET) happen on the dev node; retry, then report.
        if (attempt < RETRIES) {
          await sleep(STAGGER_MS * (attempt + 2));
          continue;
        }
        return { ok: false, status: 0, data: { error: String(err.cause?.code || err.message) }, payment: null, receipt: null };
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 402 && attempt < RETRIES) {
        await sleep(STAGGER_MS * (attempt + 2));
        continue;
      }
      const paid = res.headers.get("PAYMENT-RESPONSE") || res.headers.get("X-PAYMENT-RESPONSE");
      const receipt = res.headers.get("X-TELEGRAPH-RECEIPT");
      return {
        ok: res.ok,
        status: res.status,
        data,
        payment: paid ? decodePaymentResponseHeader(paid) : null,
        receipt: receipt ? JSON.parse(Buffer.from(receipt, "base64").toString()) : null,
      };
    }
  }

  return {
    payer: account.address,
    // Auto-routed: the node picks the miner, with a fallback lined up.
    ask: (intent, params) => serial(() => post("/engine/v1/ask", { intent, params })),
    // Direct: we pick the miner. A predicted failure comes back as an unpaid 422. The node's
    // predictor has false positives (it rejected an 11-byte name as over a 256-byte limit), and
    // we chose these miners by testing them, so resend once anyway: it is charged only if it runs.
    askMiner: (minerId, intent, params) =>
      serial(async () => {
        const res = await post(`/engine/v1/ask/${minerId}`, { intent, params });
        if (res.status !== 422) return res;
        const retry = await post(`/engine/v1/ask/${minerId}`, { intent, params, acknowledge_warnings: true });
        return { ...retry, warnings: res.data?.warnings };
      }),
  };
}

// Anyone can fetch this, no payment or login. It is what the public sees about a call.
// Records never change once written, so they are cached on disk.
const RECORDS = "data/cache/signals";

export async function publicRecord(signalHash) {
  const file = `${RECORDS}/${signalHash}.json`;
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${NODE}/engine/v1/signal/${signalHash}`);
      if (res.status === 404) return null;
      if (res.ok) {
        const record = await res.json();
        fs.mkdirSync(RECORDS, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(record));
        return record;
      }
    } catch {
      // dropped connection; retry
    }
    await sleep(1000 * (attempt + 1));
  }
  return null;
}
