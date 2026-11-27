// Builds depth-miner/data/vaults.seed.json: the token accounts each known pool owns, found once with
// the rate-limited indexed lookup, slowly. Afterwards the miner re-reads them by address (any RPC).
// Run: node depth-miner/seed-vaults.mjs [pool ...]   (default: every pool in the two benchmark sets)
import fs from "node:fs";
import { makeDeps, vaultStore, VAULT_LAYOUTS } from "./lib/depth.js";

const SEED = "depth-miner/data/vaults.seed.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")).cases.map((c) => c.pool) : []);
const pools = process.argv.slice(2).length ? process.argv.slice(2) : [...new Set([...read("benchmarks/liquidity-depth/cases.json"), ...read("benchmarks/liquidity-depth/wide-cases.json")])];
const store = vaultStore(SEED);
const deps = makeDeps(globalThis.fetch, store);
let added = 0;
for (const pool of pools) {
  if (store.get(pool)) continue;
  try {
    const info = await deps.rpc("getAccountInfo", [pool, { encoding: "base64", dataSlice: { offset: 0, length: 0 } }]);
    if (!info?.value || VAULT_LAYOUTS[info.value.owner]) continue; // layout pools need no seed
    const vaults = [];
    for (const programId of ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"]) {
      const r = await deps.rpc("getTokenAccountsByOwner", [pool, { programId }, { encoding: "jsonParsed" }]);
      vaults.push(...(r?.value ?? []).map((a) => a.pubkey));
      await sleep(2500);
    }
    if (vaults.length) { store.set(pool, vaults); added++; }
    console.log(pool.slice(0, 8), vaults.length, "vaults");
  } catch (e) { console.log(pool.slice(0, 8), "skip:", e.code || e.message); }
  await sleep(2500);
}
console.log(`seeded ${added} new pools; ${Object.keys(store.all()).length} in ${SEED}`);
