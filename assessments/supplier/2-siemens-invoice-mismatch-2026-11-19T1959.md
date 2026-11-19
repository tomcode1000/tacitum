Siemens AG, invoice bills 13 units but 12 were accepted

# Supplier check: Siemens Aktiengesellschaft (DE)

**Decision: HOLD**. No payment was executed.

Failed: match.

| Check | Result | Why | Providers (Telegraph receipts) |
|---|---|---|---|
| registry | PASSED | active, legal name and registration confirmed by 2 registries | ZK Corporate Registry — Exact Identity and Status `0x7938cddc…`<br>DataWire Corporate Registry Lookup `0xd995f155…` |
| sanctions | PASSED | no match on 2 independent sanctions screens | 731002 (no answer)<br>Sanctions Name Evidence `0xe1b48e2d…`<br>LiveCert — Sourced Answers for Agents `0x1b97eb99…` |
| tls | PASSED | certificate valid (2 miners) | NetWire SSL Verification `0xf52d2bcd…`<br>LiveCert — Sourced Answers for Agents `0xa961d4c5…` |
| url | PASSED | not listed as malicious | PREFLIGHT Infrastructure Signals `0xfdf2de9d…`<br>GuardWire URL Safety Check `0x8c998a45…` |
| fx | PASSED | 3 sources agree within 0.5% ($10,002.72) | FinWire Currency Exchange `0xb5b8d058…`<br>LiveCert — Sourced Answers for Agents `0x9e68c93f…`<br>FX Now (Frankfurter ECB) `0xa9cdcd9a…`<br>Frankfurter FX Now `0x7ba1a1c2…` |
| match | FAILED | units: invoice 13, PO 12; accepted 12 units, invoiced 13 | computed from the documents |

Cost $0.12 · 47s · every receipt checks at /engine/v1/signal/<hash>
