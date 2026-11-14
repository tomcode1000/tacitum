// Renders an assessment as the memo a desk would file: verdict per check,
// the sources behind it, the cost line, and the receipts.
const short = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "-");

function evidence(name, check) {
  const lines = [];
  for (const a of check.answers) {
    if (!a.ok) {
      lines.push(`- ${a.miner || a.minerId}: no answer (${a.status}${a.error ? `, ${String(a.error).slice(0, 80)}` : ""})`);
      continue;
    }
    const r = a.result;
    const what = {
      sanctions: () => `matched = ${r.matched}${r.lists ? `, lists: ${[].concat(r.lists).slice(0, 4).join(", ")}` : ""}`,
      registry: () => `${r.legal_name ?? "?"} · id ${r.registration_id ?? "?"} · active = ${r.active}`,
      filings: () => `${r.filing_count} filings in the last 12 months`,
      news: () => `${r.brief || r.answer || "-"} (${r.result_count ?? "?"} sources)`,
    }[name]();
    lines.push(`- ${a.miner || a.minerId}: ${what} · $${a.costUsd} · signal \`${short(a.signal)}\``);
  }
  return lines.join("\n");
}

export function renderMemo(a) {
  const v = a.verdicts;
  const verified = a.verification.filter((r) => r.found && r.payerMatches && r.txMatches).length;
  return `# Counterparty assessment: ${a.counterparty.name}

**Overall: ${a.overall}** · jurisdiction ${a.counterparty.jurisdiction} · ${a.finishedAt}

| Check | Verdict |
|---|---|
| Sanctions (two independent miners) | ${v.sanctions} |
| Company registry | ${v.registry} |
| Regulatory filings | ${v.filings} |
| Adverse news | ${v.news} |

**Cost:** $${a.costUsd} across ${a.paidCalls} paid Telegraph calls, paid by \`${a.payer}\`.
**Receipts:** ${verified} of ${a.verification.length} re-verified against the public signal record (payer and settlement tx match).

## Evidence

### Sanctions
${evidence("sanctions", a.checks.sanctions)}

### Company registry
${evidence("registry", a.checks.registry)}

### Regulatory filings
${evidence("filings", a.checks.filings)}

### Adverse news
${evidence("news", a.checks.news)}

${a.privacy ? privacySection(a) : openSection(a)}`;
}

function openSection(a) {
  return `## What the public feed shows about this assessment

Every question above is published with the paying wallet. Anyone watching saw:

${a.verification.map((r) => `- \`${r.publicQuestion ?? "?"}\``).join("\n")}

This is the leak Tacitum's private mode removes.
`;
}

function privacySection(a) {
  const p = a.privacy;
  const m = p.measured;
  const best = m ? `${m.best} (95% interval ${m.ci.join("–")}, ${m.runs} runs)` : "not measured";
  const pooled = p.viaPool;
  const set = p.anonymitySet ?? "all the";
  const funding = pooled
    ? `the Tacitum screened pool \`${p.funder}\` paid $${p.fundedUsd} into the payer's escrow through a zero-knowledge withdraw, tx \`${short(p.fundingTx)}\`. The desk's deposit is one of ${set} approved deposits, each screened through Telegraph sanctions before it could be spent`
    : `\`${p.funder}\` deposited $${p.fundedUsd} into the payer's escrow, tx \`${short(p.fundingTx)}\``;
  const gap = pooled
    ? `**Funding:** the payer was funded by the pool, not by the desk. Anyone can see which wallets deposited, but not which deposit paid for this assessment: it is one of ${set} approved deposits, so that set size is the number to watch. On testnet the other depositors are seeded by us.`
    : `**Not hidden in v0:** the funding deposit is on chain, so anyone who checks who funded the payer finds the desk's wallet. They still cannot tell which of the ${p.k} counterparties it cared about. The screened deposit pool (P4) removes that link.`;
  return `## Private mode (${pooled ? "screened pool" : "v0"})

| | |
|---|---|
| Payer | one-time wallet \`${a.payer}\`, used for this assessment only |
| Cover | ${p.k} complete assessments bought together, checks shuffled and spaced with random gaps |
| Total paid | $${p.costUsd} for all ${p.k} (this memo's share $${a.costUsd}) |
| Observer picking the real one | blind guess ${(1 / p.k).toFixed(2)}; best measured attacker ${best} |
| Funding | ${funding} |

The feed shows ${p.k} counterparties assessed by a new wallet, in no particular order: ${p.parties.map((n) => `\`${n}\``).join(", ")}. Nothing in the questions marks which one the desk wanted.

${gap}

Decoy results stay in the local run record and are not part of this memo.
`;
}
