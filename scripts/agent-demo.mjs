// An AI agent buys a private assessment on its own (milestone: autonomous Telegraph purchase).
// Starts Claude Code headless with only the Tacitum MCP tools and a compliance task, and records
// the agent's full transcript in evidence/. Usage: node scripts/agent-demo.mjs ["<company>"]
//
// Keys go only into a temporary MCP config (deleted afterwards); the transcript never sees them.
// The agent's purchase is funded from the screened pool (TACITUM_RELAYER_KEY) and sealed for the
// auditor (AUDITOR_PUBKEY), exactly like a desk run.
import "./config.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { sanitize } from "./sanitize-transcript.mjs";

const company = process.argv[2] || "Tesco PLC";
const root = path.resolve(".");
const relayer = JSON.parse(fs.readFileSync("keys/relayer.json", "utf8"));
for (const k of ["PRIVATE_KEY", "AUDITOR_PUBKEY"]) if (!process.env[k]) throw new Error(`${k} missing in .env`);

const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), "tacitum-agent-"));
const cfg = path.join(cfgDir, "mcp.json");
fs.writeFileSync(cfg, JSON.stringify({
  mcpServers: {
    tacitum: {
      command: process.execPath,
      args: [path.join(root, "src", "mcp.js")],
      env: {
        TACITUM_FUNDER_KEY: process.env.PRIVATE_KEY,
        TACITUM_RELAYER_KEY: relayer.key,
        TACITUM_HOME: path.join(root, "data"),
        TACITUM_KEYS: path.join(root, "keys"),
        AUDITOR_PUBKEY: process.env.AUDITOR_PUBKEY,
        ...(process.env.LOGS_RPC_URL ? { LOGS_RPC_URL: process.env.LOGS_RPC_URL } : {}),
      },
    },
  },
}));

const task = [
  `You are the onboarding agent at an investment fund. Before the fund signs a supply agreement with ${company} (United Kingdom),`,
  "run a counterparty assessment through Telegraph. The market must not learn which company the fund is checking or that the fund is checking at all,",
  "so use the tacitum private_assess tool (jurisdiction GB, 4 parties). Then report: the overall verdict, each check's verdict,",
  "how many receipts were verified, and whether the payment was funded from the screened pool. Do not run more than one assessment.",
].join(" ");

const stamp = new Date().toISOString().slice(0, 10);
const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const out = path.join("evidence", `agent-run-${stamp}-${slug}.jsonl`);
console.log(`agent task: ${task}\ntranscript: ${out}`);

// The task goes in on stdin: on Windows the shell would split a quoted argument at its spaces.
const child = spawn("claude", ["-p", "--mcp-config", cfg, "--strict-mcp-config", "--allowedTools", "mcp__tacitum__private_assess,mcp__tacitum__pool_status", "--output-format", "stream-json", "--verbose"], {
  env: { ...process.env, MCP_TOOL_TIMEOUT: "1500000", PRIVATE_KEY: "", SURVEY_KEY: "" },
  shell: process.platform === "win32",
  cwd: cfgDir, // an empty folder: the agent sees only the Tacitum tools, not this repo
  stdio: ["pipe", "pipe", "inherit"],
});
child.stdin.end(task);
const sink = fs.createWriteStream(out);
child.stdout.on("data", (d) => { sink.write(d); process.stdout.write("."); });
child.on("close", async (code) => {
  await new Promise((r) => sink.end(r)); // flush before reading it back
  fs.rmSync(cfgDir, { recursive: true, force: true });
  // Public evidence: keep the purchase, drop local setup; then make sure no key got through.
  const text = sanitize(fs.readFileSync(out, "utf8"));
  fs.writeFileSync(out, JSON.stringify({ type: "task", company, task }) + "\n" + text);
  for (const secret of [process.env.PRIVATE_KEY, relayer.key]) if (secret && text.includes(secret)) { fs.rmSync(out); throw new Error("a key reached the transcript; deleted it"); }
  const last = text.trim().split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).filter((e) => e.type === "result").pop();
  console.log(`\nagent exited ${code}; result:\n${last?.result ?? "(none)"}`);
});
