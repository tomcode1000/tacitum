// The supplier-payment task from the Telegraph team's brief, given to the same AI agent twice:
//   with:    only Tacitum's supplier_check tool (Telegraph miners, bought by a one-time wallet)
//   without: no Telegraph, but ordinary web search and fetch, as an agent would have anyway
// Records each transcript, wall time and the agent's final answer in evidence/agent-supplier/.
// Usage: node scripts/agent-supplier.mjs <with|without> <clean|mismatch>
import "./config.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { sanitize } from "./sanitize-transcript.mjs";

const [mode = "with", variant = "clean"] = process.argv.slice(2);
const root = path.resolve(".");
const units = variant === "mismatch" ? 13 : 12;
const total = units * 700;

const request = [
  `We're onboarding Siemens AG in Germany. We have an invoice for €${total.toLocaleString("en-US")} covering ${units} units at €700 each.`,
  "Our purchase order is for 12 units at €700 each, and 12 units were accepted on November 10, 2026.",
  "Vendor master record: legal name Siemens Aktiengesellschaft, LEI W38RGI023J3WT1HWRP32, website https://www.siemens.com.",
  "Verify the company's legal identity and active registry status, screen its legal name against sanctions, check its website's TLS certificate",
  "and URL safety, and get a sourced EUR/USD rate. Show which providers supplied each result and flag any missing checks.",
  "Then: should we approve the supplier and release the payment? Only approve if the required checks actually passed and the invoice,",
  "purchase order and acceptance agree. Otherwise return HOLD or REVIEW and explain what's missing. Don't execute any payment.",
  "End with one line: DECISION: APPROVE, HOLD or REVIEW.",
].join(" ");

const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), "tacitum-supplier-"));
const cfg = path.join(cfgDir, "mcp.json");
const servers = mode === "with" ? {
  tacitum: {
    command: process.execPath,
    args: [path.join(root, "src", "mcp.js")],
    env: { TACITUM_FUNDER_KEY: process.env.PRIVATE_KEY, TACITUM_HOME: path.join(root, "data"), TACITUM_KEYS: path.join(root, "keys"), ...(process.env.LOGS_RPC_URL ? { LOGS_RPC_URL: process.env.LOGS_RPC_URL } : {}) },
  },
} : {};
fs.writeFileSync(cfg, JSON.stringify({ mcpServers: servers }));
const tools = mode === "with" ? "mcp__tacitum__supplier_check" : "WebSearch,WebFetch";

const dir = path.join("evidence", "agent-supplier");
fs.mkdirSync(dir, { recursive: true });
const out = path.join(dir, `${new Date().toISOString().slice(0, 10)}-${variant}-${mode}.jsonl`);
console.log(`${mode} Telegraph, ${variant}: ${out}`);
const t0 = Date.now();
const child = spawn("claude", ["-p", "--mcp-config", cfg, "--strict-mcp-config", "--allowedTools", tools, "--output-format", "stream-json", "--verbose"], {
  env: { ...process.env, MCP_TOOL_TIMEOUT: "1500000", PRIVATE_KEY: "", SURVEY_KEY: "" },
  shell: process.platform === "win32",
  cwd: cfgDir,
  stdio: ["pipe", "pipe", "inherit"],
});
child.stdin.end(request);
const sink = fs.createWriteStream(out);
child.stdout.on("data", (d) => sink.write(d));
child.on("close", async (code) => {
  await new Promise((r) => sink.end(r));
  fs.rmSync(cfgDir, { recursive: true, force: true });
  const text = sanitize(fs.readFileSync(out, "utf8"));
  if (process.env.PRIVATE_KEY && text.includes(process.env.PRIVATE_KEY)) { fs.rmSync(out); throw new Error("a key reached the transcript; deleted it"); }
  const events = text.trim().split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const last = events.filter((e) => e.type === "result").pop();
  const toolCalls = events.flatMap((e) => (e.type === "assistant" ? e.message?.content || [] : [])).filter((c) => c.type === "tool_use").map((c) => c.name);
  const decision = (String(last?.result || "").match(/DECISION:\s*\**\s*(APPROVE|HOLD|REVIEW)/i) || [])[1]?.toUpperCase() ?? null;
  const meta = { type: "run", mode, variant, request, seconds: Math.round((Date.now() - t0) / 1000), toolCalls, decision, exit: code };
  fs.writeFileSync(out, JSON.stringify(meta) + "\n" + text);
  fs.writeFileSync(out.replace(/\.jsonl$/, ".md"), `# ${variant}, ${mode} Telegraph\n\n${request}\n\n---\n\n${last?.result ?? "(no result)"}\n\n---\n\nwall time ${meta.seconds}s · tools ${toolCalls.join(", ") || "none"} · decision ${decision}\n`);
  console.log(JSON.stringify(meta, null, 0).slice(0, 400));
});
