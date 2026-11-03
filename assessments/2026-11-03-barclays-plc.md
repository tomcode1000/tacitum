# Counterparty assessment: Barclays PLC

**Overall: CLEAR** · jurisdiction GB · 2026-11-03T17:06:44.374Z

| Check | Verdict |
|---|---|
| Sanctions (two independent miners) | CLEAR |
| Company registry | CLEAR |
| Regulatory filings | INFO |
| Adverse news | CLEAR |

**Cost:** $0.06 across 6 paid Telegraph calls, paid by `0xdbEE317b429c8EADFcE1825691cF10C7fa46b608`.
**Receipts:** 6 of 6 re-verified against the public signal record (payer and settlement tx match).

## Evidence

### Sanctions
- Sanctions Name Evidence: matched = false, lists: OFAC SDN, OFAC Consolidated (non-SDN), UK Sanctions List (entities only), Canada autonomous sanctions (entities only) · $0.01 · signal `0x5782eb19…75709e`
- TxLens: matched = false, lists: OFAC SDN list · $0.01 · signal `0x97fa3e14…595852`

### Company registry
- DataWire Corporate Registry Lookup: BARCLAYS PLC · id 213800LBQA1Y9L22JB70 · active = true · $0.01 · signal `0xff661b07…bb8238`
- TxLens: BARCLAYS PLC · id 00048839 · active = true · $0.01 · signal `0x85eaa8d0…8cdfd2`

### Regulatory filings
- Filing Window: 255 filings in the last 12 months · $0.01 · signal `0xeb6af787…22a25c`

### Adverse news
- NewsWire News Search: GOV.UK reports: "Sir Richard Broadbent reappointed as Chair of the HMCTS…". (5 sources) · $0.01 · signal `0x27faa468…ec45a3`

## What the public feed shows about this assessment

Every question above is published with the paying wallet. Anyone watching saw:

- `[intent] SANCTIONS_SCREENING_MATCH_GENERAL → {"name":"Barclays PLC"}`
- `[intent] SANCTIONS_SCREENING_MATCH_GENERAL → {"name":"Barclays PLC"}`
- `[intent] CORPORATE_REGISTRY_LOOKUP_GENERAL → {"company":"Barclays PLC","jurisdiction":"GB"}`
- `[intent] CORPORATE_REGISTRY_LOOKUP_GENERAL → {"company":"Barclays PLC","jurisdiction":"GB"}`
- `[intent] REGULATORY_FILING_MONITOR_GENERAL → {"entity":"Barclays PLC","period":"last 12 months"}`
- `[intent] NEWS_SEARCH_GENERAL → {"query":"Barclays PLC"}`

This is the leak Tacitum's private mode removes.
