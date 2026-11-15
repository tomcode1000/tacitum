#!/usr/bin/env node
// Tacitum MCP server: lets an agent buy Telegraph answers privately, as tools.
//
//   claude mcp add tacitum -e TACITUM_FUNDER_KEY=0x... -- npx -y tacitum-mcp
//
// TACITUM_FUNDER_KEY is a Sepolia key holding test USDC and a little ETH. It only funds one-time
// payers; it never pays a miner itself. Optional: TACITUM_HOME (state dir), RPC_URL, TELEGRAPH_NODE.
// TACITUM_RELAYER_KEY switches assessments to pool funding (a separate wallet that sends the
// withdraw). AUDITOR_PUBKEY seals every assessment for the auditor (P5).
import fs from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { tacitum, POOL } from "./index.js";
import { HOME } from "./config.js";
import { seal, auditRecord, fundingFor } from "./audit.js";

const key = process.env.TACITUM_FUNDER_KEY;
if (!/^0x[0-9a-fA-F]{64}$/.test(key || "")) {
  console.error("tacitum-mcp: set TACITUM_FUNDER_KEY to a Sepolia private key (test USDC + a little ETH)");
  process.exit(1);
}
const relayerKey = process.env.TACITUM_RELAYER_KEY;
const pool = /^0x[0-9a-fA-F]{64}$/.test(relayerKey || "") ? { relayer: privateKeyToAccount(relayerKey) } : null;
// stdout carries the MCP protocol, so progress goes to stderr.
const log = (m) => console.error(`tacitum: ${m}`);
const t = tacitum({ funder: privateKeyToAccount(key), pool, log });
const text = (s) => ({ content: [{ type: "text", text: s }] });

// Every agent purchase leaves the same trail as a desk run: memo, full record, sealed audit record.
async function keep(record, memo) {
  const slug = `${new Date().toISOString().slice(0, 10)}-agent-${record.real.counterparty.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const dir = path.join(HOME, "assessments");
  fs.mkdirSync(path.join(dir, "audit"), { recursive: true });
  fs.writeFileSync(path.join(dir, `${slug}.json`), JSON.stringify(record, null, 2));
  let note = "";
  if (process.env.AUDITOR_PUBKEY) {
    const funding = await fundingFor(record.real.payer, POOL);
    const env = seal(auditRecord({ run: record, desk: funding.note?.depositor || funding.funder, funding }), process.env.AUDITOR_PUBKEY);
    fs.writeFileSync(path.join(dir, "audit", `${slug}.audit.json`), JSON.stringify(env, null, 2));
    note = `\n## Audit record\n\nSealed to auditor key \`${env.auditor}\` in \`assessments/audit/${slug}.audit.json\` (sha256 \`${env.sha256.slice(0, 16)}…\`).\n`;
  }
  fs.writeFileSync(path.join(dir, `${slug}.md`), memo + note);
  return { slug, memo: memo + note };
}

const server = new McpServer({ name: "tacitum", version: "0.1.0" });

server.registerTool(
  "private_assess",
  {
    title: "Private counterparty assessment",
    description:
      "Screens a company (sanctions from two miners, company registry, regulatory filings, adverse news) through Telegraph without " +
      "revealing who was screened or who asked: the checks are bought among k-1 matched decoy companies by a one-time wallet. " +
      "Returns the assessment memo with verifiable receipts. Takes about 4-8 minutes and costs about $0.06 per party (k parties).",
    inputSchema: {
      name: z.string().describe('Company name as a person would type it, e.g. "Barclays PLC"'),
      jurisdiction: z.string().length(2).default("GB").describe("ISO country code"),
      k: z.number().int().min(2).max(8).default(4).describe("Parties in the bundle, real one included"),
    },
  },
  async ({ name, jurisdiction, k }) => {
    const { memo, record } = await tacitum({ funder: privateKeyToAccount(key), k, pool, log }).assess({ name, jurisdiction });
    const kept = await keep(record, memo);
    return text(kept.memo);
  },
);

server.registerTool(
  "private_ask",
  {
    title: "Private Telegraph question",
    description:
      "Asks any Telegraph intent from a one-time wallet, mixed with decoy questions you supply. Decoys must have the same " +
      "params shape as the real question and plausible values (e.g. other company names of similar size), or they hide nothing. " +
      "Only the real answer is returned.",
    inputSchema: {
      intent: z.string().describe("Telegraph intent id, e.g. SANCTIONS_SCREENING_MATCH_GENERAL"),
      params: z.record(z.string(), z.any()).describe("The real question's params"),
      decoys: z.array(z.record(z.string(), z.any())).min(1).max(7).describe("Decoy params, same shape as params"),
      minerId: z.number().int().optional().describe("Ask one miner directly instead of auto-routing"),
    },
  },
  async ({ intent, params, decoys, minerId }) => {
    const { answer, payer } = await t.ask(intent, params, { decoys, minerId });
    return text(JSON.stringify({ status: answer.status, result: answer.data?.result ?? answer.data, signal: answer.data?.signal_hash, payer }, null, 2));
  },
);

server.registerTool(
  "pool_deposit",
  {
    title: "Deposit into the screened pool",
    description:
      "Deposits 1 test USDC into Tacitum's screened pool on Sepolia. The deposit becomes spendable after the funder's wallet " +
      "passes Telegraph sanctions screening. Every approved deposit enlarges the set that private payers are hidden in. " +
      "The spending note is saved locally under TACITUM_HOME.",
    inputSchema: {},
  },
  async () => text(JSON.stringify(await t.deposit(), null, 2)),
);

server.registerTool(
  "pool_status",
  {
    title: "Screened pool status",
    description: "How many approved deposits the pool holds (the hiding set for pool-funded payers) and how many notes this funder holds.",
    inputSchema: {},
  },
  async () => text(JSON.stringify(await t.poolStatus(), null, 2)),
);

await server.connect(new StdioServerTransport());
