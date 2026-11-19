# Evidence: a judge's guide

Two minutes, five claims, and a way to check each one yourself without trusting us.

**What Tacitum is:** the private, compliant buying layer for Telegraph. An agent or desk buys a counterparty check (sanctions, registry, filings, adverse media) hidden among matched decoys, paid by a one-time wallet funded from a sanctions-screened pool. Every answer keeps its Telegraph receipt, and a sealed record lets an auditor re-check all of it.

Everything below is on Sepolia testnet against Telegraph's public devnode.

## The two-minute path

1. Read the table at the top of the [README](README.md).
2. Open the live site: https://54-255-109-186.sslip.io (Live run, then Screened pool).
3. Pick any one proof below and click its verify link.

## 1. Every answer is a real, paid Telegraph answer

**Claim:** the Barclays run of 15 Nov 2026 bought every answer through Telegraph, and all of its receipts verify.

**Check it yourself:**
- Open https://devnode.telegraphprotocol.com/engine/v1/signal/0x95611954943fbc324bb13bcf66b8155a0044e0c5e64cee8ee8977762a911e70d (the news answer for the real target). Then compare the payer with `0xa327b26325B6A0de2BC28aFCbcf4ddd2b37Fb992`.
- The full list of receipts is in [assessments/2026-11-15-private-barclays-plc.json](assessments/2026-11-15-private-barclays-plc.json).

## 2. The desk's wallet never touches the purchase

**Claim:** the payer was funded by a zero-knowledge withdraw from the screened pool, not by the desk.

**Check it yourself:**
- Open the pool [0x615c…2f11 on Etherscan](https://sepolia.etherscan.io/address/0x615cacc9f7613e435a5c39e3ac55efa16e442f11) and the [withdraw transaction](https://sepolia.etherscan.io/tx/0x54ba86dbc949f1aea37d0e28c3238148ac77abbfc503c2787cb593c735ffa510).
- The withdraw sends funds into the payer's Telegraph escrow. The desk wallet `0xa722…23c2` appears only as one depositor among 16.

**Where to look:** [contracts/ScreenedPool.sol](contracts/ScreenedPool.sol) and [circuits/withdraw.circom](circuits/withdraw.circom).

## 3. Every depositor is screened through Telegraph first

**Claim:** a deposit cannot be spent until its depositor has been screened through a Telegraph sanctions miner. The receipt hash is stored on chain with the approval.

**Check it yourself:**
- On the pool contract above, read the `Approved` events. Each one carries a signal hash; open it at `/engine/v1/signal/<hash>`.
- The screening outputs are in [data/pool-v1/screening/](data/pool-v1/screening/).

## 4. The market cannot tell who was screened

**Claim:** across 32 live runs with 3 decoys each, the best of our attackers picks the real company 31% of the time (95% interval 18–49%). A blind guess scores 25%.

**Check it yourself:**
- Run `node scripts/experiment.mjs score`. It is free: it re-scores the saved runs and writes [data/privacy-results.json](data/privacy-results.json).
- The attackers are in [scripts/experiment.mjs](scripts/experiment.mjs).

**Honest reading:** 0.31 is within sampling error of chance, but it is not proof of zero leakage.

## 5. An auditor can re-check everything, and nobody else can

**Claim:**
- Each assessment is sealed to an auditor key (X25519, HKDF-SHA256, AES-256-GCM).
- The auditor's verifier re-checks every claim against public data. It confirmed 27 of 27 claims for Barclays, and 30 of 30 for the Tesco run that an AI agent made on its own.

**Check it yourself:**
- Read the verifier output in [evidence/audit-verify-2026-11-15-barclays.txt](evidence/audit-verify-2026-11-15-barclays.txt) and [evidence/audit-verify-2026-11-15-agent-tesco.txt](evidence/audit-verify-2026-11-15-agent-tesco.txt). The latest run, Vodafone on 19 Nov 2026 through the current pool (16 approved deposits, screened with miner fallback), verified 29 of 29: [evidence/audit-verify-2026-11-19-vodafone.txt](evidence/audit-verify-2026-11-19-vodafone.txt).
- The command is `node scripts/audit.mjs open <record> --verify`.
- The agent's sanitized transcript is in [evidence/agent-run-2026-11-15-tesco-plc.jsonl](evidence/agent-run-2026-11-15-tesco-plc.jsonl).

## Second entry: the adverse-media miner (Track 02)

- **Listing:** [active on Anjoman](https://anjoman.ai/dashboard/explore/miners/tacitum-adverse-media), id 7314402, registration 5307.
- **Blind test** on headlines never seen while tuning: precision 0.91, recall 0.71, F1 0.80. Rerun it with `node miner/eval/run.mjs`.
- **Paid calls:** receipts are in `evidence/miner-paid-call-*.json`. For example, the [signal 0xdf10…8526](https://devnode.telegraphprotocol.com/engine/v1/signal/0xdf108a624160b162b559045c6ca2418012d93ae16b753bd30acf2c3f26808526).

## Tests

`npm test` runs 31 tests, the same suite as CI ([summary](docs/assets/test-summary.json)). They cover:
- the withdraw circuit and Merkle tree
- the audit envelope
- the spend caps
- the screening fallback (a down miner, or an answer without a receipt, never approves a deposit)
- the watchlist monitor (verdicts, change detection, decoys bought but not reported)
- the adverse-media classifier
- the ScreenedPool contract on a local chain: gasless deposits, screener-only approval, refunds, reclaim after 24h, withdraw into escrow, double spend, unknown roots, bound recipients and the fee cap

## What is not proven yet

- **No outside users.** Every request so far was paid by our own wallets. [evidence/miner-usage-2026-11-18.json](evidence/miner-usage-2026-11-18.json) counts them by payer.
- **Self-seeded pool.** We made the deposits that hide the desk ourselves. A real anonymity set needs independent depositors.
- **Testnet only.** It has not been audited. [THREAT-MODEL.md](THREAT-MODEL.md) lists what would have to change before mainnet.
