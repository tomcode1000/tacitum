// Checks each reserve answer in depth-run.json two independent ways, before any miner is built:
//  A. Real swaps: in this pool's recent on-chain swaps, are our vaults the accounts whose balances move?
//     (a pool's vaults change on every swap; an unrelated account does not). Also finds vaults for pools
//     the first method missed.
//  B. Jupiter quotes routed through this exact pool: a trade can never pay out more than the out-side
//     reserve, and a quote for ~half the reserve should still succeed. Both bound our number.
// Run: node benchmarks/liquidity-depth/verify.mjs
import fs from "node:fs";
const DIR = "benchmarks/liquidity-depth";
const RPCS = ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function post(method, params) {
  for (let i = 1; i <= 16; i++) {
    try {
      const r = await fetch(RPCS[i % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(30000) });
      const j = await r.json();
      if (j.error) throw new Error(JSON.stringify(j.error));
      return j.result;
    } catch (e) { if (i === 10) throw e; await sleep(2500 * i); }
  }
}
async function getj(u) {
  for (let i = 1; i <= 6; i++) {
    try { const r = await fetch(u, { signal: AbortSignal.timeout(30000) }); const j = await r.json(); return j; }
    catch (e) { if (i === 6) return { error: String(e) }; await sleep(3000 * i); }
  }
}
const run = JSON.parse(fs.readFileSync(`${DIR}/depth-run.json`, "utf8")).results;
const pools = JSON.parse(fs.readFileSync(`${DIR}/failing-pools.json`, "utf8"));
const out = [];

for (const p of pools) {
  const prev = run.find((r) => r.pool === p.pool);
  // A. Vaults from real swaps: token accounts whose balance changed and whose owner is the same in most txs and isn't the signer.
  const sigs = (await post("getSignaturesForAddress", [p.pool, { limit: 25 }])).filter((s) => !s.err).slice(0, 12);
  const seen = {};
  let txs = 0;
  for (const s of sigs) {
    let tx = null;
    try { tx = await post("getTransaction", [s.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1 }]); } catch { continue; }
    await sleep(350);
    if (!tx?.meta) continue;
    txs++;
    const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey ?? k);
    const signers = new Set(tx.transaction.message.accountKeys.filter((k) => k.signer).map((k) => k.pubkey));
    const pre = Object.fromEntries((tx.meta.preTokenBalances || []).map((b) => [b.accountIndex, b]));
    for (const b of tx.meta.postTokenBalances || []) {
      const a = pre[b.accountIndex];
      if (!a || a.uiTokenAmount.amount === b.uiTokenAmount.amount) continue;
      if (signers.has(b.owner)) continue;
      const k = keys[b.accountIndex];
      const e = (seen[k] ||= { account: k, mint: b.mint, owner: b.owner, moves: 0 });
      e.moves++;
    }
  }
  // Vault candidates: moved in at least a third of the swaps.
  const vaults = Object.values(seen).filter((v) => v.moves >= Math.max(2, Math.ceil(txs / 3))).sort((a, b) => b.moves - a.moves);
  // Value them now.
  let byMint = {};
  if (vaults.length) {
    const accs = await post("getMultipleAccounts", [vaults.map((v) => v.account), { encoding: "jsonParsed" }]);
    accs.value.forEach((a, i) => { const amt = a?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0; vaults[i].amount = amt; });
    // the largest vault per mint (pools hold one vault per side)
    for (const v of vaults) if (!byMint[v.mint] || v.amount > byMint[v.mint].amount) byMint[v.mint] = v;
  }
  const sides = Object.values(byMint).sort((a, b) => b.moves - a.moves).slice(0, 2);
  const price = sides.length ? await getj(`https://lite-api.jup.ag/price/v3?ids=${sides.map((s) => s.mint).join(",")}`) : {};
  for (const s of sides) s.usd = (price[s.mint]?.usdPrice ?? 0) * s.amount;
  const swapUsd = Math.round(sides.reduce((t, s) => t + s.usd, 0));

  // B. Jupiter quotes through this exact pool, selling side 0 for side 1 at ~50% and ~150% of the out reserve.
  const quotes = [];
  if (sides.length === 2) {
    const dexLabel = p.dex;
    const [inS, outS] = [sides[0], sides[1]];
    const inPx = price[inS.mint]?.usdPrice, outPx = price[outS.mint]?.usdPrice;
    const dec = async (m) => (await post("getAccountInfo", [m, { encoding: "jsonParsed" }])).value.data.parsed.info.decimals;
    const inDec = await dec(inS.mint), outDec = await dec(outS.mint);
    for (const frac of [0.01, 0.5, 1.5]) {
      if (!inPx || !outPx) break;
      const inUi = (outS.amount * outPx * frac) / inPx;
      const amount = BigInt(Math.floor(inUi * 10 ** inDec)).toString();
      const q = await getj(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${inS.mint}&outputMint=${outS.mint}&amount=${amount}&slippageBps=100&dexes=${encodeURIComponent(dexLabel)}&onlyDirectRoutes=true`);
      await sleep(1100);
      const hop = q.routePlan?.[0]?.swapInfo;
      const outUi = q.outAmount ? Number(q.outAmount) / 10 ** outDec : null;
      quotes.push({ sizeVsOutReserve: frac, throughThisPool: hop?.ammKey === p.pool, ammKey: hop?.ammKey ?? null, outUi, outReserve: outS.amount, exceedsReserve: outUi != null && hop?.ammKey === p.pool && outUi > outS.amount * 1.001, error: q.error ?? q.errorCode ?? null });
    }
  }
  const agreeWithRun = prev?.oursUsd ? Math.abs(swapUsd - prev.oursUsd) / prev.oursUsd <= 0.02 : null;
  const throughPool = quotes.filter((q) => q.throughThisPool);
  const rec = {
    pool: p.pool, dex: p.dex, asks: p.asks, swapsRead: txs,
    vaultsFromSwaps: sides.map((s) => ({ account: s.account, mint: s.mint, owner: s.owner, movedIn: `${s.moves}/${txs}`, amount: s.amount, usd: Math.round(s.usd) })),
    reserveFromSwapsUsd: swapUsd, reserveFromFirstRunUsd: prev?.oursUsd ?? null, firstRunAgrees: agreeWithRun,
    quotes, quoteContradicts: quotes.some((q) => q.exceedsReserve), quotedThroughPool: throughPool.length,
  };
  out.push(rec);
  console.log(`${p.dex.padEnd(16)} ${p.pool.slice(0, 8)} swaps ${txs} vaults ${sides.map((s) => s.mint.slice(0, 5) + " moved " + s.moves + "/" + txs).join(", ") || "none"}  swaps-say $${swapUsd.toLocaleString()} first-run $${(prev?.oursUsd ?? 0).toLocaleString()} agree ${agreeWithRun}  quotes-through-pool ${throughPool.length}/${quotes.length} contradicts ${rec.quoteContradicts}  ${JSON.stringify(quotes.map((q) => [q.sizeVsOutReserve, q.throughThisPool ? Math.round(q.outUi) : (q.error || "other pool")]))}`);
}
fs.writeFileSync(`${DIR}/verify-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ at: new Date().toISOString(), results: out }, null, 1));
