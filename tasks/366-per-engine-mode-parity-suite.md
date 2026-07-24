# 366 — per-engine render parity across IR / WYSIWYG / Preview

**Status: 📋 TODO — partially covered; the bulk is still open.**

Already landed by task 365 (do not redo): IR ⇄ Preview byte-identity for the CUSTOM cacheable
engines (d2, wavedrom, nomnoml, vega-lite) in `test/vscode-e2e/mode-switch-render-reuse.spec.ts`.
Those panes now reuse one render, so they are identical by construction rather than by comparison.

Still open here: **WYSIWYG (all three pairings)**, the Vditor-NATIVE engines (mermaid/abc/flowchart/
plantuml) in the full Preview pane — which the reuse map does NOT cover, see task 365 "Not done" —
and the non-cacheable engines (echarts, mindmap, markmap, graphviz, geojson, stl), which render
fresh per pane and therefore still have to be compared, not reused.

> "i tak dla każdego typu diagramu testy powinny być w ir i preview (zrób też task na wysywig)"

## Why

Tasks 364 and 365 both came from the same blind spot: we had *one* coarse mode-switch spec
(`scroll-preserve.spec.ts`, which asserted only `pvFrac > 0.3`) and no per-engine comparison of what
a diagram actually looks like in one pane versus another. Two real defects hid behind that:

- 364 — the reader was thrown up to 783px on switching (fixed).
- 365 — d2 lays out 3 of 12 diagrams differently in Preview than in IR (open).

WYSIWYG is a THIRD surface with no coverage at all here, and it has its own render path (Vditor
rebuilds the block DOM differently from IR), so the same class of divergence is plausible and
currently unobserved.

## Scope

A parity spec that, for EVERY engine family in the registry — mermaid, echarts, mindmap, markmap,
flowchart, graphviz, plantuml, abc, smiles, wavedrom, nomnoml, d2, vega-lite, geojson, stl — compares
the same block across the panes:

1. **IR ⇄ Preview** — the pair 365 is about.
2. **WYSIWYG ⇄ Preview** and **IR ⇄ WYSIWYG** — untested today.

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
  with per-element pairing before treating it as real.

## Method notes (learned the hard way)

- Compare **computed** `fill`/`stroke`/`color`, not the attributes: several engines paint via
  `currentColor` / `getComputedStyle`, so identical attributes can render as different colours. An
  attribute-only comparison reported "SAME" for every engine and was a false negative.
- Normalise volatile ids (`id="…"`, `url(#…)`, `clip-path="…"`) before diffing markup, or every
  diagram looks different.
- Locate "the same block" across panes by the LCS pairing (see `preview-scroll-preserve.ts`), NOT by
  text: a diagram's IR text is its ```fenced source while Preview holds the rendered SVG.
