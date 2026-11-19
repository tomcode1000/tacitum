// Probes candidate miners for the supplier checks (registry, TLS, URL safety, FX) with known inputs,
// so the workflow uses miners that actually answer. Writes data/supplier-probe.json.
// Usage: node scripts/probe-supplier.mjs
import "./config.mjs";
import fs from "node:fs";
import { loadAccount } from "./config.mjs";
import { createClient } from "../src/telegraph.js";

const client = createClient(loadAccount());
const PLAN = [
  ["CORPORATE_REGISTRY_LOOKUP_GENERAL", { company: "Siemens AG", jurisdiction: "DE" }, [77393, 5186, 7393, 98002, 4433]],
  ["SSL_VERIFICATION_CERT", { host: "siemens.com" }, [7332, 45010, 45002, 4433]],
  ["SSL_VERIFICATION_CERT", { host: "expired.badssl.com" }, [7332, 45010, 45002]],
  ["URL_SAFE_GENERAL", { url: "https://www.siemens.com" }, [7353, 52005, 20260828]],
  ["FX_NOW_EUR", { currency: "USD" }, [9601, 31001, 7310043, 9002]],
];
const out = [];
for (const [intent, params, miners] of PLAN) {
  for (const m of miners) {
    const t0 = Date.now();
    let res;
    try { res = await client.askMiner(m, intent, params); } catch (e) { res = { ok: false, data: { error: e.message } }; }
    const row = { intent, params, miner: m, slug: res.data?.miner_name ?? res.data?.miner_slug, ok: Boolean(res.ok && res.data?.result), ms: Date.now() - t0, result: res.data?.result ?? null, error: res.ok ? undefined : String(res.data?.error ?? "").slice(0, 160), signal: res.data?.signal_hash ?? null };
    out.push(row);
    console.log(`${intent.padEnd(34)} ${String(m).padEnd(9)} ${row.ok ? "ok " : "ERR"} ${row.ms}ms ${JSON.stringify(row.result ?? row.error).slice(0, 150)}`);
  }
}
fs.writeFileSync("data/supplier-probe.json", JSON.stringify({ at: new Date().toISOString(), rows: out }, null, 2));
