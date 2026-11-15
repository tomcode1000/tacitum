// Audit records (P5). Usage:
//   node scripts/audit.mjs keygen                      create an auditor key pair (keys/auditor.json) and set AUDITOR_PUBKEY
//   node scripts/audit.mjs seal assessments/<x>.json    seal a saved assessment for the auditor
//   node scripts/audit.mjs open assessments/audit/<x>.audit.json [--key keys/auditor.json] [--verify]
// .env first: src/config.js reads TACITUM_KEYS when it is first imported.
import "./config.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditorKeygen, fingerprint, seal, open, auditRecord, fundingFor, verifyRecord } from "../src/audit.js";

export async function sealAssessment(runFile, auditorPub) {
  const run = JSON.parse(fs.readFileSync(runFile, "utf8"));
  const pool = fs.existsSync("data/pool.json") ? JSON.parse(fs.readFileSync("data/pool.json", "utf8")) : null;
  const funding = await fundingFor(run.real.payer, pool);
  const desk = funding.note?.depositor || funding.funder || null;
  const env = seal(auditRecord({ run, desk, funding }), auditorPub);
  const out = path.join("assessments", "audit", path.basename(runFile).replace(/\.json$/, ".audit.json"));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(env, null, 2));
  return { out, env, viaPool: funding.viaPool, hasNote: Boolean(funding.note) };
}

const main = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const [cmd, file] = process.argv.slice(2);
const flag = (f) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : undefined; };

if (main && cmd === "keygen") {
  if (fs.existsSync("keys/auditor.json")) throw new Error("keys/auditor.json exists; move it away first");
  const k = auditorKeygen();
  fs.mkdirSync("keys", { recursive: true });
  fs.writeFileSync("keys/auditor.json", JSON.stringify({ ...k, fingerprint: fingerprint(k.publicKey), createdAt: new Date().toISOString() }, null, 2));
  let env = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
  env = /^AUDITOR_PUBKEY=/m.test(env)
    ? env.replace(/^AUDITOR_PUBKEY=.*$/m, `AUDITOR_PUBKEY=${k.publicKey}`)
    : `${env.trimEnd()}\n# Audit records are sealed to this key; the private half (keys/auditor.json) goes to the auditor.\nAUDITOR_PUBKEY=${k.publicKey}\n`;
  fs.writeFileSync(".env", env);
  console.log(`auditor key ${fingerprint(k.publicKey)} written to keys/auditor.json; AUDITOR_PUBKEY set in .env`);
} else if (main && cmd === "seal" && file) {
  const pub = process.env.AUDITOR_PUBKEY;
  if (!pub) throw new Error("AUDITOR_PUBKEY not set: run `node scripts/audit.mjs keygen` first");
  const r = await sealAssessment(file, pub);
  console.log(`sealed ${file} -> ${r.out} for auditor ${r.env.auditor} (sha256 ${r.env.sha256.slice(0, 16)}…, pool-funded ${r.viaPool}, note ${r.hasNote})`);
} else if (main && cmd === "open" && file) {
  const keys = JSON.parse(fs.readFileSync(flag("--key") || "keys/auditor.json", "utf8"));
  const rec = open(JSON.parse(fs.readFileSync(file, "utf8")), keys.privateKey, keys.publicKey);
  console.log(`Audit record: ${rec.counterparty.name} (${rec.counterparty.jurisdiction}) · ${rec.overall} · ${rec.finishedAt}`);
  console.log(`  desk wallet   ${rec.desk}`);
  console.log(`  real target   ${rec.real}   decoys: ${rec.parties.filter((p) => p !== rec.real).join(", ")}`);
  console.log(`  payer         ${rec.payer}   cost $${rec.costUsd}`);
  console.log(`  funding       ${rec.funding.viaPool ? `screened pool ${rec.funding.pool}, withdraw ${rec.funding.withdrawTx}` : `direct from ${rec.funding.funder}`}`);
  console.log(`  verdicts      ${Object.entries(rec.verdicts).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  if (process.argv.includes("--verify")) {
    const v = await verifyRecord(rec, { waitMs: 30_000 });
    for (const l of v.lines) console.log(`  ${l.pass ? "✓" : "✗"} ${l.what}`);
    console.log(v.pass ? `\nVERIFIED: every claim in the record checks out against public data (${v.lines.length} checks).` : "\nNOT VERIFIED: see the ✗ lines.");
    const { shutdown } = await import("../src/pool.js");
    await shutdown();
  }
} else if (main) {
  console.error("usage: node scripts/audit.mjs keygen | seal <assessment.json> | open <audit.json> [--key file] [--verify]");
  process.exit(1);
}
