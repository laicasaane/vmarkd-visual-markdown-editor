# 366 — per-engine render parity across IR / WYSIWYG / Preview

**Status: ✅ DONE for all three surfaces** (IR ⇄ WYSIWYG ⇄ Preview), with the residuals below
deliberately left and documented.

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
| **smiles** | computed colour `rgb(209,213,218)` → `rgb(215,186,125)` | **fixed** (see below) |
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

### smiles — root cause found: VS Code's injected webview CSS

`--vscode-textPreformat-foreground` is **`#d7ba7d` = rgb(215,186,125)** — a byte-exact match for the
divergent colour. VS Code styles a bare `<code>` in a webview with it, smiles is the one diagram Lute
wraps in `<code class="language-smiles">`, and smiles paints from `currentColor`, so the whole
molecule was recoloured. IR escapes it only because its `<code>` sits under `.vditor-ir__preview`,
which we colour ourselves; in the full Preview the `<pre>` is unclassed and VS Code's rule wins.

Fixed by adding `color: inherit` to the existing diagram-`<code>` neutralisation block in main.css —
the same rule that already strips the injected background/padding from those wrappers.

This is the "repro only in the real editor" class: no harness injects that stylesheet, so no
Playwright-level test could ever have seen it.

### The non-reusable engines are now asserted

`mode-switch-render-reuse.spec.ts` → "engines that are NOT reused still draw the same in both panes"
covers graphviz, smiles, markmap, echarts, mindmap, geojson and stl. Byte-identity is impossible for
a live d3 instance / canvas / Leaflet map / WebGL scene, so it asserts what a reader would notice:
each drew in BOTH panes, at the same intrinsic size, in the same computed colour. It requires more
than 4 blocks to have actually drawn, so a headless miss (stl needs WebGL) degrades to a smaller
sample rather than a vacuous pass.

Mutation-verified: reverting the smiles CSS fix makes it fail with exactly
`smiles#0: colour rgb(209, 213, 218) -> rgb(215, 186, 125)` and nothing else — so the other six
engines are genuinely equal, not silently unmeasured.

## Done (WYSIWYG — the third surface)

`test/vscode-e2e/wysiwyg-parity.spec.ts` (new, 3 tests) sweeps IR → WYSIWYG → Preview. It found two
real divergences, both fixed:

### abc rendered differently in every pane

| pane | abc svg |
|---|---|
| IR | 451.99×98.83 |
| Preview | 420.02×87.83 |
| WYSIWYG | 420.02×72.83 |

And abc is **not self-consistent between two fresh renders of the same pane** — the same WYSIWYG pane
measured 72.83 and 87.83 on consecutive runs. So three engine passes could never have been tuned into
agreement; reuse is the only fix. The same-session reuse only scanned `.vditor-preview`, because the
open-path reserve had covered the panes that existed at init. Broadened to every pane a mode switch
can build (`ANY_PREVIEW_PANE_SEL`). All eight reusable engines are now byte-identical across all
three surfaces.

### callouts were 62px in WYSIWYG and 58px in both other panes

A WYSIWYG-only 4px title margin. Removed rather than added to the others: the IR rule zeroes it
DELIBERATELY, because there the expanded source renders the `[!TYPE]` marker and the first content
line inside ONE paragraph, so any title margin changes the box height on collapse⇄expand. That is a
stronger constraint than 4px of breathing room, and the title still reads as one from its weight and
accent colour (the same argument that rule already makes). ⚠ This is a small VISUAL change to the
WYSIWYG callout — worth the user's eye.

Mutation-verified: reverting either fix fails the new spec, abc with exactly the sizes above.

## Still open — deliberately

- **markmap** differs by its per-instance class (`mm-…-1` vs `-2`). Cosmetic; it is a live d3
  instance, so a fresh render per pane is correct.
- **table** rows holding inline code, 0.86px each — task 369, measured and left on purpose.
- **stl** (headless has no WebGL → both panes show the error box) and the **unsupported-d2 note**
  (`shape: sequence_diagram`) differ by 4–15px. Fallback content, not a render path.
- The comment blocks' 7px gap — the collapse asymmetry recorded in task 367.

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
