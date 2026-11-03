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

## What the public feed shows about this assessment

Every question above is published with the paying wallet. Anyone watching saw:

${a.verification.map((r) => `- \`${r.publicQuestion ?? "?"}\``).join("\n")}

This is the leak Tacitum's private mode removes.
`;
}
