# Supplier payment release: the same agent with and without Telegraph

The task is the Telegraph team's example, given word for word to the same AI agent (Claude Code, headless) on 19 Nov 2026, plus the vendor master record (legal name, LEI, website):

> We're onboarding Siemens AG in Germany. We have an invoice for €8,400 covering 12 units at €700 each … Verify the company's legal identity and active registry status, screen its legal name against sanctions, check its website's TLS certificate and URL safety, and get a sourced EUR/USD rate … Only approve if the required checks actually passed and the invoice, purchase order and acceptance agree. Otherwise return HOLD or REVIEW … Don't execute any payment.

- **With Telegraph:** the agent has one tool, Tacitum's `supplier_check`. It buys every fact from two or more Telegraph miners, through a one-time wallet.
- **Without Telegraph:** the agent has ordinary web search and page fetch, as it would anyway.

## Results

| Case | With Telegraph | Without Telegraph |
|---|---|---|
| Clean (12 invoiced, 12 ordered, 12 accepted) | **APPROVE**, 238 s, $0.12 of test USDC | **REVIEW**, 85 s |
| Mismatch (13 invoiced, 12 accepted) | **HOLD**, 231 s | **HOLD**, 54 s |

**What changed with Telegraph:**

| Check | With Telegraph | Without Telegraph (the agent's own words) |
|---|---|---|
| Identity and registry | 2 registry miners agree: Siemens Aktiengesellschaft, HRB 6684, active | Verified through GLEIF's public API, but "the source is GLEIF, not the Handelsregister itself" |
| Sanctions | 2 independent screens agree, with no match (a third, Counterproof, was down and is reported as no answer) | "Partial. The OpenSanctions API refused the request (**HTTP 401**, it needs a key)." It used a web page instead: exact name only, no aliases |
| TLS certificate | 2 miners: valid | "Partial. I couldn't do a live TLS handshake" |
| URL safety | Safe (PREFLIGHT); Unknown (GuardWire) | "Probably clean, but the format isn't documented, so this isn't an authoritative verdict" |
| EUR/USD | 3 sources agree within 0.5%: $9,233.28 | Frankfurter: $9,233.28 (the ECB's own API returned 503) |
| Evidence | A Telegraph receipt per answer, checkable at `/engine/v1/signal/<hash>` | Links to the pages it read |

**Reading it fairly:**
- Without Telegraph, the agent was careful and honest: it would not approve on checks it could not complete. Its REVIEW is the right call for what it had.
- With Telegraph, the same agent could complete every required check, so APPROVE was justified. Each answer carries a receipt that a reviewer can check later.
- Both caught the invoice mismatch. That part needs no external data.
- Without Telegraph was faster (54–85 s against 231–238 s). Most of the extra time is the one-time payer's funding settling, which takes about 120 s before the first paid call.
- The baseline raised one thing our tool does not check: whether the **bank account** on the invoice belongs to the supplier. That is a real gap, and the next check to add.

## The five-case check

Run directly (`node scripts/supplier-check.mjs cases/supplier/*.json`), 5 of 5 decisions came out as expected:
- **Clean** → APPROVE
- **Invoice mismatch** → HOLD
- **No LEI** → REVIEW. The registry returns four similarly named Siemens entities, so identity is ambiguous.
- **Sanctioned supplier** → HOLD
- **Changed website with a broken certificate** → HOLD

Results are in [assessments/supplier/](../assessments/supplier/). An earlier run made while this machine had lost its internet connection is kept in [assessments/supplier/offline-failsafe/](../assessments/supplier/offline-failsafe/). Every provider was unreachable, and nothing was approved.

## Files

- Transcripts: [evidence/agent-supplier/](../evidence/agent-supplier/). Local paths are replaced with `<home>`.
- Runner: [scripts/agent-supplier.mjs](../scripts/agent-supplier.mjs)
- Decision rules: [src/supplier.js](../src/supplier.js), tested in [test/supplier.test.mjs](../test/supplier.test.mjs)
