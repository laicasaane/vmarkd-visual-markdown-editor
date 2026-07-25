# 376 — flowchart is too white on a dark background

**Status: 🟡 implemented, awaiting the user's visual verdict**

## Report

> "flowchart jest zbyt biały na ciemnym tle, jakie inne jasne kolory mogę wykorzystać?"

## Cause

Task 91 gave flowchart.js a themed foreground so it would stop drawing black-on-dark, and passed
that ONE colour to all three of its style options — `line-color`, `element-color`, `font-color`.
Structure and labels therefore always shout equally loudly: on github-dark the content foreground is
`#e6edf3`, i.e. near-white boxes, arrows and text.

## Fix — split the roles

Lines and element borders take the palette's **`muted`**; labels keep **`fg`**. Both come from the
active palette (`resolveDiagramPalette` → the same layer-1 mermaid/echarts/d2 use), so the split
follows the content theme by itself and needs no per-theme hardcoding:

| | github-dark | vscode-dark-2026 | material-dark | github-light |
|---|---|---|---|---|
| lines (`muted`) | `#9198a1` | `#676869` | `#5c6370` | `#59636e` |
| labels (`fg`) | `#e6edf3` | `#bbbebf` | `#abb2bf` | `#1f2328` |

Chosen from five candidates rendered in the real editor across the three dark themes (kept in the
task thread): all-`fg` (before), muted lines, accent lines, all-muted, and the `line` token. The
`line` token is unusable on github-dark — `#3d444d` on `#0d1117` is barely visible. Accent lines
(variant C) work but tie flowchart to the accent hue, which is purple in material-dark.

## One definition, two call sites

The colours now come from `flowchartDrawOptions` (flowchart-retheme.ts), reached by the first render
through the `window.__vmarkdFlowchartOpts` global that main.ts installs, and directly by the live
re-theme. Previously the esbuild patch and the re-theme each built their own options object — the
exact shape that drifts. The patch keeps an inline single-foreground fallback for the window before
the global exists; flowchart.js's own default is BLACK, so "no colour" is not a safe failure.

## Version bump — load-bearing

`package.json` 1.2.2 → **1.2.3**. flowchart is a cached native engine and the render-cache hash folds
in the extension version, so without the bump every already-cached flowchart would still be served
in the old near-white colours.

## Verification

- Unit `flowchart-retheme.test.ts` (new, 4 cases): the role split, `fill:"none"` (Raphael renders
  `transparent` as BLACK), the fallback when the palette has no `muted`, and the fallback when the
  palette resolver throws — that last one must never return an unset colour.
  Note for whoever edits it: a `mockReset()` in `beforeEach` makes a later `mockImplementation` throw
  escape the mock and fail the test under vitest 4 even though the code catches it (verified in
  isolation — the catch works). Every case sets its own implementation instead.
- e2e: the 40 pixel baselines (task 375) were regenerated; all 5 themes green, including the
  cross-pane equality that proves the edit pane and Preview still agree after the change.

## Open

- [ ] The user has not yet judged the result — sent as a 5-theme sheet. Light themes especially:
      `vscode-light-2026` has no `muted` in its palette, so it is DERIVED (`mix(bg, fg, 0.5)`),
      which is a different provenance from the themes that declare one.
