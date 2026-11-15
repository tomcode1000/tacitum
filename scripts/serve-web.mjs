// Serves web/ (the demo) on PORT (default 8080). No dependencies; used locally and on the host.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("web");
const PORT = Number(process.env.PORT || 8080);
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".css": "text/css", ".js": "text/javascript" };

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = path.join(ROOT, url === "/" ? "index.html" : url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Tacitum demo on http://localhost:${PORT}`));
