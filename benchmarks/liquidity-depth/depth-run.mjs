// For each failing pool: find its token vaults on chain, value them, and compare to independent indexers.
import fs from "node:fs";
const SP = "benchmarks/liquidity-depth/"; // run from the repo root: node benchmarks/liquidity-depth/depth-run.mjs
const RPC = "https://api.mainnet-beta.solana.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function post(method, params) {
  for (let i = 1; i <= 10; i++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(30000) });
      const j = await r.json();
      if (j.error) throw new Error(JSON.stringify(j.error));
      return j.result;
    } catch (e) { if (i === 10) throw e; await sleep(2000 * i); }
  }
}
async function getj(u) {
  for (let i = 1; i <= 6; i++) {
    try { const r = await fetch(u, { signal: AbortSignal.timeout(30000) }); if (r.status === 404) return { notFound: true }; if (!r.ok) throw new Error(r.status); return await r.json(); }
    catch (e) { if (i === 6) return { error: String(e) }; await sleep(3000 * i); }
  }
}
const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58(buf) {
  let x = BigInt("0x" + (Buffer.from(buf).toString("hex") || "0")), s = "";
  while (x > 0n) { s = A[Number(x % 58n)] + s; x /= 58n; }
  for (const b of buf) { if (b === 0) s = "1" + s; else break; }
  return s;
}
const pools = JSON.parse(fs.readFileSync(SP + "failing-pools.json", "utf8"));
const out = [];
for (const p of pools) {
  const info = await post("getAccountInfo", [p.pool, { encoding: "base64" }]);
  const data = Buffer.from(info.value.data[0], "base64");
  const vaults = [];
  for (const prog of ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"]) {
    const r = await post("getTokenAccountsByOwner", [p.pool, { programId: prog }, { encoding: "jsonParsed" }]);
    for (const a of r.value) vaults.push({ addr: a.pubkey, how: "owned-by-pool", ...a.account.data.parsed.info });
  }
  if (!vaults.some((v) => Number(v.tokenAmount.uiAmount) > 0)) {
    const cands = new Set();
    for (let o = 0; o + 32 <= Math.min(data.length, 1536); o++) cands.add(b58(data.subarray(o, o + 32)));
    const list = [...cands];
    for (let i = 0; i < list.length; i += 100) {
      const r = await post("getMultipleAccounts", [list.slice(i, i + 100), { encoding: "jsonParsed" }]);
      r.value.forEach((v, k) => { if (v?.data?.parsed?.type === "account") vaults.push({ addr: list[i + k], how: "referenced-in-pool", ...v.data.parsed.info }); });
      await sleep(400);
    }
  }
  const live = vaults.filter((v) => Number(v.tokenAmount.uiAmount) > 0);
  const ids = [...new Set(live.map((v) => v.mint))];
  const price = ids.length ? await getj(`https://lite-api.jup.ag/price/v3?ids=${ids.join(",")}`) : {};
  const valued = live.map((v) => ({ mint: v.mint, amount: v.tokenAmount.uiAmount, usd: (price[v.mint]?.usdPrice ?? 0) * v.tokenAmount.uiAmount, priced: price[v.mint] != null, how: v.how }));
  const top2 = valued.filter((v) => v.priced).sort((a, b) => b.usd - a.usd).slice(0, 2);
  const ours = top2.reduce((s, v) => s + v.usd, 0);
  const gt = await getj(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${p.pool}`); await sleep(2200);
  const ds = await getj(`https://api.dexscreener.com/latest/dex/pairs/solana/${p.pool}`);
  const gtUsd = gt?.data?.attributes?.reserve_in_usd ? Number(gt.data.attributes.reserve_in_usd) : null;
  const dsUsd = ds?.pairs?.[0]?.liquidity?.usd ?? ds?.pair?.liquidity?.usd ?? null;
  const rec = { pool: p.pool, dex: p.dex, asks: p.asks, vaultsFound: live.length, top2: top2.map((v) => ({ mint: v.mint.slice(0, 6), amount: Math.round(v.amount), usd: Math.round(v.usd), how: v.how })), oursUsd: Math.round(ours), geckoterminalUsd: gtUsd && Math.round(gtUsd), dexscreenerUsd: dsUsd && Math.round(dsUsd) };
  out.push(rec);
  console.log(`${p.dex.padEnd(16)} ${p.pool.slice(0, 8)} asks ${String(p.asks).padStart(3)} vaults ${rec.vaultsFound} ours $${rec.oursUsd.toLocaleString()}  gecko ${rec.geckoterminalUsd ?? "-"}  dexscreener ${rec.dexscreenerUsd ?? "-"}  ${JSON.stringify(rec.top2)}`);
  await sleep(800);
}
fs.writeFileSync(SP + "depth-run.json", JSON.stringify({ at: new Date().toISOString(), results: out }, null, 1));
