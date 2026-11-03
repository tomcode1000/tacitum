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
- [ ] Counterparty assessment workflow
- [ ] Decoy engine and privacy measurement
- [ ] Screened funding pool and one-time payers
- [ ] Viewing keys
- [ ] Drop-in fetch wrapper and MCP server

## Run

Node 20 or later.

```bash
npm install
npm run wallet       # creates a testnet-only key in .env and mints test USDC once it has Sepolia ETH
npm run first-call   # one paid sanctions screen, then prints what the public feed shows about it
```
