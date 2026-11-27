# Liquidity depth: can we answer the pools nobody answers? (checked 2026-11-27, before building a miner)

Demand: in the feed of 24-27 Nov, LIQUIDITY_DEPTH_VERIFY got 603 asks, 32% usable. The 10 pools below were asked 402 times with 0 successes (miners support only Orca, Raydium, Meteora; GeckoTerminal and DexScreener index none of these except Byreal and JupLend).

Three methods, run independently: (1) `depth-run.mjs`: token accounts owned by, or written inside, the pool account; (2) `verify.mjs`: the accounts whose balances move in the pool's real recent swaps; (3) Jupiter quotes routed through that exact pool (a quote must not pay out more than the out-side reserve).

| DEX | Pool | Asks | Method 1 | Method 2 (swaps) | Outside index | Verdict |
|---|---|---|---|---|---|---|
| Byreal | 23XoPQ | 8 | $1,055,685 | $1,056,027 | GeckoTerminal $1,060,056 | **Verified, 3 sources within 0.4%** |
| BisonFi | 8FnX3x | 216 | $4.18M (vaults owned by the pool address) | swaps show no vault moves | none | Likely right; one method only |
| BisonFi | FJnaii | 6 | $1.14M (owned by pool) | none | none | Likely right; one method only |
| Scorch | 9mzt81 | 52 | $1.07M | $1.60M | none | **Methods disagree**: vault authority is shared across pools |
| Scorch | 5ZWCKP | 52 | $1.04M | $954k | none | **Disagree by 9%** |
| Manifest | 7ecvmh | 14 | $913k | $659k | none | **Understated**: a quote paid out 6,191 SOL vs 4,135 in the vault (orders backed by global accounts) |
| Manifest | 4ba9bg | 2 | $209k | $225k | none | Uncertain, same issue |
| Deriverse | H7o7KC | 48 | not found | $328k | none | One method only |
| JupLend AMM | Etb72A | 2 | not found | $44M (shared lending vault, wrong) | GeckoTerminal $466k | Generic methods fail |
| Sanctum Infinity | Gb7m4d | 2 | not found | $30k (wrong; multi-token pool) | none | Generic methods fail |

Result: confident on 3 pools (230 of 402 asks, 57%); ambiguous on 5 (170 asks); wrong with generic methods on 2. For prop AMMs and order books, "total pool liquidity" is not one well-defined number, because inventory can be shared or held outside the pool. A miner must decode each DEX's own layout and decline when it can't attribute reserves, not guess.

## After building the miner (depth-miner/, 27 Nov 2026)

The miner answers only where reserves can be attributed (pool-owned vaults, or the vaults named in a Raydium AMM v4, CPMM or PumpSwap pool account) and declines the rest with the reason. Both sets were frozen with a sha256 before the miner ran (`cases.json`, `wide-cases.json`).

**Set 1: every Solana pool asked on Telegraph's feed** (21 pools, 458 asks; `eval.mjs`, [eval-results.json](eval-results.json))
- Against GeckoTerminal, where it indexes the pool: **12 of 12 answered pools within 2%, median error 0.13%**. One indexed pool (JupLend, 2 asks) is declined.
- The 10 pools no miner had answered (402 asks): **3 now answered, covering 230 asks** (BisonFi 216 + 6, Byreal 8). The other 7 are declined with a reason (Scorch 104, Deriverse 48, Manifest 16, JupLend 2, Sanctum 2 asks).

**Set 2: pools we did not choose**, GeckoTerminal's own top 60 Solana pools (`eval-wide.mjs`, [eval-wide-results.json](eval-wide-results.json))
- Of the 50 pools worth $1k or more: **50 answered, 42 within 5%, 46 within 10%, median error 1.14%**.
- The 4 beyond 10% are all PumpSwap memecoin pools. Re-checked minutes later, 3 matched GeckoTerminal within 0.2% (ATX $579,124 vs $579,558; mihao $1,406 vs $1,401; KITT $2,022 vs $2,022): the pools moved between the two reads. On the 4th (SNOWBALLY), the chain shows 1.19 SOL and $1.3k of the token, while GeckoTerminal says $73k, so its figure is stale.
- The 10 pools under $1k: 9 declined as `dust_pool` (under $1, below the intent's range), 1 Manifest declined.

Reliability: publicnode refuses `getTokenAccountsByOwner` without a token, and Solana's public RPC rate-limits it. The miner looks up a pool's vault addresses once (seeded in `depth-miner/data/vaults.seed.json`), then re-reads them by address with `getMultipleAccounts`, re-checking the owner each time.
