# 366 — per-engine render parity across IR / WYSIWYG / Preview

**Status: 🚧 IN PROGRESS — IR ⇄ Preview done for every reusable engine; WYSIWYG still untouched.**

## Done (IR ⇄ Preview)

`test/vscode-e2e/mode-switch-render-reuse.spec.ts` now asserts byte-identity across BOTH engine
families — custom (d2, wavedrom, nomnoml, vega-lite, task 365) and native (mermaid, abc, flowchart,
plantuml). The natives were pulled into the same reuse map after the probe below showed they diverged
the same way d2 had.

### Native probe, all-renderers fixture, `theme.content: auto`

| engine | before | after |
|---|---|---|
| **abc** | 451.99×98.83 → **420.02×87.83** | identical |
| mermaid | ids only | identical (incl. generated ids — proof of reuse) |
| flowchart | inline `top: -0.453125px` in Preview only | identical |
| plantuml | identical | identical |
| **graphviz** | its own SVG comments rewritten into `<div class="vmarkd-comment">` | **fixed** (see below) |
| markmap | per-instance class `mm-…-1` vs `-2` | unchanged — cosmetic, live d3 instance |
| **smiles** | computed colour `rgb(209,213,218)` → `rgb(215,186,125)` | **unchanged — still open** |
| echarts, mindmap | identical (canvas) | identical |

Reuse mechanism for natives: the full Preview pane has no editable marker sibling to hash from, but
an un-rendered target still holds its own fence source as `textContent`. The local map key is
trimmed so that matches the marker source the IR render was stored under.

**graphviz is deliberately excluded from reuse** — its Vditor renderer calls `Viz.instance()` even on
a reserved block, and that double-invoke hangs the webview (task 184). It renders fresh per pane, so
it is compared rather than guaranteed. Comparing it found a real defect: `revealPreviewComments`
walked into the rendered SVG and rewrote the DOT source's own comments (`<!-- A -->` per node) into
`<div class="vmarkd-comment">` — invalid inside an `<svg>`, and absent from the IR pane where that
pass never runs. Fixed with a TreeWalker `acceptNode` that rejects anything under an `<svg>`.

Spun out while measuring: **task 367** — authored HTML comments never reach the full Preview pane at
all. Pre-existing, unrelated, pinned in the same spec.

## Still open

- **WYSIWYG — all three pairings.** Untouched. This is the bulk of the remaining work.
- **smiles colour divergence** (details below) — confirmed twice now, still unexplained.
- The non-reusable engines (echarts, mindmap, markmap, geojson, stl) are only spot-checked by the
  probe above, not asserted by a spec.

> "i tak dla każdego typu diagramu testy powinny być w ir i preview (zrób też task na wysywig)"

## Why

Tasks 364 and 365 both came from the same blind spot: we had *one* coarse mode-switch spec
(`scroll-preserve.spec.ts`, which asserted only `pvFrac > 0.3`) and no per-engine comparison of what
a diagram actually looks like in one pane versus another. Two real defects hid behind that:

- 364 — the reader was thrown up to 783px on switching (fixed).
- 365 — d2 laid out 3 of 12 diagrams differently in Preview than in IR (fixed).

WYSIWYG is a THIRD surface with no coverage at all here, and it has its own render path (Vditor
rebuilds the block DOM differently from IR), so the same class of divergence is plausible and
currently unobserved.

## Scope

A parity spec that, for EVERY engine family in the registry — mermaid, echarts, mindmap, markmap,
flowchart, graphviz, plantuml, abc, smiles, wavedrom, nomnoml, d2, vega-lite, geojson, stl — compares
the same block across the panes:

1. **IR ⇄ Preview** — the pair 365 is about. DONE for every reusable engine (see the top).
2. **WYSIWYG ⇄ Preview** and **IR ⇄ WYSIWYG** — still untested.

Per block, assert:
- it RENDERED at all in each pane (an engine drawing nothing must not pass as "equal to nothing" —
  the vacuous-assertion trap that hid task 361),
- the produced SVG/canvas has the same intrinsic size (365's `width`/`viewBox` delta is the signal),
- computed colours match (the smiles finding below),
- no unintended horizontal overflow.

## Already-known findings to encode

- **d2**: intrinsic width differed IR vs Preview on some diagrams — FIXED in task 365 by reusing one
  render across the panes. The same class can still exist wherever reuse does NOT apply (natives in
  the full Preview, the non-cacheable engines), so keep looking for it there.
- **hljs inside diagram labels**: `highlightRender` walked into d2's `<foreignObject>` labels and
  added `class="hljs"`. Fixed in task 365 (`patchHighlightSkipDiagrams`). Any engine that emits
  `pre > code` inside its SVG was affected — worth an explicit assertion in this suite.
- **smiles**: computed colour differs — Preview resolves the svg's `color` to a syntax-token colour
  (`rgb(215,186,125)` = `#d7ba7d`) instead of the pane foreground (`rgb(209,213,218)`), measured
  under `theme.content: auto`. The svg appears to inherit from a highlighted `<code>` wrapper in the
  Preview pane. Confirmed with computed styles; needs its own root-cause pass.
- **flowchart**: a computed-colour difference showed up too but is NOT confirmed — the comparison
  sampled the first N painted nodes and an element-count difference shifts the whole sample. Re-check
  with per-element pairing before treating it as real. (Its markup-level divergence — an inline
  `top: -0.453125px` present only in Preview — is gone now that flowchart is reused.)

## Method notes (learned the hard way)

- Compare **computed** `fill`/`stroke`/`color`, not the attributes: several engines paint via
  `currentColor` / `getComputedStyle`, so identical attributes can render as different colours. An
  attribute-only comparison reported "SAME" for every engine and was a false negative.
- Normalise volatile ids (`id="…"`, `url(#…)`, `clip-path="…"`) before diffing markup, or every
  diagram looks different.
- Locate "the same block" across panes by the LCS pairing (see `preview-scroll-preserve.ts`), NOT by
  text: a diagram's IR text is its ```fenced source while Preview holds the rendered SVG.
