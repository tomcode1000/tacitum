# Counterparty assessment: Barclays PLC

**Overall: REVIEW** · jurisdiction GB · 2026-11-14T07:53:25.410Z

| Check | Verdict |
|---|---|
| Sanctions (two independent miners) | CLEAR |
| Company registry | CLEAR |
| Regulatory filings | INFO |
| Adverse news | REVIEW |

**Cost:** $0.05 across 5 paid Telegraph calls, paid by `0x6f4EB24CCc31A2636d763E3E1Fe3d781C0F7a720`.
**Receipts:** 5 of 5 re-verified against the public signal record (payer and settlement tx match).

## Evidence

### Sanctions
- Counterproof Sanctions Screener: matched = false · $0.01 · signal `0x714fc086…6fd3c3`
- Sanctions Name Evidence: matched = false, lists: OFAC SDN, OFAC Consolidated (non-SDN), UK Sanctions List (entities only), Canada autonomous sanctions (entities only) · $0.01 · signal `0x5471076b…7ed72c`

### Company registry
- ZK Corporate Registry — Exact Identity and Status: BARCLAYS PLC · id 00048839 · active = true · $0.01 · signal `0xe1eecc8f…16e1b0`
- Praman Desk Compliance & Procurement Auditor: BARCLAYS PLC · id 213800LBQA1Y9L22JB70 · active = true · $0.01 · signal `0x7c9959f4…b13a02`

### Regulatory filings
- Filing Window: 242 filings in the last 12 months · $0.01 · signal `0x88fe4f9e…c05934`

### Adverse news
- 7329: no answer (0, UND_ERR_CONNECT_TIMEOUT)
- 302: no answer (0, UND_ERR_CONNECT_TIMEOUT)

## Private mode (screened pool)

| | |
|---|---|
| Payer | one-time wallet `0x6f4EB24CCc31A2636d763E3E1Fe3d781C0F7a720`, used for this assessment only |
| Cover | 4 complete assessments bought together, checks shuffled and spaced with random gaps |
| Total paid | $0.2 for all 4 (this memo's share $0.05) |
| Observer picking the real one | blind guess 0.25; best measured attacker 0.26 (95% interval 0.1–0.49, 16 runs) |
| Funding | the Tacitum screened pool `0x615cacc9f7613e435a5c39e3ac55efa16e442f11` paid $1 into the payer's escrow through a zero-knowledge withdraw, tx `0x9b0c3550…9f0097`. The desk's deposit is one of 4 approved deposits, each screened through Telegraph sanctions before it could be spent |

The feed shows 4 counterparties assessed by a new wallet, in no particular order: `Barclays PLC`, `GSK PLC`, `National Grid PLC`, `AstraZeneca PLC`. Nothing in the questions marks which one the desk wanted.

**Funding:** the payer was funded by the pool, not by the desk. Anyone can see which wallets deposited, but not which deposit paid for this assessment: it is one of 4 approved deposits, so that set size is the number to watch. On testnet the other depositors are seeded by us.

Decoy results stay in the local run record and are not part of this memo.
