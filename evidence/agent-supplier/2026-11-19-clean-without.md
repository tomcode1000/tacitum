# clean, without Telegraph

We're onboarding Siemens AG in Germany. We have an invoice for €8,400 covering 12 units at €700 each. Our purchase order is for 12 units at €700 each, and 12 units were accepted on November 10, 2026. Vendor master record: legal name Siemens Aktiengesellschaft, LEI W38RGI023J3WT1HWRP32, website https://www.siemens.com. Verify the company's legal identity and active registry status, screen its legal name against sanctions, check its website's TLS certificate and URL safety, and get a sourced EUR/USD rate. Show which providers supplied each result and flag any missing checks. Then: should we approve the supplier and release the payment? Only approve if the required checks actually passed and the invoice, purchase order and acceptance agree. Otherwise return HOLD or REVIEW and explain what's missing. Don't execute any payment. End with one line: DECISION: APPROVE, HOLD or REVIEW.

---

Checks are done. Here's what came back and my decision.

## Verification results

| Check | Provider | Result | Status |
|---|---|---|---|
| Legal identity | GLEIF API (`api.gleif.org`), LEI W38RGI023J3WT1HWRP32 | Legal name "Siemens Aktiengesellschaft". It matches the vendor master record exactly. Address is München, DE-BY 80333; jurisdiction DE; legal form 6QQB (AG) | ✅ Passed |
| Registry status | GLEIF record, which cites registry RA000304 (German Handelsregister) | Entity **ACTIVE**, LEI **ISSUED**, **FULLY_CORROBORATED** against registry no. **HRB 6684**. Last updated 2026-09-01, renewal due 2027-10-25 | ✅ Passed, but the source is GLEIF, not the Handelsregister itself |
| Sanctions screen | OpenSanctions website search (Consolidated Sanctions, data as of 2026-11-19) | 0 matches for "Siemens Aktiengesellschaft" | ⚠️ Partial. The OpenSanctions API refused the request (**HTTP 401**, it needs a key). I only got a public web-page search: exact name only, no aliases or fuzzy matching. The site also says business use needs a data license |
| TLS certificate | crt.sh (Certificate Transparency logs), plus a direct HTTPS fetch | A current cert for `www.siemens.com` exists (Amazon ECDSA 256 M04, valid 2026-06-23 to 2027-01-06). The HTTPS fetch returned 200 with no certificate error | ⚠️ Partial. I couldn't do a live TLS handshake, so the certificate actually served wasn't checked directly |
| URL safety | Google Safe Browsing (Transparency Report endpoint) | `["sb.ssr",1,false,false,false,false,…,"www.siemens.com",false]`. Status 1 with all threat flags false usually means "no unsafe content found" | ⚠️ Probably clean, but the format isn't documented, so this isn't an authoritative verdict |
| EUR/USD rate | **Frankfurter** (api.frankfurter.dev, republishes ECB reference rates) | **1.0992 USD per EUR**, dated 2026-11-19, so €8,400 ≈ **$9,233.28** | ✅ Sourced. The ECB's own API returned **HTTP 503**, so this rate isn't straight from the ECB |

**Note on method:** I wasn't allowed to make network calls from the shell (they needed approval), so every check above went through a page-fetch tool. That's why there's no direct TLS handshake and no API-based sanctions screen.

## Three-way match
- Invoice: 12 × €700 = €8,400 ✅ (the total is correct)
- Purchase order: 12 × €700 ✅
- Acceptance: 12 units received on 2026-11-10 ✅

Quantity, unit price and total all agree.

## Missing items
1. **A proper sanctions screen.** Run the name through a licensed screening service (the OpenSanctions `/match` endpoint with a key, or your own tool covering EU, OFAC and UK lists), including aliases.
2. **Bank account check.** I have no payee IBAN or bank details, so I can't confirm the account belongs to Siemens AG. This is the most common invoice-fraud route. Confirm the account by phoning a contact you find yourself, not one listed on the invoice.
3. **Invoice details.** I haven't seen the invoice number, PO number, VAT ID (USt-IdNr.) or the invoice and PO documents themselves. The match above uses the figures you gave me.
4. **Optional:** a direct TLS handshake check and a Safe Browsing check through the official API.

## Recommendation
The supplier's identity and registry status are verified and the figures agree. But the sanctions screen and the website checks only partly passed, and the bank account hasn't been checked at all. Your rule was to approve only if the required checks actually passed, so I can't approve yet. This needs a human to close items 1–3, not a rejection. No payment was executed.

DECISION: REVIEW

---

wall time 85s · tools PowerShell, Read, Bash, Bash, Agent, WebFetch, Agent, WebFetch, Agent, WebFetch, WebFetch, Agent, WebFetch, WebFetch, WebFetch, WebFetch, WebFetch · decision REVIEW
