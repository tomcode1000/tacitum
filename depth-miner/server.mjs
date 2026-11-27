// Solana pool liquidity miner. Usage: PORT=4203 node depth-miner/server.mjs
//   GET /api/depth?pool=<address>&chain=solana   Telegraph LIQUIDITY_DEPTH_VERIFY_GENERAL
//   GET /miner.yaml                              the registered miner definition
//   GET /api/health                              liveness
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { poolLiquidity, makeDeps } from "./lib/depth.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4203);
process.env.DEPTH_VAULTS_SEED ||= path.join(dir, "data", "vaults.seed.json");
process.env.DEPTH_VAULTS_FILE ||= path.join(dir, "data", "vaults.local.json");
const deps = makeDeps();
const cache = new Map(); // pool -> { at, status, body }: reserves move, so 60 s only
const TTL = 60 * 1000;

const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { "Content-Type": type, "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Cache-Control": "public, max-age=60" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};
const readBody = (req) => new Promise((ok) => { let s = ""; req.on("data", (d) => (s += d)); req.on("end", () => { try { ok(JSON.parse(s || "{}")); } catch { ok({}); } }); });

export async function handle(input) {
  try { return { status: 200, body: await poolLiquidity(input, deps) }; }
  catch (err) { return { status: err.status || 502, body: { error: err.message, code: err.code || "upstream_error", status: err.status || 502, ...(err.extra || {}) } }; }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") return send(res, 204, "");
  if (url.pathname === "/api/health") return send(res, 200, { ok: true, service: "tacitum-pool-depth", sources: ["Solana mainnet RPC", "Jupiter Price API v3", "Jupiter Quote API"] });
  if (url.pathname === "/miner.yaml") return send(res, 200, fs.readFileSync(path.join(dir, "public", "miner.yaml"), "utf8"), "text/yaml; charset=utf-8");
  if (url.pathname !== "/api/depth") return send(res, 404, { error: "not found" });
  const body = req.method === "POST" ? await readBody(req) : {};
  const input = { pool: url.searchParams.get("pool") ?? body.pool, chain: url.searchParams.get("chain") ?? body.chain };
  const key = `${input.chain}|${input.pool}`.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return send(res, hit.status, hit.body);
  const out = await handle(input);
  if (out.status === 200 || out.status === 422 || out.status === 404) cache.set(key, { at: Date.now(), ...out });
  if (cache.size > 1000) cache.delete(cache.keys().next().value);
  send(res, out.status, out.body);
}).listen(PORT, "127.0.0.1", () => console.log(`tacitum-pool-depth on http://127.0.0.1:${PORT}`));
