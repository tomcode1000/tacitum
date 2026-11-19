// Keeps only what an agent transcript needs to prove the purchase: the model, the Tacitum MCP
// server, the agent's messages and tool calls, tool progress, and the final result. Drops local
// setup (paths, installed skills and plugins, rate-limit events, account metadata).
// Usage: node scripts/sanitize-transcript.mjs <file.jsonl>   (rewrites in place)
import fs from "node:fs";

export function sanitize(text) {
  const out = [];
  for (const line of text.trim().split("\n")) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (e.type === "rate_limit_event" || (e.type === "system" && e.subtype !== "init")) continue;
    if (e.type === "system") { out.push({ type: "system", subtype: "init", model: e.model, mcp_servers: e.mcp_servers, tools: (e.tools || []).filter((t) => t.startsWith("mcp__tacitum__")) }); continue; }
    if (e.type === "result") { out.push({ type: "result", subtype: e.subtype, is_error: e.is_error, num_turns: e.num_turns, duration_ms: e.duration_ms, result: e.result }); continue; }
    if (e.type === "assistant" || e.type === "user") { out.push({ type: e.type, message: { role: e.message?.role, content: e.message?.content } }); continue; }
    if (e.type === "tool_progress") { out.push({ type: e.type, tool_name: e.tool_name, elapsed_time_seconds: e.elapsed_time_seconds }); continue; }
  }
  return out.map((o) => JSON.stringify(o)).join("\n") + "\n";
}

// Only as a command (node scripts/sanitize-transcript.mjs <file>), never when imported.
if (process.argv[2] && import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href) {
  const f = process.argv[2];
  fs.writeFileSync(f, sanitize(fs.readFileSync(f, "utf8")));
  console.log(`sanitized ${f}`);
}
