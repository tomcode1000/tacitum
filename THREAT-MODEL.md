# Threat model

Tacitum hides two things from the market:
- **Who was screened.** The real target sits among matched decoys.
- **Who asked.** A one-time payer, funded through a zero-knowledge withdraw from a sanctions-screened pool, does the buying.

Tacitum keeps everything provable: Telegraph receipts for every answer and a sealed record for the auditor. This page says who can learn what, what they can break, and what the defences are. It ends with what must change before mainnet.

## Who is involved

| Party | What they see | What they could do | What stops them |
|---|---|---|---|
| **Market observer** (anyone reading Telegraph's public feed or the chain) | The one-time payer, all k questions it paid for, timings and amounts | Guess the real target among the k; link the payer back to the desk | Matched decoys, with the best attacker at 0.31 against a chance of 0.25 over 32 runs. The payer is funded by a ZK withdraw, so there is no on-chain path to the desk. Pool deposits are one fixed size. |
| **Telegraph node operator** | Everything the observer sees, plus request metadata (IP, exact timing) | Group the k questions as one batch; correlate by IP | Decoys still hide which question is real. Network-level privacy (IP) is out of scope today, so use a separate network path if that matters. |
| **Miners** | The questions sent to them | The same guessing as the observer, for their own intent | The same decoys. Different intents go to different miners. |
| **Screener** (the pool operator who approves deposits; today that is us) | Every depositor's address | Refuse or delay approval (censorship); approve a wallet that should have failed | It cannot steal: only the note holder can withdraw, and a deposit that is never approved can be reclaimed after 24h. Every approval carries the Telegraph sanctions receipt it was based on, so a wrong approval is visible and provable. It cannot link a withdraw to a deposit. |
| **Relayer** (sends the withdraw transaction) | The recipient payer address and the timing | Refuse to relay; take a fee | The recipient, relayer and fee are bound into the proof and cannot be swapped. The fee is capped at the deposit amount in the contract, and the desk chooses the fee it signs. Anyone can be a relayer. |
| **Auditor** (holds the auditor private key) | The full record: desk, real target, decoys, payer, funding, every receipt | Disclose the desk's screening history | That is the design: the auditor is the party the desk answers to. Key custody is theirs; see the mainnet checklist. |
| **Desk funder key** (the wallet holding USDC) | Its own activity | If stolen, the thief can spend its USDC through Tacitum | Spend caps are on by default: $0.10 per miner payment and $2.00 per session (`maxPerPaymentUsd` and `maxTotalUsd`; in the MCP server, `TACITUM_MAX_PAYMENT_USD` and `TACITUM_MAX_TOTAL_USD`). The key only funds one-time payers; it never pays a miner directly. |

## What Tacitum does not protect

- **Timing.** A withdraw followed quickly by payer activity narrows the anonymity set to recent withdrawals. The library waits for funding to settle, but it does not add long random delays.
- **Spending the newest deposit (found and fixed).** On 23 Nov 2026 our public-data tracer ([src/tracer.js](src/tracer.js)) linked a trial payer to its deposit, out of 17 candidates, because that deposit was the most recent one in the pool ([data/trials/2026-11-23T1154.json](data/trials/2026-11-23T1154.json)). Tacitum now refuses to spend a deposit until at least 3 newer deposits have been approved after it. One trial cannot show the rule is enough: the twice-daily trials keep measuring it.
- **A small pool.** Privacy grows with the number of approved deposits. On testnet we seeded them ourselves, so the set is honest about mechanics, not about real anonymity.
- **Weak decoys.** If the caller's `ask()` decoys don't resemble the real question, they hide nothing. `assess()` uses fixed matched cover sets. `ask()` leaves decoy choice to the caller.
- **The answer itself.** The real target's results are in the public signal record (as are the decoys'). Tacitum hides which one mattered, not the facts.
- **Network metadata.** IP addresses and TLS fingerprints are out of scope.

## Mainnet checklist

None of this is done. Tacitum is a testnet build.

**Contracts and circuit**
- [ ] Independent audit of `ScreenedPool.sol` and `withdraw.circom`.
- [ ] A multi-party trusted setup (phase-2 contributions from independent parties). The current `withdraw.zkey` comes from a single-party setup and is fit for testnet only.
- [ ] Review the fee cap. Today it only stops the fee exceeding the deposit amount; consider a lower protocol maximum.
- [ ] Fuzz and invariant tests on deposit, approve, reclaim and withdraw, beyond the current unit tests.
- [ ] Review `RECLAIM_DELAY` (24h) against screener service levels.

**Screening**
- [ ] A screener behind a multi-sig or threshold key, with a published screening policy and an appeal path.
- [ ] Two independent sanctions miners must agree before approval (the assessments already use mode "two"). Today the screener takes the first miner, in a fixed order (731002, 710637, 4433), that gives a clear answer with a receipt. A miner that is down is skipped; a match stops the search, so the screener cannot shop for a clean answer. On 18 Nov 2026, Counterproof (731002) returned 503 LISTS_LOADING for hours, and the fallback kept the pool working.
- [ ] Re-screen on list updates. Decide whether a later listing can freeze unspent notes, and say so up front.

**Keys and money**
- [ ] Auditor key in an HSM or KMS, with rotation and a record of who opened what.
- [ ] Spend caps set per desk and reviewed. Alerting on any cap hit.
- [ ] Mainnet USDC: confirm the EIP-3009 domain (name and version) on the real token. The code already reads it from the token at runtime.

**Privacy**
- [ ] An anonymity set from independent depositors before claiming privacy to users. Publish the live set size.
- [ ] Random delay between withdraw and first purchase, configurable per desk.
- [ ] Re-run the attacker experiment against mainnet traffic and publish the result.

**Legal and operations**
- [ ] Legal review of operating a screened pool in each target jurisdiction.
- [ ] An incident response plan for a key compromise or a screening error.
- [ ] Monitoring of miner availability and answer quality (the miner eval set, re-run on a schedule).
