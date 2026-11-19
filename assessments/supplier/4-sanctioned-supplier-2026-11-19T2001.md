A sanctioned company (Rosneft) with matching documents

# Supplier check: Rosneft Oil Company (RU)

**Decision: HOLD**. No payment was executed.

Failed: sanctions.
Missing or inconclusive: registry.

| Check | Result | Why | Providers (Telegraph receipts) |
|---|---|---|---|
| registry | MISSING | fewer than two registries confirmed the company | ZK Corporate Registry — Exact Identity and Status `0xdc2cd01d…`<br>DataWire Corporate Registry Lookup `0xc739f5ce…` |
| sanctions | FAILED | a sanctions miner reports a match | 731002 (no answer)<br>Sanctions Name Evidence `0x130feea5…`<br>LiveCert — Sourced Answers for Agents `0xaeb6b7bd…` |
| tls | PASSED | certificate valid (2 miners) | NetWire SSL Verification `0x38fdf8b0…`<br>LiveCert — Sourced Answers for Agents `0x45e94e25…` |
| url | PASSED | not listed as malicious | PREFLIGHT Infrastructure Signals `0x16cac7bf…`<br>GuardWire URL Safety Check `0xb86a2128…` |
| fx | PASSED | 3 sources agree within 0.5% ($9,233.28) | FinWire Currency Exchange `0x596f7dd3…`<br>LiveCert — Sourced Answers for Agents `0xdb7bd609…`<br>FX Now (Frankfurter ECB) `0x5fbc1ac3…`<br>Frankfurter FX Now `0x074e6ca7…` |
| match | PASSED | 12 units at 700 EUR agree across invoice, PO and acceptance (2026-11-10) | computed from the documents |

Cost $0.12 · 90s · every receipt checks at /engine/v1/signal/<hash>
