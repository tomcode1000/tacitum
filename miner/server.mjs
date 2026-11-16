// Standalone miner server (same API as the Vercel function), for hosts with their own IP so GDELT
// is not rate-limited by shared egress. Usage: PORT=4202 node miner/server.mjs
//   GET /api/adverse?query=<company or person>   the screen (Telegraph NEWS_SEARCH_GENERAL)
//   GET /miner.yaml                              the registered miner definition
//   GET /api/health                              liveness
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { screen } from "./lib/adverse.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4202);
const cache = new Map(); // query -> { at, body }: 15 minutes, as the Vercel edge cache did
const TTL = 15 * 60 * 1000;

const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { "Content-Type": type, "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Cache-Control": "public, max-age=900" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") return send(res, 204, "");
  if (url.pathname === "/api/health") return send(res, 200, { ok: true, service: "tacitum-adverse-media", sources: ["GDELT DOC 2.0", "Google News RSS"] });
  if (url.pathname === "/miner.yaml") return send(res, 200, fs.readFileSync(path.join(dir, "public", "miner.yaml"), "utf8"), "text/yaml; charset=utf-8");
  if (url.pathname !== "/api/adverse") return send(res, 404, { error: "not found" });
  const query = (url.searchParams.get("query") || "").trim();
  const hit = cache.get(query.toLowerCase());
  if (hit && Date.now() - hit.at < TTL) return send(res, 200, hit.body);
  try {
    const body = await screen(query);
    cache.set(query.toLowerCase(), { at: Date.now(), body });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    send(res, 200, body);
  } catch (err) {
    send(res, err.status || 502, { error: err.message, status: err.status || 502 });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`tacitum-adverse-media on http://127.0.0.1:${PORT}`));
