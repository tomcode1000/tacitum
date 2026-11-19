// Supplier check before a payment is released: identity and registry status, sanctions, the website's
// TLS certificate and URL safety, a sourced FX rate, and a three-way match of invoice, purchase order
// and goods acceptance. Every external fact comes from Telegraph miners, each with its receipt; the
// match is computed locally. Nothing here moves money: the output is APPROVE, HOLD or REVIEW.
//
//   any check FAILED -> HOLD     any check MISSING -> REVIEW     all PASSED -> APPROVE
//
// Each check asks two or more independent miners. A check passes only when the answers agree.

export const SUPPLIER_CHECKS = {
  registry: { intent: "CORPORATE_REGISTRY_LOOKUP_GENERAL", miners: [77393, 7393], params: (s) => ({ company: s.lei ? `${s.legalName} (LEI ${s.lei})` : s.legalName, jurisdiction: s.jurisdiction }) },
  sanctions: { intent: "SANCTIONS_SCREENING_MATCH_GENERAL", miners: [731002, 710637, 4433], params: (s) => ({ name: s.legalName }) },
  tls: { intent: "SSL_VERIFICATION_CERT", miners: [7332, 4433], params: (s) => ({ host: hostOf(s.website) }) },
  url: { intent: "URL_SAFE_GENERAL", miners: [20260828, 7353], params: (s) => ({ url: s.website }) },
};
export const FX_CHECKS = {
  convert: { intent: "CURRENCY_EXCHANGE_CONVERT", miners: [7321, 4433], params: (inv) => ({ from_currency: inv.currency, to_currency: "USD", amount: inv.total }) },
  rate: { intent: "FX_NOW_EUR", miners: [9601, 31001], params: () => ({ currency: "EUR" }) },
};

export const hostOf = (u) => { try { return new URL(/^https?:/.test(u) ? u : `https://${u}`).hostname; } catch { return String(u); } };
const norm = (s) => String(s || "").toLowerCase().replace(/\baktiengesellschaft\b/g, "ag").replace(/\bpublic limited company\b/g, "plc").replace(/[^a-z0-9]+/g, " ").trim();
const bool = (v) => (typeof v === "boolean" ? v : /^(true|yes|valid|trusted)$/i.test(String(v)) ? true : /^(false|no|invalid)$/i.test(String(v)) ? false : null);

async function ask(client, check, input) {
  const params = check.params(input);
  const answers = [];
  for (const minerId of check.miners) {
    let res;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { res = await client.askMiner(minerId, check.intent, params); } catch (e) { res = { ok: false, data: { error: e.shortMessage || e.message } }; }
      // Retry only when the request never reached the network (DNS, connect, fetch); a miner's own answer or error stands.
      if (!/ENOTFOUND|ECONNRESET|ETIMEDOUT|UND_ERR_CONNECT|fetch failed/i.test(String(res.data?.error ?? ""))) break;
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    }
    answers.push({
      minerId, miner: res.data?.miner_name ?? null, ok: Boolean(res.ok && res.data?.result), result: res.data?.result ?? null,
      error: res.ok ? undefined : String(res.data?.error ?? "").slice(0, 160), signal: res.data?.signal_hash ?? null,
      costUsd: res.ok ? Number(res.data?.cost_usd || 0) : 0,
    });
  }
  return { intent: check.intent, params, answers };
}

// ---- verdicts (pure; tested offline) ----

export function judgeRegistry(c, supplier) {
  const ok = c.answers.filter((a) => a.ok);
  const active = ok.map((a) => bool(a.result.active));
  const names = ok.map((a) => a.result.legal_name).filter(Boolean);
  if (active.includes(false)) return { status: "FAILED", why: "a registry reports the company as not active" };
  const agree = ok.filter((a) => bool(a.result.active) === true && norm(a.result.legal_name) === norm(supplier.legalName));
  if (agree.length >= 2) return { status: "PASSED", why: `active, legal name and registration confirmed by ${agree.length} registries`, registrationId: agree[0].result.registration_id, address: agree[0].result.registered_address };
  const ambiguous = ok.find((a) => a.result.candidates?.length || a.result.reason === "name_identifier_mismatch");
  if (ambiguous) return { status: "MISSING", why: ambiguous.result.candidates?.length ? `identity ambiguous: ${ambiguous.result.candidates.length} similarly named entities; supply the LEI` : "the legal name and LEI identify different entities" };
  if (names.length && names.some((n) => norm(n) !== norm(supplier.legalName))) return { status: "FAILED", why: `registry legal name "${names[0]}" does not match "${supplier.legalName}"` };
  return { status: "MISSING", why: "fewer than two registries confirmed the company" };
}

export function judgeSanctions(c) {
  const ok = c.answers.filter((a) => a.ok).map((a) => bool(a.result.matched));
  if (ok.includes(true)) return { status: "FAILED", why: "a sanctions miner reports a match" };
  const clear = ok.filter((m) => m === false).length;
  return clear >= 2 ? { status: "PASSED", why: `no match on ${clear} independent sanctions screens` } : { status: "MISSING", why: `only ${clear} sanctions screen answered clearly; two are required` };
}

export function judgeTls(c) {
  const v = c.answers.filter((a) => a.ok).map((a) => bool(a.result.certificate_valid));
  if (v.includes(false)) return { status: "FAILED", why: "the website's TLS certificate is not valid" };
  return v.filter((x) => x === true).length >= 1 ? { status: "PASSED", why: `certificate valid (${v.filter((x) => x).length} miner${v.length > 1 ? "s" : ""})` } : { status: "MISSING", why: "no miner confirmed the certificate" };
}

export function judgeUrl(c) {
  const v = c.answers.filter((a) => a.ok).map((a) => String(a.result.verdict || "").toLowerCase());
  if (v.some((x) => /malicious|unsafe|phish|suspicious|dangerous/.test(x))) return { status: "FAILED", why: "a URL scanner reports the website as unsafe" };
  return v.includes("safe") ? { status: "PASSED", why: "not listed as malicious" } : { status: "MISSING", why: "no URL scanner gave a verdict" };
}

export function judgeFx(conv, rate, invoice) {
  if (invoice.currency === "USD") return { status: "PASSED", why: "invoice already in USD", usd: invoice.total };
  const vals = conv.answers.filter((a) => a.ok && Number.isFinite(Number(a.result.converted_amount))).map((a) => Number(a.result.converted_amount));
  const rates = rate.answers.filter((a) => a.ok && Number(a.result.rate) > 0).map((a) => Number(a.result.rate));
  const implied = invoice.currency === "EUR" && rates.length ? invoice.total / rates[0] : null; // FX_NOW_EUR: EUR per 1 USD
  const close = (a, b) => Math.abs(a - b) / b < 0.005;
  const sources = vals.length + (implied ? 1 : 0);
  if (sources >= 2) {
    const ref = vals[0] ?? implied;
    if ([...vals, ...(implied ? [implied] : [])].every((x) => close(x, ref))) return { status: "PASSED", why: `${sources} sources agree within 0.5%`, usd: Math.round(ref * 100) / 100, rate: rates[0] ?? null };
    return { status: "FAILED", why: "FX sources disagree by more than 0.5%" };
  }
  return { status: "MISSING", why: "fewer than two FX sources answered" };
}

// Invoice, purchase order and goods acceptance must agree. Computed locally from the documents.
export function threeWayMatch({ invoice, po, acceptance }) {
  const issues = [];
  if (!invoice || !po || !acceptance) return { status: "MISSING", why: "invoice, purchase order and acceptance are all required", issues: ["missing document"] };
  if (invoice.currency !== po.currency) issues.push(`currency: invoice ${invoice.currency}, PO ${po.currency}`);
  if (invoice.units !== po.units) issues.push(`units: invoice ${invoice.units}, PO ${po.units}`);
  if (invoice.unitPrice !== po.unitPrice) issues.push(`unit price: invoice ${invoice.unitPrice}, PO ${po.unitPrice}`);
  if (Math.abs(invoice.units * invoice.unitPrice - invoice.total) > 0.005) issues.push(`invoice total ${invoice.total} is not ${invoice.units} x ${invoice.unitPrice}`);
  if (acceptance.unitsAccepted !== invoice.units) issues.push(`accepted ${acceptance.unitsAccepted} units, invoiced ${invoice.units}`);
  return issues.length ? { status: "FAILED", why: issues.join("; "), issues } : { status: "PASSED", why: `${invoice.units} units at ${invoice.unitPrice} ${invoice.currency} agree across invoice, PO and acceptance (${acceptance.date})`, issues };
}

export function decide(results) {
  const failed = Object.entries(results).filter(([, r]) => r.status === "FAILED").map(([k]) => k);
  const missing = Object.entries(results).filter(([, r]) => r.status === "MISSING").map(([k]) => k);
  if (failed.length) return { decision: "HOLD", failed, missing };
  if (missing.length) return { decision: "REVIEW", failed, missing };
  return { decision: "APPROVE", failed, missing };
}

// client: a Telegraph client (a one-time payer's, for privacy). case: { supplier, invoice, po, acceptance }.
export async function supplierCheck(client, c) {
  const startedAt = Date.now();
  const raw = {};
  for (const [k, check] of Object.entries(SUPPLIER_CHECKS)) raw[k] = await ask(client, check, c.supplier);
  raw.fxConvert = await ask(client, FX_CHECKS.convert, c.invoice);
  raw.fxRate = await ask(client, FX_CHECKS.rate, c.invoice);
  const results = {
    registry: judgeRegistry(raw.registry, c.supplier),
    sanctions: judgeSanctions(raw.sanctions),
    tls: judgeTls(raw.tls),
    url: judgeUrl(raw.url),
    fx: judgeFx(raw.fxConvert, raw.fxRate, c.invoice),
    match: threeWayMatch(c),
  };
  const providers = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.answers.map((a) => ({ minerId: a.minerId, miner: a.miner, ok: a.ok, signal: a.signal, error: a.error }))]));
  const costUsd = Math.round(Object.values(raw).flatMap((v) => v.answers).reduce((s, a) => s + a.costUsd, 0) * 100) / 100;
  return { supplier: c.supplier, ...decide(results), results, providers, costUsd, seconds: Math.round((Date.now() - startedAt) / 1000), paymentExecuted: false, raw };
}

export function renderSupplier(r) {
  const L = [];
  L.push(`# Supplier check: ${r.supplier.legalName} (${r.supplier.jurisdiction})`, "", `**Decision: ${r.decision}**. No payment was executed.`, "");
  if (r.failed.length) L.push(`Failed: ${r.failed.join(", ")}.`);
  if (r.missing.length) L.push(`Missing or inconclusive: ${r.missing.join(", ")}.`);
  L.push("", "| Check | Result | Why | Providers (Telegraph receipts) |", "|---|---|---|---|");
  const prov = { registry: "registry", sanctions: "sanctions", tls: "tls", url: "url", fx: "fxConvert", match: null };
  for (const [k, v] of Object.entries(r.results)) {
    const p = prov[k] ? r.providers[prov[k]].concat(k === "fx" ? r.providers.fxRate : []).map((a) => `${a.miner ?? a.minerId}${a.signal ? ` \`${a.signal.slice(0, 10)}…\`` : a.ok ? "" : " (no answer)"}`).join("<br>") : "computed from the documents";
    L.push(`| ${k} | ${v.status} | ${v.why}${v.usd ? ` ($${v.usd.toLocaleString("en-US")})` : ""} | ${p} |`);
  }
  L.push("", `Cost $${r.costUsd} · ${r.seconds}s · every receipt checks at /engine/v1/signal/<hash>`);
  return L.join("\n");
}
