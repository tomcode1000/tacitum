Siemens AG, but the supplier record's website was changed to one with a broken certificate

# Supplier check: Siemens Aktiengesellschaft (DE)

**Decision: HOLD**. No payment was executed.

Failed: tls, url.

| Check | Result | Why | Providers (Telegraph receipts) |
|---|---|---|---|
| registry | PASSED | active, legal name and registration confirmed by 2 registries | ZK Corporate Registry — Exact Identity and Status `0xb24f1402…`<br>DataWire Corporate Registry Lookup `0x26fb8a40…` |
| sanctions | PASSED | no match on 2 independent sanctions screens | 731002 (no answer)<br>Sanctions Name Evidence `0xf120dbdc…`<br>LiveCert — Sourced Answers for Agents `0x19e24075…` |
| tls | FAILED | the website's TLS certificate is not valid | NetWire SSL Verification `0x4fd58701…`<br>LiveCert — Sourced Answers for Agents `0x003e4043…` |
| url | FAILED | a URL scanner reports the website as unsafe | PREFLIGHT Infrastructure Signals `0xdd091642…`<br>GuardWire URL Safety Check `0x4c36753e…` |
| fx | PASSED | 3 sources agree within 0.5% ($9,233.28) | FinWire Currency Exchange `0x787d56d3…`<br>LiveCert — Sourced Answers for Agents `0xf5b3b221…`<br>FX Now (Frankfurter ECB) `0x4855d93a…`<br>Frankfurter FX Now `0x57a925ce…` |
| match | PASSED | 12 units at 700 EUR agree across invoice, PO and acceptance (2026-11-10) | computed from the documents |

Cost $0.12 · 63s · every receipt checks at /engine/v1/signal/<hash>
