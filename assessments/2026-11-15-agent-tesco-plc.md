# Counterparty assessment: Tesco PLC

**Overall: FLAG** · jurisdiction GB · 2026-11-15T18:34:26.058Z

| Check | Verdict |
|---|---|
| Sanctions (two independent miners) | CLEAR |
| Company registry | CLEAR |
| Regulatory filings | INFO |
| Adverse news | FLAG |

**Cost:** $0.06 across 6 paid Telegraph calls, paid by `0xeF165282962C9A9eb3Bb953538791b8494c2Dfa3`.
**Receipts:** 6 of 6 re-verified against the public signal record (payer and settlement tx match).

## Evidence

### Sanctions
- Counterproof Sanctions Screener: matched = false, lists: US OFAC SDN and non-SDN Consolidated lists (published 2026-11-13), UN Security Council Consolidated List (published 2026-11-15), EU Consolidated Financial Sanctions List (published 2026-10-23), UK Sanctions List (published 2026-11-12) · $0.01 · signal `0x42e0d98e…4b8a8b`
- Sanctions Name Evidence: matched = false, lists: OFAC SDN, OFAC Consolidated (non-SDN), UK Sanctions List (entities only), Canada autonomous sanctions (entities only) · $0.01 · signal `0xddea4fee…35223b`

### Company registry
- ZK Corporate Registry — Exact Identity and Status: TESCO PLC · id 00445790 · active = true · $0.01 · signal `0x50682453…aaad48`
- Praman Desk Compliance & Procurement Auditor: TESCO PLC · id 2138002P5RNKC5W2JZ46 · active = true · $0.01 · signal `0x62b3cf1f…3fde2e`

### Regulatory filings
- Filing Window: 55 filings in the last 12 months · $0.01 · signal `0x6ea4f276…39b4cc`

### Adverse news
- Tacitum Adverse Media Screen: 21 adverse items on Tesco, risk high (21 sources) · $0.01 · signal `0x13afc55c…955f41`

## Private mode (screened pool)

| | |
|---|---|
| Payer | one-time wallet `0xeF165282962C9A9eb3Bb953538791b8494c2Dfa3`, used for this assessment only |
| Cover | 4 complete assessments bought together, checks shuffled and spaced with random gaps |
| Total paid | $0.24 for all 4 (this memo's share $0.06) |
| Observer picking the real one | blind guess 0.25; best measured attacker not measured |
| Funding | the Tacitum screened pool `0xfd7aa64e839003a3b7c20080653f0202e97c5e1b` paid $1 into the payer's escrow through a zero-knowledge withdraw, tx `0xe90dbcda…dd06b9`. The desk's deposit is one of 16 approved deposits, each screened through Telegraph sanctions before it could be spent |

The feed shows 4 counterparties assessed by a new wallet, in no particular order: `FirstGroup PLC`, `Next PLC`, `BAE Systems PLC`, `Tesco PLC`. Nothing in the questions marks which one the desk wanted.

**Funding:** the payer was funded by the pool, not by the desk. Anyone can see which wallets deposited, but not which deposit paid for this assessment: it is one of 16 approved deposits, so that set size is the number to watch. On testnet the other depositors are seeded by us.

Decoy results stay in the local run record and are not part of this memo.

## Audit record

Sealed to auditor key `5dbf68a454022585` in `assessments/audit/2026-11-15-agent-tesco-plc.audit.json` (sha256 `a9f24c05c522fc87…`).
