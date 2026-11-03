// Paid Telegraph client. Every paid call goes through one queue: concurrent x402
// payments from the same payer are rejected with a bare 402, which looks exactly
// like not paying, so we serialize and retry instead.
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { NETWORK, USDC, NODE } from "../scripts/config.mjs";

const STAGGER_MS = 450;
const RETRIES = 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createClient(account, { maxPerPayment = "100000" } = {}) {
  const pay = wrapFetchWithPaymentFromConfig(fetch, {
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
      const paid = res.headers.get("PAYMENT-RESPONSE");
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
    // Direct: we pick the miner. A predicted failure comes back as an unpaid 422.
    askMiner: (minerId, intent, params) => serial(() => post(`/engine/v1/ask/${minerId}`, { intent, params })),
  };
}

// Anyone can fetch this, no payment or login. It is what the public sees about a call.
export async function publicRecord(signalHash) {
  const res = await fetch(`${NODE}/engine/v1/signal/${signalHash}`);
  return res.ok ? res.json() : null;
}
