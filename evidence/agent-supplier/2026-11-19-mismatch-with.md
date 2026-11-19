# mismatch, with Telegraph

We're onboarding Siemens AG in Germany. We have an invoice for €9,100 covering 13 units at €700 each. Our purchase order is for 12 units at €700 each, and 12 units were accepted on November 10, 2026. Vendor master record: legal name Siemens Aktiengesellschaft, LEI W38RGI023J3WT1HWRP32, website https://www.siemens.com. Verify the company's legal identity and active registry status, screen its legal name against sanctions, check its website's TLS certificate and URL safety, and get a sourced EUR/USD rate. Show which providers supplied each result and flag any missing checks. Then: should we approve the supplier and release the payment? Only approve if the required checks actually passed and the invoice, purchase order and acceptance agree. Otherwise return HOLD or REVIEW and explain what's missing. Don't execute any payment. End with one line: DECISION: APPROVE, HOLD or REVIEW.

---

I ran the supplier check through Telegraph. All the supplier checks passed, but the invoice doesn't match the purchase order or the acceptance, so the payment is on **HOLD**. No payment was made.

## Checks and providers

| Check | Result | Providers (Telegraph receipt) |
|---|---|---|
| **Legal identity and registry status** | ✅ PASSED: company is active, legal name and registration confirmed by 2 registries | ZK Corporate Registry `0xb459cf1f…`, DataWire Corporate Registry `0xf6be5f36…` |
| **Sanctions screen** ("Siemens Aktiengesellschaft") | ✅ PASSED: no match on 2 independent screens | Sanctions Name Evidence `0x51c411b3…`, LiveCert `0xaea93b41…` |
| **TLS certificate** (www.siemens.com) | ✅ PASSED: certificate is valid | NetWire SSL Verification `0x90c6f2fc…`, LiveCert `0x6189999f…` |
| **URL safety** | ✅ PASSED: not listed as malicious | PREFLIGHT Infrastructure Signals `0x6125b692…`, GuardWire URL Safety `0x21799bad…` |
| **EUR/USD rate** | ✅ PASSED: 3 sources agree within 0.5%. €9,100 ≈ **$10,002.72** (about 1.0992 USD per EUR) | FinWire `0xccf41fb7…`, LiveCert `0xb70d324f…`, FX Now (ECB data via Frankfurter) `0x5654aa56…`, Frankfurter FX Now `0x32c12860…` |
| **Invoice, PO and acceptance match** | ❌ FAILED | Worked out from your documents |

Each receipt can be checked at `https://devnode.telegraphprotocol.com/engine/v1/signal/<hash>`. The check cost $0.12 and took 68 seconds.

## Missing or partial checks
- **One sanctions provider (731002) didn't respond.** The sanctions result still stands on the 2 screens that did answer. The tool describes three screens, so if your policy requires all three, re-run it.
- Every other check returned a result.

## Why the payment is on hold
- The invoice is for **13 units** (€9,100). The PO is for **12 units**, and **12 units** were accepted on 2026-11-10.
- The unit price (€700) and currency (EUR) match. The problem is one extra unit, **€700 over-billed**. The amount supported by the PO and acceptance is **€8,400**, not €9,100.

## Recommendation
- **Supplier onboarding:** Siemens AG can be approved as a vendor, since its identity, registry status, sanctions screen and website checks all passed.
- **Payment:** Hold it. Ask Siemens for a corrected invoice or a €700 credit note for 12 units. Only pay more if a PO change and acceptance for a 13th unit are documented. Once the documents agree, re-run the match before releasing anything.

DECISION: HOLD

---

wall time 231s · tools ToolSearch, mcp__tacitum__supplier_check · decision HOLD
