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
- [ ] Feed sampler: pull the public feed and model what real questions look like per intent (names, jurisdictions, timing)
- [ ] Decoy generator: k−1 realistic decoys per real question, timing jitter and batching
- [ ] Attacker: a classifier that tries to pick the real question out of the feed
- [ ] Privacy score: attacker success rate against the ideal 1/k, published per run

### P3: Milestone checkpoint (14 Nov)
- [ ] Private mode v0: decoys plus a fresh payer wallet per assessment (funding still linkable, stated plainly)
- [ ] Post progress to the Telegraph mod and on X
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
- [ ] `tacitum` npm package: drop-in replacement for `@x402/fetch` with a privacy setting
- [ ] MCP server so agents can run a private assessment as a tool
- [ ] Web demo: attacker view and Tacitum view side by side, plus a privacy dial (k against cost and attacker success)
- [ ] Upstream issue on the Telegraph bounties repo proposing a hash-only feed option

### P7: Ship (28 Nov – 1 Dec)
- [ ] Tests for contracts, circuit and client; spend caps on by default
- [ ] README and tutorial; answers to the five commercial questions
- [ ] 2–5 min demo video
- [ ] Make the repo public and submit through the H2 site before 1 Dec 23:59 UTC

## Ground rules
- Only our own wallets appear in full in any demo; other feed rows are shown in aggregate.
- Every number in the README is measured live, with the evidence committed.
- The repo stays private until submission.
