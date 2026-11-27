# Tacitum Solana Pool Depth

**A Telegraph miner that answers "how much liquidity is in this Solana pool?" for pools no other miner can read, from the pool's own vaults on chain, and declines with a reason where nobody can attribute the reserves.**

Telegraph Hackathon Season II, **Track 02 (Miners / Providers)**. A sibling of the [adverse-media miner](../miner/README.md), with its own registration, endpoint and tests.

| | |
|---|---|
| Miner | `tacitum-pool-depth`, id **7314403** |
| Intent | `LIQUIDITY_DEPTH_VERIFY_GENERAL` (params `pool`, `chain`; scored field `liquidity_usd`) |
| Missions | 01 Exchange (market-integrity alerts), 02 Stablecoin (treasury decisions) |
| Endpoint | `https://depth.54-255-109-186.sslip.io/api/depth?pool=<address>&chain=solana` |
| Data | Solana mainnet RPC, Jupiter Price API v3, Jupiter Quote API. No API key |

## Why it exists

In Telegraph's public feed for 24 to 27 Nov 2026, `LIQUIDITY_DEPTH_VERIFY_GENERAL` was asked 603 times and only 32% of the answers were usable, which made it the most-failed intent on the network. Ten Solana pools were asked 402 times with **zero** successes. They sit on BisonFi, Scorch, Manifest, Byreal, Deriverse, JupLend and Sanctum, which the routed miners don't read ("not an Orca Whirlpool, Raydium or Meteora DLMM pool") and which GeckoTerminal and DexScreener mostly don't index.

## How it answers

1. Read the pool account and its owning program; name the DEX from Jupiter's program-to-label map.
2. **Reserve rule:** a reserve counts only if the token account's owner *is* the pool account (`getTokenAccountsByOwner`), which holds for Orca, Raydium CLMM, Meteora DLMM, Byreal, BisonFi and others. Raydium AMM v4 and CPMM keep vaults under an authority, so their two vault addresses are read from the pool account at the published layout offsets (tokens spammed to the pool address are ignored).
3. Price the two largest such vaults with Jupiter; `liquidity_usd` is their sum. Other holdings are reported apart, never added.
4. **Route check and depth:** quote $1k, $10k and $100k through Jupiter restricted to this DEX with direct routes only. If Jupiter routes through this exact pool, `route_verified: true` and the price impact is returned.
5. **Decline, don't guess.** If the pool account doesn't own its reserves (Scorch's shared vaults, Manifest's global orders, Deriverse's and JupLend's protocol vaults, Sanctum's multi-token pool), the answer is a 422 with the reason. Our pre-build check ([FINDINGS](../benchmarks/liquidity-depth/FINDINGS.md)) showed generic methods give wrong numbers there, by up to 100 times.

Every answer names its vault accounts and slot, so anyone can re-read them on chain.

```bash
curl "https://depth.54-255-109-186.sslip.io/api/depth?pool=8FnX3xo2yYw3EUE6w3nQA4GfXGS9wpK6oj3veJpbFzLo&chain=solana"
```

## Quality

Measured against GeckoTerminal, an independent indexer, on two sets frozen (sha256) before the miner ran. Details are in [FINDINGS](../benchmarks/liquidity-depth/FINDINGS.md).

| Set | Answered | Accuracy vs GeckoTerminal |
|---|---|---|
| Every Solana pool asked on Telegraph's feed (21 pools, 458 asks) | 14 of 21; the other 7 declined with a reason | **12 of 12 within 2%**, median error 0.13% |
| Pools no miner had ever answered (10 pools, 402 asks) | **3 pools, covering 230 asks** (was 0) | Byreal within 0.3%. BisonFi isn't indexed anywhere; it's checked by Jupiter routing through the exact pool |
| GeckoTerminal's own top Solana pools worth $1k or more (50) | 50 of 50 | 42 within 5%, 46 within 10%, median 1.14%. The 4 outliers are fast-moving memecoin pools: 3 matched on re-check, and on 1 GeckoTerminal is stale |

Re-run (free, no Telegraph payments): `node benchmarks/liquidity-depth/eval.mjs --reuse` and `node benchmarks/liquidity-depth/eval-wide.mjs --reuse`. Unit tests (33): `node --test "depth-miner/test/**/*.test.mjs"`.

## Run, deploy, register

```bash
PORT=4203 node depth-miner/server.mjs                           # local
bash /opt/tacitum/deploy/add-depth-miner.sh                     # on the server (systemd + Caddy)
node scripts/miner-register.mjs --miner depth --dry             # then without --dry
```

## Limits

- Solana only. Other chains get `unsupported_chain`.
- Needs the pool's account address, not a pair name.
- `liquidity_usd` is the reserves held by the pool account. For concentrated-liquidity pools that is total value locked, not depth near the price; the `depth` table gives the price impact for trades.
- Prices come from Jupiter; a token with no Jupiter price is declined (`unpriced_reserves`), not given a zero.
