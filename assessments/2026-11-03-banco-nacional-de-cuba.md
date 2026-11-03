# Counterparty assessment: Banco Nacional de Cuba

**Overall: FLAG** · jurisdiction CU · 2026-11-03T17:09:38.911Z

| Check | Verdict |
|---|---|
| Sanctions (two independent miners) | FLAG |
| Company registry | REVIEW |
| Regulatory filings | REVIEW |
| Adverse news | CLEAR |

**Cost:** $0.05 across 5 paid Telegraph calls, paid by `0xdbEE317b429c8EADFcE1825691cF10C7fa46b608`.
**Receipts:** 5 of 5 re-verified against the public signal record (payer and settlement tx match).

## Evidence

### Sanctions
- Sanctions Name Evidence: matched = true, lists: OFAC SDN, OFAC Consolidated (non-SDN), UK Sanctions List (entities only), Canada autonomous sanctions (entities only) · $0.01 · signal `0xc33600a1…39268e`
- TxLens: matched = true, lists: US Treasury OFAC SDN list · $0.01 · signal `0xb86ef85f…c91b4d`

### Company registry
- DataWire Corporate Registry Lookup: ? · id ? · active = undefined · $0.01 · signal `0x1664fdb7…6dd470`
- TxLens: ? · id ? · active = null · $0.01 · signal `0x3d13e5e7…ad675c`

### Regulatory filings
- 77131: no answer (500, miner error error [entity_not_found]: No exact issuer name or ticker was found i)

### Adverse news
- NewsWire News Search: No dated matching reports were found in the checked sources. (0 sources) · $0.01 · signal `0xe93e1594…3a5bd3`

## What the public feed shows about this assessment

Every question above is published with the paying wallet. Anyone watching saw:

- `[intent] SANCTIONS_SCREENING_MATCH_GENERAL → {"name":"Banco Nacional de Cuba"}`
- `[intent] SANCTIONS_SCREENING_MATCH_GENERAL → {"name":"Banco Nacional de Cuba"}`
- `[intent] CORPORATE_REGISTRY_LOOKUP_GENERAL → {"company":"Banco Nacional de Cuba","jurisdiction":"CU"}`
- `[intent] CORPORATE_REGISTRY_LOOKUP_GENERAL → {"company":"Banco Nacional de Cuba","jurisdiction":"CU"}`
- `[intent] NEWS_SEARCH_GENERAL → {"query":"Banco Nacional de Cuba"}`

This is the leak Tacitum's private mode removes.
