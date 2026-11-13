# Counterparty assessment: Barclays PLC

**Overall: REVIEW** · jurisdiction GB · 2026-11-13T10:39:59.791Z

| Check | Verdict |
|---|---|
| Sanctions (two independent miners) | REVIEW |
| Company registry | REVIEW |
| Regulatory filings | INFO |
| Adverse news | CLEAR |

**Cost:** $0.04 across 4 paid Telegraph calls, paid by `0xEE252bFF0b0034e4369E27Dbc2d1363baBF4C69c`.
**Receipts:** 4 of 4 re-verified against the public signal record (payer and settlement tx match).

## Evidence

### Sanctions
- Sanctions Name Evidence: matched = false, lists: OFAC SDN, OFAC Consolidated (non-SDN), UK Sanctions List (entities only), Canada autonomous sanctions (entities only) · $0.01 · signal `0x1eaf4ca7…731da6`
- 9002: no answer (503, no_compatible_miner)

### Company registry
- DataWire Corporate Registry Lookup: ? · id ? · active = null · $0.01 · signal `0x26eb6fb9…01b160`
- 9002: no answer (503, no_compatible_miner)

### Regulatory filings
- Filing Window: 242 filings in the last 12 months · $0.01 · signal `0xb91abb99…0deccb`

### Adverse news
- NewsWire News Search: GOV.UK reports: "Sir John Kingman appointed as Great British Railways Chair". (4 sources) · $0.01 · signal `0x55b58b74…7cd6e3`

## Private mode (v0)

| | |
|---|---|
| Payer | one-time wallet `0xEE252bFF0b0034e4369E27Dbc2d1363baBF4C69c`, used for this assessment only |
| Cover | 4 complete assessments bought together, checks shuffled and spaced with random gaps |
| Total paid | $0.15 for all 4 (this memo's share $0.04) |
| Observer picking the real one | blind guess 0.25; best measured attacker 0.38 (95% interval 0.18–0.61, 16 runs) |
| Funding | `0xdbEE317b429c8EADFcE1825691cF10C7fa46b608` deposited $0.3 into the payer's escrow, tx `0x71cbf9b3…e970c8` |

The feed shows 4 counterparties assessed by a new wallet, in no particular order: `GSK PLC`, `AstraZeneca PLC`, `Barclays PLC`, `Bp PLC`. Nothing in the questions marks which one the desk wanted.

**Not hidden in v0:** the funding deposit is on chain, so anyone who checks who funded the payer finds the desk's wallet. They still cannot tell which of the 4 counterparties it cared about. The screened deposit pool (P4) removes that link.

Decoy results stay in the local run record and are not part of this memo.
