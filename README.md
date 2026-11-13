# Tacitum

Private counterparty screening on [Telegraph](https://telegraphprotocol.com).

Telegraph Hackathon Season II, Apps & Agents track (Mission 03, Institutional Markets).

## The problem

Every paid Telegraph request is public. `GET /daemon/api/questions` lists the question text, and `GET /engine/v1/signal/{hash}` adds the paying wallet, the answer and the settlement transaction. No login is needed for either.

A desk that screens a counterparty through Telegraph tells everyone watching who it is screening, and which wallet is doing it. Funds, legal teams and listing desks cannot use the network that way.

## What Tacitum does

An agent assesses a counterparty (sanctions, company registry, on-chain activity, filings) with intelligence bought through Telegraph, and:

- **hides the payer**: each purchase comes from a one-time wallet funded from a pool that only screened depositors can enter
- **hides the question**: the real request is sent among paid decoys drawn from the live feed
- **keeps the proof**: every receipt stays verifiable, and an auditor's viewing key reveals the full record
- **measures the privacy**: an attacker model is run against our own traffic and its success rate is published

It is a layer on top of Telegraph. Every answer is still bought from Telegraph miners.

## Status

- [x] Testnet payer wallet and x402 client (`npm run wallet`, `npm run first-call`)
- [x] First paid call: one $0.01 sanctions screen, settled in tx `0x26bbada3…09fad1` on Sepolia. The public feed shows our wallet and the question (`evidence/`)
- [x] Counterparty assessment workflow (`npm run assess -- "Barclays PLC" GB`), see PLAN.md
- [x] Decoy engine and privacy measurement: with k=4 matched decoys every simple attacker is at chance (best learned 0.38, 95% interval 0.18–0.61, 16 runs)
- [x] Private mode v0: decoys plus a one-time payer per assessment (`npm run private`); funding still linkable on chain
- [x] Cover sets: decoy groups are fixed and shared, so bundles look the same whichever member was wanted and repeat screens reveal nothing (`data/cover-sets.json`)
- [x] Library and MCP server (`tacitum`, `tacitum-mcp`), below
- [ ] Screened funding pool (removes the funding link)
- [ ] Viewing keys

## Use it in your project

```bash
npm install github:tomcode1000/tacitum
```

You need a Sepolia key with some test USDC and a little ETH (`npm run wallet` in this repo makes one). It is only the **funder**: it pays into a fresh one-time wallet's Telegraph escrow, and that wallet buys the answers.

```js
import { tacitum } from "tacitum";
import { privateKeyToAccount } from "viem/accounts";

const t = tacitum({ funder: privateKeyToAccount(process.env.FUNDER_KEY), k: 4 });

// Counterparty screen among 3 matched decoys: sanctions (two miners), registry, filings, news.
const { memo, assessment } = await t.assess({ name: "Barclays PLC", jurisdiction: "GB" });

// Any intent, with decoys you supply (same params shape, plausible values).
const { answer } = await t.ask("SANCTIONS_SCREENING_MATCH_GENERAL", { name: "Acme Trading Ltd" }, {
  decoys: [{ name: "Brindle Supplies Ltd" }, { name: "Corvel Logistics Ltd" }, { name: "Dunmore Metals Ltd" }],
});
```

A private call takes at least two minutes: the node only sees a new escrow deposit after a delay, and a payer it has seen empty is refused until the epoch closes, so Tacitum waits before the first paid call.

State (caches, cover sets, one-time keys) goes to `./.tacitum`, or `TACITUM_HOME` / `TACITUM_KEYS`. Keep the keys: they are what lets you open the record for an auditor.

### As an MCP server

```bash
claude mcp add tacitum -e TACITUM_FUNDER_KEY=0x... -- npx -y github:tomcode1000/tacitum
```

Tools: `private_assess` (name, jurisdiction, k) returns the memo; `private_ask` (intent, params, decoys, minerId) returns only the real answer.

### What it hides, and what it does not

- Hidden: which counterparty you cared about (one of k, measured against attackers in `data/privacy-results.json`), and the link between this question and your other questions (a new wallet each time).
- Not hidden yet: the funding deposit is on chain, so the one-time wallet can be traced to the funder. The screened pool will remove that.
- Decoys you pass to `ask()` are only as good as they are plausible. A famous name among made-up ones hides nothing.

## Run (this repo)

Node 20 or later.

```bash
npm install
npm run wallet       # creates a testnet-only key in .env and mints test USDC once it has Sepolia ETH
npm run first-call   # one paid sanctions screen, then prints what the public feed shows about it
npm run probe        # tests candidate miners against known answers (about $0.15)
npm run assess -- "Barclays PLC" GB   # full counterparty memo, about $0.06
npm run private -- "Barclays PLC" GB  # same memo, bought among 3 decoys by a one-time wallet, about $0.21
```
