# Counterparty assessment: Barclays PLC

**Overall: REVIEW** · jurisdiction GB · 2026-11-13T10:57:11.044Z

| Check | Verdict |
|---|---|
| Sanctions (two independent miners) | REVIEW |
| Company registry | REVIEW |
| Regulatory filings | REVIEW |
| Adverse news | REVIEW |

**Cost:** $0 across 0 paid Telegraph calls, paid by `0x99A55e8976a87c4D61Ecb341F7cec9A1d370C176`.
**Receipts:** 0 of 0 re-verified against the public signal record (payer and settlement tx match).

## Evidence

### Sanctions
- 731002: no answer (402, payment required)
- 710637: no answer (402, payment required)
- 4433: no answer (402, payment required)

### Company registry
- 77393: no answer (402, payment required)
- 5185: no answer (402, payment required)

### Regulatory filings
- 77131: no answer (402, payment required)

### Adverse news
- 7329: no answer (402, payment required)
- 302: no answer (402, payment required)

## Private mode (v0)

| | |
|---|---|
| Payer | one-time wallet `0x99A55e8976a87c4D61Ecb341F7cec9A1d370C176`, used for this assessment only |
| Cover | 4 complete assessments bought together, checks shuffled and spaced with random gaps |
| Total paid | $0 for all 4 (this memo's share $0) |
| Observer picking the real one | blind guess 0.25; best measured attacker 0.38 (95% interval 0.18–0.61, 16 runs) |
| Funding | `0xdbEE317b429c8EADFcE1825691cF10C7fa46b608` deposited $0.4 into the payer's escrow, tx `0xe677c6da…ae5766` |

The feed shows 4 counterparties assessed by a new wallet, in no particular order: `GSK PLC`, `AstraZeneca PLC`, `National Grid PLC`, `Barclays PLC`. Nothing in the questions marks which one the desk wanted.

**Not hidden in v0:** the funding deposit is on chain, so anyone who checks who funded the payer finds the desk's wallet. They still cannot tell which of the 4 counterparties it cared about. The screened deposit pool (P4) removes that link.

Decoy results stay in the local run record and are not part of this memo.
