# Tacitum design language (v2, 15 Nov 2026)

Tacitum is for compliance desks, funds and legal teams. The site should feel like a premium
financial product: dark, calm and confident, with the evidence one click away. v2 follows the
house style of Hypothec and Detour: photographic heroes, bold sans headlines with an accent phrase,
numbered step cards, wide layouts and separate pages instead of one long scroll.

## Principles

1. **Evidence first.** Every figure links to its proof (signal hash, transaction, run file) and
   carries its sample size. All data comes from `web/data.json`, built from committed evidence.
2. **Show what is hidden by showing it hidden.** The public view uses light redaction bars; the
   desk view reveals the target. The contrast is the product.
3. **One accent.** Brass for the accent phrase in headlines and the primary docs action. Status
   colours are reserved for verdicts and always carry a label and an icon.
4. **The landing page only introduces.** Each topic has its own page; the landing page links out.

## Pages

| Page | File | Job |
|---|---|---|
| Home | `index.html` | Hero, problem, five steps, proof stats, pool and miner, builders |
| How it works | `how-it-works.html` | The two leaks and fixes, each step's public and hidden parts, trust model, limits |
| Live run | `live-run.html` | Public feed against desk view, the receipted memo |
| Privacy | `privacy.html` | Attacker-success chart with intervals, decoy dial, method |
| Screened pool | `pool.html` | Pool stats, five steps, screening log with receipts, how to join |
| Adverse media | `miner.html` | Live search, how it screens, registration, known gap |
| Docs | `docs.html` | Install, configure, every command, library, MCP, miner, troubleshooting |

## Type

| Role | Face | Use |
|---|---|---|
| Display | Inter Tight 600/700, tracking -0.025em | Headlines, stat numbers |
| Text | Inter 400/500/600 | Body, labels, tables |
| Data | JetBrains Mono 400/500 | Hashes, addresses, code |

Eyebrows: 0.75rem, 600, tracking 0.22em, uppercase, `--text-3`.

## Colour (dark only)

| Token | Value | Use |
|---|---|---|
| `--bg` / `--bg-2` | #0A0C10 / #0F1218 | Page and alternate sections |
| `--panel` / `--panel-2` | #141821 / #1A1F2A | Cards, tables |
| `--line` / `--line-2` | #232A36 / #2E3644 | Borders |
| `--text` / `--text-2` / `--text-3` | #ECEFF4 / #AEB6C4 / #7D8796 | Text |
| `--brass` | #D9B36C | Accent phrase, docs action, active nav underline |

Verdicts (validated with the dataviz palette checker against the dark surface, all checks pass):
CLEAR #349A78 (check), REVIEW #B48F1E (dot), FLAG #D64B55 (triangle), INFO #5C86CC (i).

## Layout

- Container up to 1800px with `clamp(20px, 4.5vw, 80px)` side padding, so wide screens are used.
- Heroes are full-bleed photographs, graded in CSS (desaturated, warmed, darkened) under a
  left-to-right gradient so text stays readable; a glass product card sits on the right.
- Radius 14px on cards, 20px on glass and photo cards, pill buttons. Primary button is light,
  secondary is ghost, docs action is brass.
- Photos are free Unsplash images; credits in `web/img/CREDITS.md`.

## Charts

One series in `--text`, the last point in brass, dashed reference line for chance, 2px interval
bars, hover tooltips and a table view.

## Motion

Header turns solid on scroll; arrows nudge on hover; sections fade up once. All of it is
disabled under `prefers-reduced-motion`.
