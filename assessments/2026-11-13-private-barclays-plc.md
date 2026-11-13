# Counterparty assessment: Barclays PLC

**Overall: CLEAR** · jurisdiction GB · 2026-11-13T11:08:00.228Z

| Check | Verdict |
|---|---|
| Sanctions (two independent miners) | CLEAR |
| Company registry | CLEAR |
| Regulatory filings | INFO |
| Adverse news | CLEAR |

**Cost:** $0.06 across 6 paid Telegraph calls, paid by `0xDd37CE40cD22E2cFF1c887a7bEE89f456291127A`.
**Receipts:** 6 of 6 re-verified against the public signal record (payer and settlement tx match).

## Evidence

### Sanctions
- Counterproof Sanctions Screener: matched = false · $0.01 · signal `0xef2fd405…204d9a`
- Sanctions Name Evidence: matched = false, lists: OFAC SDN, OFAC Consolidated (non-SDN), UK Sanctions List (entities only), Canada autonomous sanctions (entities only) · $0.01 · signal `0xe4fb30b5…c7b623`

### Company registry
- ZK Corporate Registry — Exact Identity and Status: BARCLAYS PLC · id 00048839 · active = true · $0.01 · signal `0x45ea9fac…254678`
- Praman Desk Compliance & Procurement Auditor: ? · id 213800LBQA1Y9L22JB70 · active = true · $0.01 · signal `0x6d636e36…115347`

### Regulatory filings
- Filing Window: 242 filings in the last 12 months · $0.01 · signal `0xcec1e8cb…0a3d10`

### Adverse news
- NewsWire News Search: GOV.UK reports: "Sir John Kingman appointed as Great British Railways Chair". (4 sources) · $0.01 · signal `0x4fd2a612…95db85`

## Private mode (v0)

| | |
|---|---|
| Payer | one-time wallet `0xDd37CE40cD22E2cFF1c887a7bEE89f456291127A`, used for this assessment only |
| Cover | 4 complete assessments bought together, checks shuffled and spaced with random gaps |
| Total paid | $0.26 for all 4 (this memo's share $0.06) |
| Observer picking the real one | blind guess 0.25; best measured attacker 0.38 (95% interval 0.18–0.61, 16 runs) |
| Funding | `0xdbEE317b429c8EADFcE1825691cF10C7fa46b608` deposited $0.4 into the payer's escrow, tx `0x0a4894d7…7c8707` |

The feed shows 4 counterparties assessed by a new wallet, in no particular order: `AstraZeneca PLC`, `Barclays PLC`, `GSK PLC`, `National Grid PLC`. Nothing in the questions marks which one the desk wanted.

**Not hidden in v0:** the funding deposit is on chain, so anyone who checks who funded the payer finds the desk's wallet. They still cannot tell which of the 4 counterparties it cared about. The screened deposit pool (P4) removes that link.

Decoy results stay in the local run record and are not part of this memo.
