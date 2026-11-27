// Solana pool liquidity: the USD value of the token vaults a pool account owns, read from chain.
// Answers Telegraph LIQUIDITY_DEPTH_VERIFY_GENERAL (params pool, chain; scored field liquidity_usd).
//
// Rule (from benchmarks/liquidity-depth/FINDINGS.md): a reserve counts only if the token account's
// owner IS the pool account. That is unambiguous for Orca, Raydium CLMM, Meteora, Byreal, BisonFi and
// others. Prop AMMs and order books that hold inventory elsewhere (Scorch, Manifest, Deriverse,
// JupLend, Sanctum) fail that test, and we decline with a reason instead of guessing.
// Every answer names the vault accounts, so anyone can re-read them on chain.

// Optional private RPC first (SOLANA_RPC, e.g. a free Helius URL), then public ones. publicnode
// refuses indexed calls (getTokenAccountsByOwner) without a token, so those skip it.
const PRIVATE = (process.env.SOLANA_RPC || "").split(",").filter(Boolean);
export const RPCS = [...PRIVATE, "https://api.mainnet-beta.solana.com", "https://solana-rpc.publicnode.com"];
const INDEXED_RPCS = [...PRIVATE, "https://api.mainnet-beta.solana.com"];
const INDEXED = new Set(["getTokenAccountsByOwner", "getProgramAccounts"]);
// Constant-product pools: a token with no market price is priced by the pool's own ratio against the
// priced side (both sides then hold equal value), as GeckoTerminal does for fresh tokens.
export const CONSTANT_PRODUCT = new Set(["675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8", "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C", "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"]);
import fs from "node:fs";
const JUP = "https://lite-api.jup.ag";
const TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SOLANA = /^(sol|solana)([ -_]?mainnet([ -_]?beta)?)?$/i;
// Known homes of reserves held outside the pool account: decline with this reason, never a guess.
const ELSEWHERE = {
  ojh19ojaKduoJZuaJADhcVGp4xt1TcdAvZmpVsCorch: "Scorch keeps inventory in vaults shared across its pools, so no single figure belongs to this pool",
  MNFSTqtC93rEfYHB6hF82sKdZpUDFWkViLByLd1k1Ms: "Manifest is an order book whose orders can be backed by global accounts outside this market",
  DRVSpZ2YUYYKgZP8XtLhAGtT1zYSCKzeHfb4DgRnrgqD: "Deriverse holds funds in protocol vaults shared across markets",
  jupZ4m2GqUCJ5iueMfzQf8khFfH31d4XAQt3RzCT9Vd: "JupLend AMM draws on shared lending vaults, not pool-owned reserves",
  "5ocnV1qiCgaQR8Jb8xWnVbApfaygJ8tNoZfgPwsgx9kx": "Sanctum Infinity is one multi-token pool for all its LSTs; ask about the Infinity pool as a whole",
};
const FALLBACK_LABELS = {
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: "Whirlpool",
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: "Raydium CLMM",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "Raydium",
  CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C: "Raydium CP",
  LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo: "Meteora DLMM",
  BiSoNHVpsVZW2F7rx2eQ59yQwKxzU5NvBcmKshCSUypi: "BisonFi",
  REALQqNEomY6cQGZJUGwywTBD2UmDT32rZcNnfxQ5N2: "Byreal",
};
const DEPTH_SIZES_USD = [1_000, 10_000, 100_000];
// Programs whose vaults are owned by an authority PDA, not the pool: read the two vault addresses
// at their published offsets in the pool account (Raydium SDK layouts).
export const VAULT_LAYOUTS = {
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": { name: "Raydium AMM v4", offsets: [336, 368], size: 752 },
  CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C: { name: "Raydium CPMM", offsets: [72, 104], size: 637 },
  pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA: { name: "PumpSwap", offsets: [139, 171], size: 203 },
};
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function base58(buf) {
  let x = BigInt("0x" + (Buffer.from(buf).toString("hex") || "0")), s = "";
  while (x > 0n) { s = B58[Number(x % 58n)] + s; x /= 58n; }
  for (const b of buf) { if (b === 0) s = "1" + s; else break; }
  return s;
}

export class Decline extends Error {
  constructor(status, code, message, extra = {}) { super(message); this.status = status; this.code = code; this.extra = extra; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A tiny pool -> vault-address store: a committed seed, plus a local file it learns into (not committed).
export function vaultStore(file, seed) {
  let m = {};
  for (const p of [seed, file]) if (p) { try { Object.assign(m, JSON.parse(fs.readFileSync(p, "utf8"))); } catch {} }
  return {
    get: (pool) => m[pool]?.vaults ?? null,
    set: (pool, vaults) => { m[pool] = { vaults, at: new Date().toISOString() }; if (file) { try { fs.writeFileSync(file, JSON.stringify(m, null, 1)); } catch {} } },
    all: () => m,
  };
}

export function makeDeps(fetchImpl = globalThis.fetch, vaults = vaultStore(process.env.DEPTH_VAULTS_FILE, process.env.DEPTH_VAULTS_SEED)) {
  let labels = null, labelsAt = 0;
  async function rpc(method, params) {
    let last;
    const urls = INDEXED.has(method) ? INDEXED_RPCS : RPCS;
    for (let i = 0; i < 8; i++) {
      try {
        const r = await fetchImpl(urls[i % urls.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15000) });
        const j = await r.json();
        if (j.error) throw new Error(`rpc ${method}: ${j.error.message || JSON.stringify(j.error)}`);
        return j.result;
      } catch (e) { last = e; await sleep(Math.min(2500, 350 * (i + 1))); }
    }
    throw new Decline(503, "rpc_unavailable", `Solana RPC unavailable (${last?.message})`);
  }
  async function jup(path) {
    for (let i = 0; i < 5; i++) {
      try { const r = await fetchImpl(`${JUP}${path}`, { signal: AbortSignal.timeout(12000) }); if (r.status === 429) { await sleep(1200 * (i + 1)); continue; } return await r.json(); }
      catch { await sleep(600 * (i + 1)); }
    }
    return null;
  }
  async function dexLabel(program) {
    if (!labels || Date.now() - labelsAt > 6 * 3600e3) {
      const j = await jup("/swap/v1/program-id-to-label");
      if (j && typeof j === "object" && !j.error) { labels = j; labelsAt = Date.now(); }
    }
    return labels?.[program] ?? FALLBACK_LABELS[program] ?? null;
  }
  return { rpc, jup, dexLabel, vaults };
}

export function parseRequest({ pool, chain } = {}) {
  const p = String(pool ?? "").trim(), c = String(chain ?? "").trim();
  if (!c || !SOLANA.test(c)) throw new Decline(422, "unsupported_chain", `This miner reads Solana pools only; chain "${c || "(missing)"}" is not supported.`);
  if (!BASE58.test(p)) throw new Decline(422, "pool_address_required", `Send the pool's Solana account address (base58), not a name: got "${p.slice(0, 60) || "(missing)"}".`);
  return { pool: p, chain: "solana" };
}

// Pure: pick the pool's two sides from the token accounts it owns, given USD prices.
export function pickSides(accounts, prices) {
  const byMint = {};
  for (const a of accounts) {
    const amount = Number(a.amount);
    if (!(amount > 0)) continue;
    const px = prices[a.mint];
    const usd = px == null ? null : amount * px;
    const cur = byMint[a.mint];
    if (!cur || amount > cur.amount) byMint[a.mint] = { mint: a.mint, vault: a.vault, amount, decimals: a.decimals, price_usd: px ?? null, usd };
  }
  const all = Object.values(byMint);
  const priced = all.filter((s) => s.usd != null).sort((a, b) => b.usd - a.usd);
  const sides = priced.slice(0, 2);
  const other = all.filter((s) => !sides.includes(s));
  return { sides, otherUsd: other.reduce((t, s) => t + (s.usd ?? 0), 0), unpriced: all.filter((s) => s.usd == null).map((s) => s.mint) };
}

const fmtUsd = (n) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}k` : `$${n.toFixed(2)}`);

export async function poolLiquidity(input, deps = makeDeps()) {
  const { pool } = parseRequest(input);
  const started = Date.now();
  const info = await deps.rpc("getAccountInfo", [pool, { encoding: "base64" }]);
  if (!info?.value) throw new Decline(404, "pool_not_found", `No Solana account exists at ${pool}.`);
  const program = info.value.owner;
  if (TOKEN_PROGRAMS.includes(program) || program === "11111111111111111111111111111111") throw new Decline(422, "not_a_pool", `${pool} is a ${program.startsWith("Token") ? "token account or mint" : "wallet"}, not a pool.`);
  const [dex] = await Promise.all([deps.dexLabel(program)]);
  const slot = info.context?.slot ?? null;

  const owned = [];
  const layout = VAULT_LAYOUTS[program];
  let method = "Sum of the two largest USD-priced token accounts owned by the pool account (getTokenAccountsByOwner)";
  if (layout) {
    // Vaults named in the pool account itself; tokens sent to the pool address (spam) are ignored.
    const data = Buffer.from(info.value.data?.[0] ?? "", "base64");
    if (data.length < layout.size) throw new Decline(422, "not_a_pool", `${pool} is owned by ${layout.name} but is not a pool account (${data.length} bytes).`);
    const addrs = layout.offsets.map((o) => base58(data.subarray(o, o + 32)));
    const accs = await deps.rpc("getMultipleAccounts", [addrs, { encoding: "jsonParsed" }]);
    accs?.value?.forEach((a, k) => {
      const i = a?.data?.parsed?.info;
      if (i?.tokenAmount) owned.push({ vault: addrs[k], mint: i.mint, amount: i.tokenAmount.uiAmountString ?? i.tokenAmount.uiAmount, decimals: i.tokenAmount.decimals });
    });
    method = `Sum of the two vault accounts named in the ${layout.name} pool account (offsets ${layout.offsets.join(", ")})`;
  } else {
    // The set of token accounts a pool owns rarely changes; once known it is re-read with
    // getMultipleAccounts, which every public RPC serves (the indexed lookup is rate-limited).
    const known = deps.vaults?.get(pool);
    if (known?.length) {
      const accs = await deps.rpc("getMultipleAccounts", [known, { encoding: "jsonParsed" }]);
      accs?.value?.forEach((a, k) => {
        const i = a?.data?.parsed?.info;
        if (i?.tokenAmount && i.owner === pool) owned.push({ vault: known[k], mint: i.mint, amount: i.tokenAmount.uiAmountString ?? i.tokenAmount.uiAmount, decimals: i.tokenAmount.decimals });
      });
      method = "Sum of the two largest USD-priced token accounts owned by the pool account (getTokenAccountsByOwner once, then re-read live by address, owner re-checked)";
    }
    if (!owned.length) {
      const vaultLists = await Promise.all(TOKEN_PROGRAMS.map((prog) => deps.rpc("getTokenAccountsByOwner", [pool, { programId: prog }, { encoding: "jsonParsed" }])));
      for (const r of vaultLists) {
        for (const a of r?.value ?? []) {
          const i = a.account.data.parsed.info;
          owned.push({ vault: a.pubkey, mint: i.mint, amount: i.tokenAmount.uiAmountString ?? i.tokenAmount.uiAmount, decimals: i.tokenAmount.decimals });
        }
      }
      if (owned.length) deps.vaults?.set(pool, owned.map((o) => o.vault));
    }
  }
  const mints = [...new Set(owned.filter((a) => Number(a.amount) > 0).map((a) => a.mint))];
  if (mints.length < 2) {
    const why = ELSEWHERE[program] ?? `the pool account owns ${mints.length} funded token account${mints.length === 1 ? "" : "s"}, so its reserves are held elsewhere and cannot be attributed to it without guessing`;
    throw new Decline(422, "reserves_not_attributable", `Declined for ${dex ?? program} pool ${pool}: ${why}.`, { dex, program });
  }
  const pj = await deps.jup(`/price/v3?ids=${mints.slice(0, 50).join(",")}`);
  if (!pj || pj.error) throw new Decline(503, "price_unavailable", "Jupiter Price API did not answer; retry shortly.", { dex, program });
  const prices = Object.fromEntries(Object.entries(pj ?? {}).filter(([, v]) => v?.usdPrice != null).map(([k, v]) => [k, Number(v.usdPrice)]));
  let { sides, otherUsd, unpriced } = pickSides(owned, prices);
  let pricedBy = "Jupiter Price API v3";
  if (sides.length === 1 && layout && CONSTANT_PRODUCT.has(program)) {
    // Exactly two vaults, one priced: the pool's own ratio prices the other (x*y=k pools hold equal value per side).
    const other = owned.find((o) => o.mint !== sides[0].mint && Number(o.amount) > 0);
    if (other) {
      const amount = Number(other.amount);
      sides = [sides[0], { mint: other.mint, vault: other.vault, amount, decimals: other.decimals, price_usd: sides[0].usd / amount, usd: sides[0].usd, priced_by_pool_ratio: true }];
      unpriced = [];
      pricedBy = `Jupiter Price API v3; ${other.mint} has no market price and is priced by this constant-product pool's own reserve ratio`;
    }
  }
  if (sides.length < 2) throw new Decline(422, "unpriced_reserves", `Pool ${pool} holds tokens with no USD price (${unpriced.slice(0, 3).join(", ")}), so no dollar figure can be given.`, { dex, program });
  const total = sides[0].usd + sides[1].usd;
  if (total < 1) throw new Decline(422, "dust_pool", `${dex ?? "Solana"} pool ${pool} holds under $1 in total ($${total.toFixed(4)}), below the intent's range; it is effectively empty.`, { dex, program, liquidity_usd_raw: total });

  // Symbols (cosmetic) and the route check plus depth (Jupiter quotes restricted to this DEX, direct
  // routes only; verified when Jupiter routes through THIS pool), all in parallel, with a time budget so
  // the core answer is never late: the reserves are already known.
  const [a, b] = sides;
  const budget = (ms) => new Promise((r) => setTimeout(() => r(null), Math.max(0, ms)));
  const left = () => Number(process.env.DEPTH_BUDGET_MS || 20000) - (Date.now() - started);
  const sizes = dex ? DEPTH_SIZES_USD.filter((usd) => usd <= b.usd) : [];
  const [tj, ...quotes] = await Promise.all([
    Promise.race([deps.jup(`/tokens/v2/search?query=${sides.map((s) => s.mint).join(",")}`), budget(left())]),
    ...sizes.map((usd) => Promise.race([
      deps.jup(`/swap/v1/quote?inputMint=${a.mint}&outputMint=${b.mint}&amount=${BigInt(Math.floor((usd / a.price_usd) * 10 ** a.decimals))}&slippageBps=100&dexes=${encodeURIComponent(dex)}&onlyDirectRoutes=true`),
      budget(left()),
    ])),
  ]);
  for (const s of sides) s.symbol = (Array.isArray(tj) ? tj.find((t) => t.id === s.mint)?.symbol : null) ?? null;
  const depth = [];
  quotes.forEach((q, i) => {
    if (!q?.outAmount || q.routePlan?.[0]?.swapInfo?.ammKey !== pool) return;
    depth.push({ sell_usd: sizes[i], sell: a.symbol ?? a.mint, buy: b.symbol ?? b.mint, price_impact_pct: Number((Number(q.priceImpactPct) * 100).toFixed(4)), out_amount: Number(q.outAmount) / 10 ** b.decimals });
  });
  const routeVerified = depth.length > 0;
  const liquidity = a.usd + b.usd;
  const pair = `${a.symbol ?? a.mint.slice(0, 4)}/${b.symbol ?? b.mint.slice(0, 4)}`;
  const round = (n, d = 6) => Number(n.toFixed(d));
  return {
    answer: `${dex ?? "Solana"} ${pair} pool ${pool} holds ${fmtUsd(liquidity)} in reserves: ${round(a.amount, 4)} ${a.symbol ?? a.mint} (${fmtUsd(a.usd)}) and ${round(b.amount, 4)} ${b.symbol ?? b.mint} (${fmtUsd(b.usd)}), read from the pool's own token vaults at slot ${slot}.${routeVerified ? ` Jupiter routes trades through this exact pool; selling ${fmtUsd(depth.at(-1).sell_usd)} of ${a.symbol ?? "the first token"} moves the price ${depth.at(-1).price_impact_pct}%.` : ""}`,
    liquidity_usd: round(liquidity),
    pool, chain: "solana", dex, program, pair,
    reserves: sides.map((s) => ({ mint: s.mint, symbol: s.symbol, vault: s.vault, amount: s.amount, price_usd: s.price_usd, usd: round(s.usd, 2) })),
    other_holdings_usd: round(otherUsd, 2),
    route_verified: routeVerified,
    confidence: routeVerified ? "high" : "medium",
    depth,
    method: `${method}, priced by ${pricedBy}; route and depth from Jupiter quotes restricted to this DEX with direct routes only.`,
    slot, as_of: new Date().toISOString(),
    sources: ["Solana mainnet RPC getTokenAccountsByOwner", "https://lite-api.jup.ag/price/v3", "https://lite-api.jup.ag/swap/v1/quote"],
  };
}
