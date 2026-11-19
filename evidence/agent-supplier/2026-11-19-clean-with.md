# clean, with Telegraph

We're onboarding Siemens AG in Germany. We have an invoice for €8,400 covering 12 units at €700 each. Our purchase order is for 12 units at €700 each, and 12 units were accepted on November 10, 2026. Vendor master record: legal name Siemens Aktiengesellschaft, LEI W38RGI023J3WT1HWRP32, website https://www.siemens.com. Verify the company's legal identity and active registry status, screen its legal name against sanctions, check its website's TLS certificate and URL safety, and get a sourced EUR/USD rate. Show which providers supplied each result and flag any missing checks. Then: should we approve the supplier and release the payment? Only approve if the required checks actually passed and the invoice, purchase order and acceptance agree. Otherwise return HOLD or REVIEW and explain what's missing. Don't execute any payment. End with one line: DECISION: APPROVE, HOLD or REVIEW.

---

I ran the Telegraph supplier check (via Tacitum). All six checks passed and the documents agree, so the supplier can be approved and the payment released. No payment was executed.

| Check | Result | What was found | Providers (Telegraph receipt) |
|---|---|---|---|
| Legal identity and registry status | PASSED | Active. Legal name and registration confirmed by 2 registries, with LEI W38RGI023J3WT1HWRP32 supplied | ZK Corporate Registry (`0xf80e7a64…`), DataWire Corporate Registry Lookup (`0xb1b797ef…`) |
| Sanctions screen on "Siemens Aktiengesellschaft" | PASSED | No match on 2 independent screens | Sanctions Name Evidence (`0x7406f1af…`), LiveCert (`0xcd4dfe61…`) |
| TLS certificate (siemens.com) | PASSED | Certificate valid, confirmed by 2 sources | NetWire SSL Verification (`0xc7608338…`), LiveCert (`0x13907490…`) |
| URL safety | PASSED | Not listed as malicious | PREFLIGHT Infrastructure Signals (`0x01bde41c…`), GuardWire URL Safety Check (`0xafade268…`) |
| EUR/USD rate | PASSED | 3 sources agree within 0.5%. €8,400 ≈ **$9,233.28**, about 1.0992 USD per EUR | FinWire Currency Exchange (`0x59bcdbf5…`), LiveCert (`0x34be686c…`), Frankfurter ECB (`0x7bf416cc…`, `0x8bb1b995…`) |
| Invoice, PO and acceptance match | PASSED | Invoice, PO and acceptance all show 12 units at €700. The €8,400 total is correct, and 12 units were accepted on 2026-11-10 | Computed from the documents, no outside provider |

**Missing or degraded checks**
- **One sanctions screen failed to respond.** Provider 731002 returned no answer, so the sanctions result rests on 2 of the 3 planned screens. Two independent screens still meet the tool's pass threshold, so no required check is missing. If your policy needs three screens, re-run the check or screen manually before paying.
- Nothing else is missing.

**Other things to know**
- The receipt hashes are cut short in the tool output. Each one can be checked at `https://devnode.telegraphprotocol.com/engine/v1/signal/<hash>`. The check cost $0.12 and took 70 seconds.
- The FX rate is for information only. The invoice is in EUR, so you pay €8,400, and the USD amount on the day will vary a little.

**Recommendation:** Approve Siemens Aktiengesellschaft as a supplier and release the €8,400 payment through your normal payment process. Every required check passed and the invoice, PO and acceptance agree.

DECISION: APPROVE

---

wall time 238s · tools ToolSearch, mcp__tacitum__supplier_check · decision APPROVE
