# 372 — d2 connection labels are cut in half by their own line

**Status: ✅ FIXED** (render fix + unit tests + real-VS-Code e2e + mutation-verified)

## Report

> "w preview na d2 labelki na diagramach są przecinane linią jakby tło miało przezroczyste"

## What it was NOT

Not an IR-vs-Preview divergence, which is where I looked first. Measured on the all-renderers
fixture: all 12 d2 blocks are cache-hits in both panes with **zero markup differences** — the render
reuse (task 365/366) makes them byte-identical, so the label was cut in IR too. Preview is simply
where the user reads.

That is worth remembering: "I see it in Preview" does not mean "Preview differs".

## Cause

`d2-render.ts` emitted connection labels as a bare `<text>`:

```
<text … font-style="italic" fill="…">charge</text>
```

d2's own renderer draws a background rect behind them. Without one, any route passing under a label
runs straight through the glyphs — visible on every routed diagram (the C4-ish service graph in the
fixture has ~16 such labels).

## Fix

Paint the glyph OUTLINE in the canvas colour and put it under the fill via `paint-order="stroke"`
(`labelHalo()`), on both label emitters — connection labels and arrowhead/cardinality labels.

Chosen over a background rect: no box geometry to get wrong, and it follows the glyph shape where a
rect would clip a descender.

The colour must be the CANVAS colour, and `D2Style.bg` is **undefined** for the paired themes
(transparent canvas inheriting the editor background), so it falls back to
`var(--vscode-editor-background, transparent)` rather than a hardcoded colour. Being a CSS var it
resolves at PAINT time, so a cached SVG re-painted under a different editor theme still gets a
correct halo. The `transparent` fallback makes a missing var a no-op rather than a smudge.

## Version bump — load-bearing, not cosmetic

`package.json` 1.2.1 → **1.2.2**. The diagram cache hashes `lang + version + themeKey + source` with
version = the extension version, so **without the bump the user's stored pre-fix SVGs would keep
being served and the fix would be invisible to them**. `editor-config.ts` documents this contract
("a re-pin of any bundled engine ships with a version bump"); this is a render-output change, so it
qualifies.

## Verification

- Unit (`d2-render.test.ts`, 2 new): the halo is emitted with `paint-order="stroke"`, the muted fill
  survives it, and the transparent-canvas case falls back to the editor-background var.
- e2e (`d2-label-halo.spec.ts`, new): in the real webview EVERY italic (= connection) label carries
  the halo, keeps its fill, and strokes with the editor-background var. Node labels are deliberately
  excluded — they sit inside a filled shape and need none.
- Mutation: emitting no halo fails with "a connection label had no halo — the line can cut through
  it". Measured 34 of 123 d2 text nodes haloed (the edge labels).
- Screenshot before/after on the fixture's service graph confirms the lines no longer cross
  "publish" / "write" / "route" / "consume".
- Regression: d2-theme (3), d2-sketch (2), diagram-cache (2) green; unit 1408; lint clean.
