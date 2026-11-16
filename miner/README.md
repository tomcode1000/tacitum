# Tacitum Adverse Media Screen

**A Telegraph provider that returns twelve months of adverse news on any company or person, with sources, for $0.01.**

Telegraph Hackathon Season II, **Track 02 (Miners / Providers)**. Built alongside [Tacitum](../README.md) (Track 01), which is its first paying user, but a separate service with its own registration, endpoint and tests.

| | |
|---|---|
| Miner | `tacitum-adverse-media`, id **7314402**, active on the Telegraph H2 contract (Sepolia) |
| Intent | `NEWS_SEARCH_GENERAL` (input `query`; answer, result_count, sources, brief) |
| Price | $0.01 per answer |
| Endpoint | `https://adverse.54-255-109-186.sslip.io/api/adverse?query=<company or person>` |
| Quality | Blind test set: **precision 0.91, recall 0.71, F1 0.80** (63 headlines, 8 companies) |
| Paid calls | 5 direct (in `../evidence/miner-*.json`) and every Tacitum assessment since 15 Nov, including one bought by an AI agent on its own |
| Missions it serves | 03 Institutional Markets (counterparty checks), 04 Legal (litigation and enforcement history), 01 Exchange (listing and partner checks), 13 Asset Management (portfolio and supplier monitoring) |

## Why it exists

Telegraph had no adverse-media provider. Its own bounty list named the gap ("New capability needed: adverse media screening"). The general news miners return the most relevant article for a query, which for a bank is usually its results, not its fines. Due-diligence workflows need the opposite: only the coverage that reports something adverse, attributed to the right company, with a source for each item.

## What it returns

For `Barclays PLC` (real answer, 15 Nov 2026, through Telegraph):

```json
{
  "answer": "21 adverse news items naming Barclays PLC in the last 12 months from 17 sources, mainly investigation, misconduct, litigation. Latest: Barclays Faces Class Action Probe Over Alleged Misleading Disclosures (Yahoo Finance, 2026-10-28).",
  "result_count": 21,
  "sources": ["Yahoo Finance", "Bloomberg.com", "The Times", "Financial Times", "..."],
  "brief": "21 adverse items on Barclays, risk high",
  "risk": "high",
  "categories": { "investigation": 9, "misconduct": 5, "fraud": 5, "litigation": 3 },
  "articles": [{ "title": "...", "source": "...", "published": "2026-10-28", "categories": ["litigation", "investigation"], "url": "..." }]
}
```

Risk levels: `none` (nothing adverse), `low` (only law-firm investor adverts), `elevated` (adverse items), `high` (sanctions, laundering, fraud, bribery or criminal items from two or more sources).

## How it screens

1. **Search**: the entity name plus adverse terms over the last 12 months, in GDELT DOC 2.0 (open data) and Google News RSS.
2. **Attribute**: a headline counts only if it names the entity (case-sensitive, so "Shell" the company is not "WW2 shell") and the adverse term sits in the same clause ("Meta fined, Binance resumes withdrawals" is about Meta).
3. **Categorise**: fraud, money laundering, sanctions, bribery, regulatory action, litigation, criminal, investigation, insolvency, data breach, safety, misconduct, environmental.
4. **Remove noise**: syndicated copies merge; law-firm investor adverts are kept apart; the entity as a crime victim ("theft from Tesco"), its own anti-fraud campaigns, and routine merger reviews are not counted.

## Quality, measured honestly

Three hand-labelled sets of real headlines (`eval/`). The labelling guide is in `eval/labels.json`: a headline is adverse if the named entity is the subject of an allegation, lawsuit, regulatory action or investigation, criminal matter, sanctions, a security breach or financial distress.

| Set | Role | Precision | Recall | F1 |
|---|---|---|---|---|
| Tuning (8 companies) | rules adjusted on it | 0.96 | 1.00 | 0.98 |
| Holdout (8 companies) | rules adjusted on its errors | 0.85 | 0.91 | 0.88 |
| **Test (8 new companies)** | **collected after the rules were frozen, labelled blind** | **0.91** | **0.71** | **0.80** |

Only the test row is a fair estimate. Before the last round of rules, the holdout scored 0.63 / 0.63, which is why a separate test set exists. Re-run all three with `node miner/eval/run.mjs` (free, no network).

**Known misses** (from the test set): vocabulary not yet covered ("dispute", "criminal court", "financial hit"), company names joined by a hyphen ("Ex-Deutsche Bank"), the entity as plaintiff ("Amazon and Philips file lawsuit"), and title-case headlines where a common word equals the name ("Shell Firm").

## Try it

**Free, direct** (no wallet):

```bash
curl "https://adverse.54-255-109-186.sslip.io/api/adverse?query=Barclays%20PLC"
```

**Through Telegraph** (paid, receipted; needs a Sepolia wallet with test USDC in its Telegraph escrow, see the main [docs](../web/docs.html#funds)):

```js
import { createClient } from "tacitum";               // or any x402 client
const client = createClient(account);
const r = await client.askMiner(7314402, "NEWS_SEARCH_GENERAL", { query: "Barclays PLC" });
console.log(r.data.result, r.data.signal_hash);       // answer + public receipt
```

Every answer bought through Telegraph has a public record at `https://devnode.telegraphprotocol.com/engine/v1/signal/<signal_hash>`.

## Run your own copy

```bash
cd miner
node --input-type=module -e "const {screen}=await import('./lib/adverse.js');console.log(await screen('Barclays PLC'))"
node --test test/            # headline cases
node eval/run.mjs            # quality on the three labelled sets
vercel deploy --prod         # or any Node host; the API is api/adverse.js
```

Register or update it on Telegraph from the repo root: `node scripts/miner-register.mjs --dry`, then without `--dry` (swaps test USDC for the MACHINA bond and calls `registerMiner`); after a YAML change, `node scripts/miner-update.mjs`. The YAML is `public/miner.yaml`; no API keys are needed or stored.

## Limits

- Runs on Sepolia (Telegraph H2 testnet); answers are free to fetch directly and $0.01 through Telegraph.
- Hosted on its own server (AWS Lightsail, dedicated IP) behind Caddy, with a 15-minute answer cache; a Vercel copy (`tacitum-adverse.vercel.app`) serves as a fallback. GDELT can take ~10 s to answer; Google News RSS answers in about a second.
- Headline-level screening: it does not read article bodies. A FLAG means "a person should read these items", not a finding.
- English-language news only.
