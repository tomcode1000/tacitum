# Counterparty assessment: Barclays PLC

**Overall: FLAG** · jurisdiction GB · 2026-11-15T13:48:20.417Z

| Check | Verdict |
|---|---|
| Sanctions (two independent miners) | CLEAR |
| Company registry | CLEAR |
| Regulatory filings | INFO |
| Adverse news | FLAG |

**Cost:** $0.06 across 6 paid Telegraph calls, paid by `0xa327b26325B6A0de2BC28aFCbcf4ddd2b37Fb992`.
**Receipts:** 6 of 6 re-verified against the public signal record (payer and settlement tx match).

## Evidence

### Sanctions
- Counterproof Sanctions Screener: matched = false, lists: US OFAC SDN and non-SDN Consolidated lists (published 2026-11-13), UN Security Council Consolidated List (published 2026-11-15), EU Consolidated Financial Sanctions List (published 2026-10-23), UK Sanctions List (published 2026-11-12) · $0.01 · signal `0x48e236aa…067393`
- Sanctions Name Evidence: matched = null · $0.01 · signal `0x0cf21754…978b58`
- LiveCert — Sourced Answers for Agents: matched = false · $0.01 · signal `0xb1f81e44…51f677`

### Company registry
- ZK Corporate Registry — Exact Identity and Status: BARCLAYS PLC · id 00048839 · active = true · $0.01 · signal `0x2dbbd8ea…b427e1`
- 5185: no answer (404, miner_not_found)

### Regulatory filings
- Filing Window: 242 filings in the last 12 months · $0.01 · signal `0x91a46a3f…0a0121`

### Adverse news
- Tacitum Adverse Media Screen: 21 adverse items on Barclays, risk high (21 sources) · $0.01 · signal `0x95611954…11e70d`

## Private mode (screened pool)

| | |
|---|---|
| Payer | one-time wallet `0xa327b26325B6A0de2BC28aFCbcf4ddd2b37Fb992`, used for this assessment only |
| Cover | 4 complete assessments bought together, checks shuffled and spaced with random gaps |
| Total paid | $0.21 for all 4 (this memo's share $0.06) |
| Observer picking the real one | blind guess 0.25; best measured attacker 0.26 (95% interval 0.1–0.49, 16 runs) |
| Funding | the Tacitum screened pool `0x615cacc9f7613e435a5c39e3ac55efa16e442f11` paid $1 into the payer's escrow through a zero-knowledge withdraw, tx `0x54ba86db…ffa510`. The desk's deposit is one of 8 approved deposits, each screened through Telegraph sanctions before it could be spent |

The feed shows 4 counterparties assessed by a new wallet, in no particular order: `Barclays PLC`, `GSK PLC`, `AstraZeneca PLC`, `National Grid PLC`. Nothing in the questions marks which one the desk wanted.

**Funding:** the payer was funded by the pool, not by the desk. Anyone can see which wallets deposited, but not which deposit paid for this assessment: it is one of 8 approved deposits, so that set size is the number to watch. On testnet the other depositors are seeded by us.

Decoy results stay in the local run record and are not part of this memo.
