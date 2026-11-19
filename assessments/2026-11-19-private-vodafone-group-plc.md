# Counterparty assessment: Vodafone Group PLC

**Overall: FLAG** · jurisdiction GB · 2026-11-19T16:54:56.227Z

| Check | Verdict |
|---|---|
| Sanctions (two independent miners) | CLEAR |
| Company registry | REVIEW |
| Regulatory filings | INFO |
| Adverse news | FLAG |

**Cost:** $0.06 across 6 paid Telegraph calls, paid by `0x71DD12eDc521af6D55FD44983514f4c6C8CB213d`.
**Receipts:** 6 of 6 re-verified against the public signal record (payer and settlement tx match).

## Evidence

### Sanctions
- 731002: no answer (500, miner error 503 [LISTS_LOADING]: Sanctions lists are still loading; retry shortl)
- Sanctions Name Evidence: matched = false, lists: OFAC SDN, OFAC Consolidated (non-SDN), UK Sanctions List (entities only), Canada autonomous sanctions (entities only) · $0.01 · signal `0x7ea4e8b0…ba3d45`
- LiveCert — Sourced Answers for Agents: matched = false · $0.01 · signal `0x4a5f2a9c…d4f16e`

### Company registry
- ZK Corporate Registry — Exact Identity and Status: ? · id ? · active = null · $0.01 · signal `0x9bc162a8…6e11d0`
- 5186: no answer (404, miner_not_found)
- DataWire Corporate Registry Lookup: ? · id ? · active = null · $0.01 · signal `0x62d1fe63…e6626f`

### Regulatory filings
- Filing Window: 65 filings in the last 12 months · $0.01 · signal `0x2a017659…ec7bba`

### Adverse news
- Tacitum Adverse Media Screen: 22 adverse items on Vodafone, risk high (22 sources) · $0.01 · signal `0x3b339b92…5d6f91`

## Private mode (screened pool)

| | |
|---|---|
| Payer | one-time wallet `0x71DD12eDc521af6D55FD44983514f4c6C8CB213d`, used for this assessment only |
| Cover | 4 complete assessments bought together, checks shuffled and spaced with random gaps |
| Total paid | $0.23 for all 4 (this memo's share $0.06) |
| Observer picking the real one | blind guess 0.25; best measured attacker 0.31 (95% interval 0.18–0.49, 32 runs) |
| Funding | the Tacitum screened pool `0xff7b916dee345bcba14a732685e50a9dc82de309` paid $0.5 into the payer's escrow through a zero-knowledge withdraw, tx `0xea3f36cf…b5c7f3`. The desk's deposit is one of 16 approved deposits, each screened through Telegraph sanctions before it could be spent |

The feed shows 4 counterparties assessed by a new wallet, in no particular order: `Marks & Spencer PLC`, `Persimmon PLC`, `Vodafone Group PLC`, `Renishaw PLC`. Nothing in the questions marks which one the desk wanted.

**Funding:** the payer was funded by the pool, not by the desk. Anyone can see which wallets deposited, but not which deposit paid for this assessment: it is one of 16 approved deposits, so that set size is the number to watch. On testnet the other depositors are seeded by us.

Decoy results stay in the local run record and are not part of this memo.

## Audit record

The full record (real target, decoys, every receipt, the payer and the pool deposit that funded it) is sealed to auditor key `5dbf68a454022585` in `assessments/audit/2026-11-19-private-vodafone-group-plc.audit.json` (sha256 `52838342e5c3be87…`). The auditor opens and verifies it with `node scripts/audit.mjs open assessments/audit/2026-11-19-private-vodafone-group-plc.audit.json --verify`.
