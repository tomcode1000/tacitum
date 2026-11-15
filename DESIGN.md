# Tacitum design language

Tacitum is for compliance desks, funds and legal teams. The interface should feel like a
well-kept file: quiet, exact, and easy to audit. Nothing decorative competes with the evidence.

## Principles

1. **Evidence first.** Every claim on screen links to its proof: a signal hash, a transaction, a
   run file. Numbers carry their source and sample size (16 runs, 95% interval).
2. **Show what is hidden by showing it hidden.** The public view uses redaction bars for what an
   observer cannot learn. The desk view removes them. The contrast is the product.
3. **One accent.** Ink on paper, one seal colour for the brand mark and primary action. Status
   colours are reserved for verdicts and never used for decoration.
4. **Plain words.** Labels say what a desk would say ("Sanctions", "Funded by"), not protocol terms.
   Hashes and addresses are shown short, in monospace, with the full value one click away.

## Type

| Role | Face | Use |
|---|---|---|
| Display | Newsreader (serif), 500 | Page and section headlines, hero numbers |
| Text | IBM Plex Sans, 400/500/600 | Body, labels, tables |
| Data | IBM Plex Mono, 400/500 | Hashes, addresses, amounts in tables, code |

Scale (rem): 0.75 · 0.8125 · 0.875 · 1 · 1.125 · 1.375 · 1.75 · 2.5 · 3.5. Body 1rem / 1.6.
Labels: 0.75rem, 600, letter-spacing 0.08em, uppercase. Numbers use tabular figures.

## Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | #F7F5F0 | #111317 | Page background |
| `--sheet` | #FFFFFF | #181B20 | Cards, documents |
| `--ink` | #16181D | #ECEAE4 | Primary text |
| `--ink-2` | #4A4E57 | #B7B4AC | Secondary text |
| `--ink-3` | #7A7E86 | #8A8780 | Muted text, axis labels |
| `--rule` | #E3DFD6 | #2A2E35 | Hairlines, borders |
| `--seal` | #6E2B2B | #C77B6F | Brand mark, primary action, links on hover |
| `--redact` | #16181D | #ECEAE4 | Redaction bars in the public view |

Verdicts (validated with the dataviz palette checker, light and dark, all checks pass; always
shown with a text label and an icon, never colour alone):

| Verdict | Light | Dark | Icon |
|---|---|---|---|
| CLEAR | #2A7D52 | #349A78 | check |
| REVIEW | #B07800 | #B48F1E | dot |
| FLAG | #B8322A | #D64B55 | triangle |
| INFO | #3A64AE | #5C86CC | i |

## Layout and form

- Content width 1120px, 24px gutters on desktop, 16px on phones; no horizontal scroll.
- Radius 6px on cards, 4px on controls and chips. Borders are 1px `--rule`; no drop shadows
  except a 1px hairline under the sticky header.
- Spacing steps: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 72 · 96px.
- Documents (memos) sit on `--sheet` with a 3px `--seal` rule at the top, like a filed form.

## Charts

One series per chart, drawn in `--ink`, with a dashed `--ink-3` reference line for chance.
Interval bars 2px, points 8px, hover shows value, interval and runs. Recessive axes, no grid
fill. Every chart has a table view.

## Motion

Only to explain state: redaction bars wipe away (240ms ease-out) when switching to the desk view.
Respect `prefers-reduced-motion`.
