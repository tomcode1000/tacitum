# mismatch, without Telegraph

We're onboarding Siemens AG in Germany. We have an invoice for €9,100 covering 13 units at €700 each. Our purchase order is for 12 units at €700 each, and 12 units were accepted on November 10, 2026. Vendor master record: legal name Siemens Aktiengesellschaft, LEI W38RGI023J3WT1HWRP32, website https://www.siemens.com. Verify the company's legal identity and active registry status, screen its legal name against sanctions, check its website's TLS certificate and URL safety, and get a sourced EUR/USD rate. Show which providers supplied each result and flag any missing checks. Then: should we approve the supplier and release the payment? Only approve if the required checks actually passed and the invoice, purchase order and acceptance agree. Otherwise return HOLD or REVIEW and explain what's missing. Don't execute any payment. End with one line: DECISION: APPROVE, HOLD or REVIEW.

---

I've finished the checks. The answer is **HOLD**: the invoice doesn't match the purchase order or the acceptance, and two of the required checks couldn't be completed. No payment was executed.

## Results

| Check | Provider | Result | Status |
|---|---|---|---|
| Legal identity (LEI) | GLEIF API (`api.gleif.org/api/v1/lei-records/W38RGI023J3WT1HWRP32`) | Legal name "Siemens Aktiengesellschaft", Germany, legal form code 6QQB. Address: Werner-von-Siemens-Str. 1, 80333 München. LEI registration ISSUED, next renewal 2027-10-25. Matches the vendor master record. | ✅ Passed |
| Registry status | GLEIF (registration authority RA000304, number **HRB 6684**) | GLEIF reports the entity as **ACTIVE**, last updated 2026-09-01. | ⚠️ Partial: this is GLEIF's copy of the registry data. I didn't query the German commercial register (Handelsregister) directly. |
| Sanctions screen | OpenSanctions public search page | A search for "Siemens Aktiengesellschaft" returned no Siemens entity and no sanctions hits. The only result was an unrelated company (Volkswagen AG, tagged "trade risk"). | ⚠️ Weak pass: this was a public keyword search, not the OpenSanctions match API (which needs an API key), and it didn't cover the OFAC, EU or UN lists directly. |
| TLS certificate | WebFetch over HTTPS | https://www.siemens.com returned HTTP 200 with no TLS errors and no redirect. | ❌ **Missing**: the tool can't show the certificate's issuer, expiry or hostname match, so the certificate wasn't actually checked. |
| URL safety | Google Safe Browsing Transparency Report | The page needs JavaScript and returned no verdict. | ❌ **Missing** |
| EUR/USD rate | ECB daily reference rates (`eurofxref-daily.xml`) | **1.0992** (reference date 2026-11-19) | ✅ Sourced |

My direct network calls (curl to GLEIF) weren't approved, so every result above came through a web-fetch helper. I haven't saved any of the raw API responses.

## Invoice, purchase order and acceptance

| | Units | Unit price | Total EUR | Total USD at 1.0992 |
|---|---|---|---|---|
| Invoice | **13** | €700 | **€9,100** | $10,002.72 |
| Purchase order | 12 | €700 | €8,400 | $9,233.28 |
| Accepted (Nov 10, 2026) | 12 | — | €8,400 | $9,233.28 |

The invoice bills one unit more than was ordered or received: **€700 over (about $769.44)**.

## Decision

- **Supplier onboarding:** identity and LEI status check out. Approval should still wait for the certificate check, the URL safety check, a sanctions screen against the official lists, and ideally a direct Handelsregister lookup of HRB 6684.
- **Payment:** HOLD. Releasing €9,100 would pay for a unit that was never ordered or accepted. Next steps:
  1. Ask Siemens for a credit note or a corrected invoice for 12 units (€8,400).
  2. Or, if the 13th unit was really ordered, issue a PO amendment and record its acceptance.
  3. Then match the corrected invoice against the PO and acceptance again.

DECISION: HOLD

---

wall time 54s · tools Glob, Bash, Bash, ToolSearch, Agent, Agent, WebFetch, WebFetch, Agent, WebFetch, Agent, WebFetch, WebFetch · decision HOLD
