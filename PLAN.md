# Tacitum build plan

Telegraph Hackathon Season II, Apps & Agents (Mission 03). Deadline **1 Dec 2026, 23:59 UTC**.

Goal from the Telegraph mod: show **privacy, verifiable purchases and a useful institutional outcome together**, keep pooled funding compatible with audit and authorization, and ship something other builders can adopt.

## What judges score, and where we earn it

| Category | Pts | How Tacitum earns it |
|---|---|---|
| Technical quality and mainnet readiness | 35 (min 24) | ZK pool with screened deposits, decoy engine, measured privacy, tests, spend caps |
| Commercial viability | 25 | A real desk workflow (counterparty assessment) that cannot run on Telegraph today |
| Independent adoption and retention | 10 | Drop-in fetch wrapper and MCP server that other Season II teams use |
| Telegraph integration quality | 5 | Direct miner calls, receipts re-verified, upstream issue for a hash-only feed |
| Reproducibility and proof | 5 | One-command runs, evidence folder, receipts, video |
| Organic growth and developer activation | 20 | Tutorial, weekly X posts, helping other teams integrate |

## Phases

### P1: Counterparty assessment, in the open (3–7 Nov)
The institutional workflow, first without privacy, so we have the baseline.
- [x] x402 payer wallet and first paid call
- [x] Paid client: serialized payments (concurrent payments from one payer fail with a bare 402), retries, receipts
- [x] Miner probe: 26 candidates tested against known answers (`data/miner-probe.json`); about a third were usable
- [x] `assess <counterparty>`: sanctions (two miners), company registry (two miners), regulatory filings, adverse news
- [x] Assessment memo: verdict per check, cost line, every receipt and signal hash, re-verified against `/engine/v1/signal/{hash}`
- [ ] News relevance: NewsWire returned an unrelated GOV.UK story for "Barclays PLC"; filter by entity name or try other miners
- [ ] Filings for non-US entities (zk-filing only knows SEC issuers)
- [ ] Wallet checks when the counterparty is on chain

### P2: Decoy engine and privacy measurement (7–12 Nov)
- [x] Feed sampler: pull the public feed and model what real questions look like per intent (names, jurisdictions, timing)
- [x] Decoy generator: k−1 realistic decoys per real question, timing jitter and batching
- [x] Attacker: a classifier that tries to pick the real question out of the feed
- [x] Privacy score: attacker success rate against the ideal 1/k, published per run
- [x] Filer matching: one survey of 117 well-known names' filings answers (data/filers.json) from a separate wallet; decoys match the target's filer status and filing volume
- [x] Decoy reuse across runs: confirmed on saved v4 runs (a "rarest name" attacker got 0.40 on the 5 runs that shared filer decoys, chance 0.25). Fix: fixed, shared cover sets (`data/cover-sets.json`, `scripts/filer-covers.mjs`); the 16 SEC filers are partitioned into 4 groups, so a group looks the same whichever member was wanted. The experiment now scores the cross-run attacker too (fd0d499)
- [x] v5 privacy experiment (13 Nov): 16 fresh live runs on the re-probed miners with cover sets, $3.45. first 0.25, famous 0.26, format 0.20, learned 0.25, rarest (cross-run) 0.25; interval 0.10–0.49. Archive: data/runs-v5, data/privacy-results-v5.json
- [ ] More runs to narrow the interval (16 runs cannot rule out an attacker up to 0.49)
- [ ] Bigger filer pool (US-listed names): only 16 famous UK filers exist, so filer decoys sit up to 0.94 apart on fame plus filings

Results so far (k=4, chance 0.25, best attacker, 95% Wilson interval):

| Decoys | Runs | Best attacker | Interval | Main tell |
|---|---|---|---|---|
| random | 8 | 1.00 (learned) | 0.68–1.00 | fame, format |
| matched v1 (fame, format) | 16 | 0.50 (learned) | 0.28–0.72 | registry answer |
| matched v2 (+ registry) | 16 | 0.57 (famous) | 0.33–0.77 | SEC filings count |
| matched v3 (+ filer status) | 16 | 0.45 (famous) | 0.23–0.67 | filing volume |
| matched v4 (+ filing volume) | 16 | 0.38 (learned) | 0.18–0.61 | none clear |
| matched v5 (+ cover sets, new miners) | 16 | 0.25 (all five) | 0.10–0.49 | none |

In v2 every obscure target was hidden (all four parties: 0 fame, 0 news, 0 filings). Four of the eight famous targets (Barclays, HSBC, Lloyds, AstraZeneca) were the only party with SEC filings.

v3 and v4 redo only the famous runs whose decoy rule changed; the obscure runs carry over unchanged. In v4 every simple attacker is at chance (first 0.19, famous 0.28, format 0.19); the learned one's 6/16 is not distinguishable from chance with 16 runs. The survey wallet's funder is two hops from the payer's funder on chain (a 2025 transfer), a testnet shortcut the P4 pool removes. Archives: data/runs-v1, -v2, -v3.

### P3: Milestone checkpoint (14 Nov)
- [x] Re-probed miners (13 Nov): 9002 left; 7393 stopped resolving UK names. Now sanctions 731002/710637/4433 (asks until two give a clear answer), registry 77393+5185
- [x] Gotcha: a payer called seconds after funding is seen as empty until epoch close; `private` waits 2 min after funding and stops at the first refusal
- [x] Private mode v0: decoys plus a fresh payer wallet per assessment (funding still linkable, stated plainly). `npm run private -- "<name>" GB [k]`: the desk funds a one-time wallet's Telegraph escrow with `depositUSDCFor`, so the payer never holds ETH or sends a transaction; memo states the funding link (src/payers.js)
- [ ] Post progress to the Telegraph mod and on X (drafts with v5 numbers in `evidence/milestone-drafts.md`; send 14 Nov)
- [ ] Push fd0d499 and later commits to the private repo
- [ ] Decide on Track 1: if a check had no good miner in P1, build that miner (decision gate, 10 Nov)

### P4: Screened funding pool (14–21 Nov)
- [ ] Pool contract on Sepolia: fixed-denomination USDC deposits, Merkle tree of commitments
- [ ] Deposit gate: depositor wallet screened through Telegraph's sanctions intent; only passing deposits enter the approved set
- [ ] Withdraw circuit (Circom + Groth16): prove a deposit is in the approved set without revealing which, nullifier against double spend
- [ ] Relayer: withdraws to one-time payer wallets (EIP-3009 means they never need gas)

### P5: Audit (21–25 Nov)
- [ ] Encrypted receipt log per assessment, readable with the buyer's viewing key
- [ ] Auditor view: full record of every question, answer and payment for whoever holds the key
- [ ] Stretch: proof of total spend without revealing the questions

### P6: Adoption and demo (25–28 Nov)
- [x] `tacitum` library (fd0d499): `tacitum({ funder }).assess(...)` and `.ask(intent, params, { decoys })`; state in `.tacitum/`, 21 kB pack, no keys or .env
- [x] MCP server `tacitum-mcp` with `private_assess` and `private_ask` (starts and lists tools; no paid call through it yet)
- [ ] Paid call through the MCP server
- [ ] Publish to npm as `tacitum` (needs user npm login; target 16 Nov so other teams get two weeks), or make the repo public early: user to decide
- [ ] Web demo for the 20 Nov showcase: attacker view and Tacitum view side by side, plus a privacy dial (k against cost and attacker success)
- [ ] Upstream issue on the Telegraph bounties repo proposing a hash-only feed option

### P7: Ship (28 Nov – 1 Dec)
- [ ] Tests for contracts, circuit and client; spend caps on by default
- [ ] README and tutorial; answers to the five commercial questions
- [ ] 2–5 min demo video
- [ ] Make the repo public and submit through the H2 site before 1 Dec 23:59 UTC

## Ground rules
- Only our own wallets appear in full in any demo; other feed rows are shown in aggregate.
- Every number in the README is measured live, with the evidence committed.
- The repo went public on 13 Nov 2026 so other teams can adopt it early; keys, .env and raw feed data stay gitignored.
