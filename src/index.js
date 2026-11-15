// Tacitum: private buying on Telegraph.
//
//   import { tacitum } from "tacitum";
//   const t = tacitum({ funder });                       // a viem account holding test USDC + a little Sepolia ETH
//   const { memo } = await t.assess({ name: "Barclays PLC", jurisdiction: "GB" });
//   const { answer } = await t.ask("SANCTIONS_SCREENING_MATCH_GENERAL", { name: "Acme Ltd" },
//                                  { decoys: [{ name: "Brindle Ltd" }, { name: "Corvel Ltd" }, { name: "Dunmore Ltd" }] });
//
// Every call is bought by a one-time wallet whose Telegraph escrow the funder tops up, together
// with k-1 decoys, shuffled and spaced. Receipts stay verifiable against the public signal record.
import { createClient } from "./telegraph.js";
import { privateAssess } from "./private.js";
import fs from "node:fs";
import { oneTimePayer, poolPayer } from "./payers.js";
import { newNote, saveNote, loadNotes, deposit as poolDeposit, approvedLeaves } from "./pool.js";
import { renderMemo } from "./memo.js";
import { assess as openAssess } from "./assess.js";

export { createClient, publicRecord } from "./telegraph.js";
export { privateAssess } from "./private.js";
export { pickDecoys, coverSetFor } from "./decoys.js";
export { oneTimePayer, poolPayer, escrowBalance } from "./payers.js";
export { newNote, Tree, prove, verifyLocally, approvedLeaves } from "./pool.js";
export { renderMemo } from "./memo.js";
export { CHECKS } from "./assess.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// The node only sees a fresh escrow deposit after a delay, and a payer it has seen empty stays
// refused until the epoch closes, so no paid call goes out sooner than this after funding.
export const FUNDING_SETTLE_MS = 120_000;

// Measured attacker success (data/privacy-results.json, shipped), for memos at the k it was measured.
function measuredPrivacy(k) {
  try {
    const r = JSON.parse(fs.readFileSync(new URL("../data/privacy-results.json", import.meta.url), "utf8"));
    const m = r.k === k ? r.strategies.matched : null;
    return m && { best: Math.max(m.first, m.famous, m.format, m.learned, m.rarest ?? 0).toFixed(2), ci: m.bestCI95, runs: m.runs };
  } catch { return null; }
}

// The screened pool on Sepolia (contracts/ScreenedPool.sol), shipped with the package.
export const POOL = JSON.parse(fs.readFileSync(new URL("../data/pool.json", import.meta.url), "utf8"));

// pool: { relayer } funds each one-time payer from the screened pool instead of from the funder.
// The relayer sends the withdraw transaction, so it must be a wallet with no on-chain link to the
// funder; using the funder itself would tie the withdraw back to the desk.
export function tacitum({ funder, k = 4, maxPerPaymentUsd = 0.1, pool = null, log = () => {} } = {}) {
  if (!funder?.address) throw new Error("tacitum({ funder }) needs a viem account that can pay");
  if (pool && (!pool.relayer?.address || pool.relayer.address.toLowerCase() === funder.address.toLowerCase())) {
    throw new Error("pool mode needs { relayer }: a separate wallet with Sepolia ETH and no link to the funder");
  }
  const maxPerPayment = String(Math.round(maxPerPaymentUsd * 1e6));

  async function freshPayer(fundUsd, label) {
    const payer = pool
      ? await poolPayer(pool.relayer, POOL, label)
      : await oneTimePayer(funder, fundUsd.toFixed(2), label);
    log(`one-time payer ${payer.account.address} funded with $${payer.amountUsd} by ${pool ? "the screened pool" : "the funder"} (tx ${payer.fundingTx})`);
    return { ...payer, client: createClient(payer.account, { maxPerPayment }) };
  }

  return {
    // Deposit one fixed amount into the screened pool. The note (the secret that spends it) is
    // saved under TACITUM_KEYS/notes; the deposit becomes spendable once the screener has run the
    // funder's wallet through Telegraph sanctions and approved it.
    async deposit() {
      const note = await newNote();
      const depositTx = await poolDeposit(funder, POOL.pool, note);
      const file = saveNote(POOL.pool, note, { depositor: funder.address, depositTx, desk: true });
      log(`deposited into ${POOL.pool}, tx ${depositTx}; note saved to ${file}`);
      return { pool: POOL.pool, depositTx, note: file, status: "pending screening" };
    },

    // Where the pool stands: approved deposits (the set a withdraw hides in) and this funder's notes.
    async poolStatus() {
      const approved = await approvedLeaves(POOL.pool, POOL.deployBlock);
      const mine = loadNotes(POOL.pool).filter((n) => n.depositor?.toLowerCase() === funder.address.toLowerCase());
      return { pool: POOL.pool, approvedSet: approved.length, myNotes: mine.length };
    },

    // Counterparty assessment (sanctions, registry, filings, news) among k-1 matched decoys.
    async assess(counterparty, { fundUsd = 0.1 * k } = {}) {
      const payer = await freshPayer(fundUsd, `assess k=${k}`);
      const run = await privateAssess(payer.client, counterparty, { k, notBefore: payer.fundedAt + FUNDING_SETTLE_MS });
      if (!run.costUsd) throw new Error("no call was paid; the node refused the one-time payer");
      const real = {
        ...run.real,
        privacy: { k, parties: run.parties, costUsd: run.costUsd, funder: payer.funder, fundedUsd: payer.amountUsd, fundingTx: payer.fundingTx, viaPool: Boolean(payer.viaPool), anonymitySet: payer.anonymitySet, measured: measuredPrivacy(k) },
      };
      return { assessment: real, memo: renderMemo(real), record: { ...run, real } };
    },

    // Any intent: the real params plus caller-supplied decoy params for the same intent. The
    // decoys must look like the real question (same shape, similar values), or they hide nothing.
    async ask(intent, params, { decoys = [], minerId, fundUsd, jitterMs = [300, 2500] } = {}) {
      if (decoys.length < 1) throw new Error("ask() needs at least one decoy; k-1 is the usual count");
      const payer = await freshPayer(fundUsd ?? 0.03 * (decoys.length + 1), `ask ${intent}`);
      const wait = payer.fundedAt + FUNDING_SETTLE_MS - Date.now();
      if (wait > 0) await sleep(wait);
      const jobs = shuffle([{ real: true, params }, ...decoys.map((p) => ({ real: false, params: p }))]);
      let answer;
      const cover = [];
      for (const job of jobs) {
        await sleep(jitterMs[0] + Math.random() * (jitterMs[1] - jitterMs[0]));
        const res = minerId ? await payer.client.askMiner(minerId, intent, job.params) : await payer.client.ask(intent, job.params);
        if (job.real) answer = res;
        else cover.push({ params: job.params, status: res.status, signal: res.data?.signal_hash });
      }
      return { answer, cover, payer: payer.account.address, fundingTx: payer.fundingTx };
    },

    // The same assessment with no privacy: what the feed shows today. Useful as a baseline.
    async assessOpen(counterparty) {
      const a = await openAssess(createClient(funder, { maxPerPayment }), counterparty);
      return { assessment: a, memo: renderMemo(a) };
    },
  };
}
