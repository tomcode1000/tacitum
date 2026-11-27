// Offline tests for the pool-depth miner: every rule and failure path, with a fake chain and Jupiter.
import test from "node:test";
import assert from "node:assert/strict";
import { poolLiquidity, parseRequest, pickSides, Decline } from "../lib/depth.js";

const POOL = "8FnX3xo2yYw3EUE6w3nQA4GfXGS9wpK6oj3veJpbFzLo";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL = "So11111111111111111111111111111111111111112";
const DUST = "2f6eAUpPkLh1mNq2gR8qP7Nqdo1ZBRfP3ZX9yRtFa8Lm";
const BISON = "BiSoNHVpsVZW2F7rx2eQ59yQwKxzU5NvBcmKshCSUypi";
const SCORCH = "ojh19ojaKduoJZuaJADhcVGp4xt1TcdAvZmpVsCorch";

const acct = (vault, mint, amount, decimals = 6) => ({ pubkey: vault, account: { data: { parsed: { info: { mint, tokenAmount: { uiAmountString: String(amount), uiAmount: amount, decimals } } } } } });

function fake({ owner = BISON, exists = true, vaults = [acct("VaultUsdc", USDC, 2_000_000), acct("VaultSol", SOL, 10_000, 9)], prices = { [USDC]: 1, [SOL]: 100 }, route = POOL, label = "BisonFi" } = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (method, params) => {
      calls.push(method);
      if (method === "getAccountInfo") return { context: { slot: 42 }, value: exists ? { owner } : null };
      if (method === "getTokenAccountsByOwner") return { value: params[1].programId.startsWith("Tokenkeg") ? vaults : [] };
      throw new Error("unexpected " + method);
    },
    dexLabel: async () => label,
    jup: async (path) => {
      calls.push(path.split("?")[0]);
      if (path.startsWith("/price/v3")) return Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, { usdPrice: v }]));
      if (path.startsWith("/tokens/v2/search")) return [{ id: USDC, symbol: "USDC" }, { id: SOL, symbol: "SOL" }];
      if (path.startsWith("/swap/v1/quote")) {
        const amt = Number(new URLSearchParams(path.split("?")[1]).get("amount"));
        return route ? { outAmount: String(Math.floor(amt / 100 * 1e3)), priceImpactPct: "0.001", routePlan: [{ swapInfo: { ammKey: route } }] } : { error: "No routes found" };
      }
      return null;
    },
  };
}

test("chain must be Solana; common spellings accepted", () => {
  for (const c of ["solana", "Solana", "SOL", "solana-mainnet", "solana mainnet beta"]) assert.equal(parseRequest({ pool: POOL, chain: c }).chain, "solana");
  for (const c of ["ethereum", "base", "", undefined]) assert.throws(() => parseRequest({ pool: POOL, chain: c }), (e) => e instanceof Decline && e.code === "unsupported_chain" && e.status === 422);
});

test("pool must be a base58 address, not a name", () => {
  for (const p of ["Uniswap USDC/ETH", "SOL/USDC", "", "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640"]) assert.throws(() => parseRequest({ pool: p, chain: "solana" }), (e) => e.code === "pool_address_required");
});

test("liquidity is the USD sum of the two pool-owned reserve vaults", async () => {
  const r = await poolLiquidity({ pool: POOL, chain: "solana" }, fake());
  assert.equal(r.liquidity_usd, 3_000_000);
  assert.deepEqual(r.reserves.map((s) => s.vault).sort(), ["VaultSol", "VaultUsdc"]);
  assert.equal(r.pair, "USDC/SOL");
  assert.equal(r.dex, "BisonFi");
  assert.equal(r.slot, 42);
  assert.match(r.answer, /\$3\.00M/);
});

test("route verified only when Jupiter routes through this exact pool", async () => {
  assert.equal((await poolLiquidity({ pool: POOL, chain: "solana" }, fake())).route_verified, true);
  const other = await poolLiquidity({ pool: POOL, chain: "solana" }, fake({ route: "SomeOtherPool1111111111111111111111111111111" }));
  assert.equal(other.route_verified, false);
  assert.equal(other.confidence, "medium");
  assert.deepEqual(other.depth, []);
  assert.equal(other.liquidity_usd, 3_000_000, "the reserve figure does not depend on the route check");
});

test("no route at all still answers with medium confidence", async () => {
  const r = await poolLiquidity({ pool: POOL, chain: "solana" }, fake({ route: null }));
  assert.equal(r.route_verified, false);
  assert.equal(r.confidence, "medium");
});

test("depth never quotes more than the out-side reserve", async () => {
  const f = fake({ vaults: [acct("VaultUsdc", USDC, 50_000), acct("VaultSol", SOL, 50, 9)] }); // SOL side $5k
  const r = await poolLiquidity({ pool: POOL, chain: "solana" }, f);
  assert.ok(r.depth.every((d) => d.sell_usd <= 5_000));
  assert.equal(f.calls.filter((c) => c === "/swap/v1/quote").length, 1);
});

test("unpriced and dust tokens are excluded from the headline figure", async () => {
  const vaults = [acct("VaultUsdc", USDC, 2_000_000), acct("VaultSol", SOL, 10_000, 9), acct("VaultDust", DUST, 1_470_000)];
  const r = await poolLiquidity({ pool: POOL, chain: "solana" }, fake({ vaults }));
  assert.equal(r.liquidity_usd, 3_000_000);
});

test("a third priced token is reported separately, not added", async () => {
  const vaults = [acct("VaultUsdc", USDC, 2_000_000), acct("VaultSol", SOL, 10_000, 9), acct("VaultDust", DUST, 100)];
  const r = await poolLiquidity({ pool: POOL, chain: "solana" }, fake({ vaults, prices: { [USDC]: 1, [SOL]: 100, [DUST]: 2 } }));
  assert.equal(r.liquidity_usd, 3_000_000);
  assert.equal(r.other_holdings_usd, 200);
});

test("two vaults of the same mint: the larger is the reserve", () => {
  const { sides } = pickSides([{ vault: "fee", mint: USDC, amount: 5, decimals: 6 }, { vault: "main", mint: USDC, amount: 900, decimals: 6 }, { vault: "s", mint: SOL, amount: 3, decimals: 9 }], { [USDC]: 1, [SOL]: 100 });
  assert.equal(sides.find((s) => s.mint === USDC).vault, "main");
});

test("zero-balance vaults are ignored", () => {
  const { sides } = pickSides([{ vault: "a", mint: USDC, amount: 0 }, { vault: "b", mint: SOL, amount: 0 }], { [USDC]: 1, [SOL]: 100 });
  assert.equal(sides.length, 0);
});

test("missing account -> 404 pool_not_found", async () => {
  await assert.rejects(poolLiquidity({ pool: POOL, chain: "solana" }, fake({ exists: false })), (e) => e.status === 404 && e.code === "pool_not_found");
});

test("token mint or wallet -> not_a_pool", async () => {
  await assert.rejects(poolLiquidity({ pool: USDC, chain: "solana" }, fake({ owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" })), (e) => e.code === "not_a_pool");
  await assert.rejects(poolLiquidity({ pool: POOL, chain: "solana" }, fake({ owner: "11111111111111111111111111111111" })), (e) => e.code === "not_a_pool" && /wallet/.test(e.message));
});

test("reserves held outside the pool: declined with the DEX's reason, never guessed", async () => {
  await assert.rejects(poolLiquidity({ pool: POOL, chain: "solana" }, fake({ owner: SCORCH, vaults: [], label: "Scorch" })), (e) => e.code === "reserves_not_attributable" && /shared across its pools/.test(e.message) && e.extra.dex === "Scorch");
});

test("unknown program with one funded vault: declined generically", async () => {
  await assert.rejects(poolLiquidity({ pool: POOL, chain: "solana" }, fake({ owner: "Unknown1111111111111111111111111111111111111", vaults: [acct("v", USDC, 10)] })), (e) => e.code === "reserves_not_attributable" && /owns 1 funded token account/.test(e.message));
});

test("no prices -> unpriced_reserves, not a zero", async () => {
  await assert.rejects(poolLiquidity({ pool: POOL, chain: "solana" }, fake({ prices: {} })), (e) => e.code === "unpriced_reserves");
});

test("only one side priced -> unpriced_reserves", async () => {
  await assert.rejects(poolLiquidity({ pool: POOL, chain: "solana" }, fake({ prices: { [USDC]: 1 } })), (e) => e.code === "unpriced_reserves");
});

test("answer carries what a checker needs: vaults, slot, method, sources", async () => {
  const r = await poolLiquidity({ pool: POOL, chain: "solana" }, fake());
  for (const k of ["liquidity_usd", "reserves", "slot", "method", "sources", "as_of", "program"]) assert.ok(r[k] != null, k);
  assert.ok(r.reserves.every((s) => s.vault && s.mint && s.amount > 0 && s.price_usd > 0));
});

test("liquidity_usd stays inside the intent's declared range", async () => {
  const r = await poolLiquidity({ pool: POOL, chain: "solana" }, fake());
  assert.ok(r.liquidity_usd >= 1 && r.liquidity_usd <= 1e12);
});

test("Jupiter down: reserves still answered, depth empty", async () => {
  const f = fake();
  const jup = f.jup;
  f.jup = async (p) => (p.startsWith("/price") ? jup(p) : null);
  const r = await poolLiquidity({ pool: POOL, chain: "solana" }, f);
  assert.equal(r.liquidity_usd, 3_000_000);
  assert.equal(r.route_verified, false);
  assert.equal(r.reserves[0].symbol, null);
});

test("slow Jupiter quotes are cut off by the time budget", async () => {
  process.env.DEPTH_BUDGET_MS = "300";
  const f = fake();
  const jup = f.jup;
  f.jup = async (p) => (p.startsWith("/swap") ? new Promise((r) => setTimeout(() => r(jup(p)), 2000)) : jup(p));
  const t = Date.now();
  const r = await poolLiquidity({ pool: POOL, chain: "solana" }, f);
  delete process.env.DEPTH_BUDGET_MS;
  assert.ok(Date.now() - t < 1500);
  assert.equal(r.route_verified, false);
  assert.equal(r.liquidity_usd, 3_000_000);
});

// Raydium AMM v4 / CPMM: vaults are read from the pool account at their layout offsets.
import { VAULT_LAYOUTS, base58 } from "../lib/depth.js";
const V4 = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
function layoutFake({ size = 752, vaultData = true } = {}) {
  const f = fake({ owner: V4, label: "Raydium", vaults: [acct("Spam1", "SpamMint111111111111111111111111111111111111", 4000)] });
  const data = Buffer.alloc(size);
  const va = Buffer.alloc(32, 7), vb = Buffer.alloc(32, 9);
  if (size >= 400) { va.copy(data, 336); vb.copy(data, 368); }
  const rpc = f.rpc;
  f.vaults = [base58(va), base58(vb)];
  f.rpc = async (method, params) => {
    if (method === "getAccountInfo" && params[1]?.encoding === "base64" && !params[1].dataSlice) return { value: { owner: V4, data: [data.toString("base64"), "base64"] } };
    if (method === "getMultipleAccounts") {
      f.asked = params[0];
      return { value: vaultData ? [{ data: { parsed: { info: { mint: USDC, tokenAmount: { uiAmountString: "500000", decimals: 6 } } } } }, { data: { parsed: { info: { mint: SOL, tokenAmount: { uiAmountString: "5000", decimals: 9 } } } } }] : [null, null] };
    }
    return rpc(method, params);
  };
  return f;
}

test("base58 encodes known keys", () => {
  assert.equal(base58(Buffer.alloc(32)), "1".repeat(32));
  assert.equal(base58(Buffer.from([0, 0, 1])), "112");
});

test("Raydium v4: reserves come from the vaults named in the pool, spam sent to the pool is ignored", async () => {
  const f = layoutFake();
  const r = await poolLiquidity({ pool: POOL, chain: "solana" }, f);
  assert.deepEqual(f.asked, f.vaults);
  assert.equal(r.liquidity_usd, 1_000_000);
  assert.ok(r.reserves.every((s) => f.vaults.includes(s.vault)));
  assert.match(r.method, /Raydium AMM v4 pool account \(offsets 336, 368\)/);
});

test("Raydium v4 account too short to be a pool -> not_a_pool", async () => {
  await assert.rejects(poolLiquidity({ pool: POOL, chain: "solana" }, layoutFake({ size: 100 })), (e) => e.code === "not_a_pool");
});

test("Raydium v4 vaults missing -> declined, not zero", async () => {
  await assert.rejects(poolLiquidity({ pool: POOL, chain: "solana" }, layoutFake({ vaultData: false })), (e) => e.code === "reserves_not_attributable");
});

test("layout table: offsets fit inside the declared account size", () => {
  for (const l of Object.values(VAULT_LAYOUTS)) assert.ok(l.offsets.every((o) => o + 32 <= l.size));
});

// Constant-product pools: a token with no market price is priced by the pool's own reserve ratio.
import { CONSTANT_PRODUCT } from "../lib/depth.js";
const PUMP = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
function pumpFake({ solAmount = 100, memeAmount = 1_000_000, prices = { [SOL]: 100 }, owner = PUMP } = {}) {
  const MEME = "MemeMint11111111111111111111111111111111111";
  const f = fake({ owner, label: "Pump.fun Amm", prices, vaults: [] });
  const data = Buffer.alloc(300);
  Buffer.alloc(32, 3).copy(data, 139); Buffer.alloc(32, 4).copy(data, 171);
  const rpc = f.rpc;
  f.rpc = async (method, params) => {
    if (method === "getAccountInfo") return { value: { owner, data: [data.toString("base64"), "base64"] } };
    if (method === "getMultipleAccounts") return { value: [{ data: { parsed: { info: { mint: MEME, tokenAmount: { uiAmountString: String(memeAmount), decimals: 6 } } } } }, { data: { parsed: { info: { mint: SOL, tokenAmount: { uiAmountString: String(solAmount), decimals: 9 } } } } }] };
    return rpc(method, params);
  };
  return f;
}

test("PumpSwap: unpriced token valued by the pool ratio, so both sides are equal", async () => {
  const r = await poolLiquidity({ pool: POOL, chain: "solana" }, pumpFake());
  assert.equal(r.liquidity_usd, 20_000);
  const meme = r.reserves.find((s) => s.mint !== SOL);
  assert.equal(meme.usd, 10_000);
  assert.ok(Math.abs(meme.price_usd - 0.01) < 1e-12);
  assert.match(r.method, /priced by this constant-product pool's own reserve ratio/);
});

test("ratio pricing is never used for pools that are not constant-product", async () => {
  // Same two unpriced-on-one-side vaults, but owned directly by a CLMM-style pool: declined.
  const f = fake({ vaults: [acct("a", "MemeMint11111111111111111111111111111111111", 1_000_000), acct("b", SOL, 100, 9)], prices: { [SOL]: 100 } });
  await assert.rejects(poolLiquidity({ pool: POOL, chain: "solana" }, f), (e) => e.code === "unpriced_reserves");
  assert.ok(!CONSTANT_PRODUCT.has(BISON));
});

test("both sides unpriced: declined even for constant-product pools", async () => {
  await assert.rejects(poolLiquidity({ pool: POOL, chain: "solana" }, pumpFake({ prices: {} })), (e) => e.code === "unpriced_reserves");
});

test("pool worth under $1: dust_pool decline, never an out-of-range number", async () => {
  await assert.rejects(poolLiquidity({ pool: POOL, chain: "solana" }, pumpFake({ solAmount: 0.001 })), (e) => e.code === "dust_pool" && e.extra.liquidity_usd_raw > 0 && e.extra.liquidity_usd_raw < 1);
});

test("indexed RPC calls skip providers that refuse them", async () => {
  const seen = [];
  const { makeDeps } = await import("../lib/depth.js");
  const d = makeDeps(async (url, opts) => { seen.push([url, JSON.parse(opts.body).method]); return { json: async () => ({ result: { value: [] } }) }; });
  await d.rpc("getTokenAccountsByOwner", ["x", {}, {}]);
  assert.ok(seen.every(([u, m]) => m !== "getTokenAccountsByOwner" || !u.includes("publicnode")));
});

// Known vaults are re-read by address (a call every public RPC serves), with the owner re-checked.
import { vaultStore } from "../lib/depth.js";
test("known vaults: re-read with getMultipleAccounts, no indexed lookup", async () => {
  const f = fake();
  f.vaults = vaultStore();
  await poolLiquidity({ pool: POOL, chain: "solana" }, f);
  assert.deepEqual(f.vaults.get(POOL).sort(), ["VaultSol", "VaultUsdc"]);
  const rpc = f.rpc;
  f.calls.length = 0;
  f.rpc = async (method, params) => {
    if (method === "getMultipleAccounts") return { value: params[0].map((v) => ({ data: { parsed: { info: { owner: POOL, mint: v === "VaultSol" ? SOL : USDC, tokenAmount: { uiAmountString: v === "VaultSol" ? "10000" : "2000000", decimals: v === "VaultSol" ? 9 : 6 } } } } })) };
    return rpc(method, params);
  };
  const r = await poolLiquidity({ pool: POOL, chain: "solana" }, f);
  assert.equal(r.liquidity_usd, 3_000_000);
  assert.ok(!f.calls.includes("getTokenAccountsByOwner"));
  assert.match(r.method, /re-read live by address/);
});

test("known vault whose owner changed is not counted; falls back to a fresh lookup", async () => {
  const f = fake();
  f.vaults = vaultStore();
  f.vaults.set(POOL, ["Moved1", "Moved2"]);
  const rpc = f.rpc;
  f.rpc = async (method, params) => {
    if (method === "getMultipleAccounts") return { value: params[0].map(() => ({ data: { parsed: { info: { owner: "SomeoneElse", mint: USDC, tokenAmount: { uiAmountString: "999999999", decimals: 6 } } } } })) };
    return rpc(method, params);
  };
  const r = await poolLiquidity({ pool: POOL, chain: "solana" }, f);
  assert.equal(r.liquidity_usd, 3_000_000);
  assert.ok(f.calls.includes("getTokenAccountsByOwner"));
});

test("Jupiter price API down -> 503 price_unavailable, retryable, not 'unpriced'", async () => {
  const f = fake();
  const jup = f.jup;
  f.jup = async (p) => (p.startsWith("/price") ? null : jup(p));
  await assert.rejects(poolLiquidity({ pool: POOL, chain: "solana" }, f), (e) => e.status === 503 && e.code === "price_unavailable");
});
