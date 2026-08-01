# Task 425 — echarts on vscode-2026 themes reads as flat/oversaturated "brand blue" (Codex visual finding #2)

**Status: ✅ DONE, verified against the real webview (not just the pixel goldens).** · **Impact:** 🟠 medium-high, worse on `vscode-light-2026` than `vscode-dark-2026` · **Origin:** Codex visual-consistency audit (2026-07-28), finding #2

> **2026-07-28 — resolved.** The earlier "blocked verification" note turned out to be TWO separate
> non-issues, not one unresolved cache mystery: (1) the pixel-golden `--update-snapshots` run really
> was a dead end (see [task 424](424-echarts-material-dark-vintage-clash.md) for why — an
> un-reinstalled VSIX, not a render-cache bug), and (2) the pre-existing
> `test/vscode-e2e/echarts-theme.spec.ts` structural test — which SHOULD have caught this — was
> itself stale: it still asserted the RAW pre-425 `charts.*` blue instead of the new muted value,
> so it was silently failing (never re-run after 425 landed) rather than confirming the fix. Fixed
> both constants (`LIGHT`/`DARK` bucketed pixel + `mindColor`) to the actual muted values
> (`#1f76d8`/`#4984c7`) and reran each isolated (the file's own header documents why light/dark must
> run as separate process invocations, not together) — both green against the real VS Code webview.

## Design proposal (2026-07-28, Codex acting as UI designer, pixel/HSL-verified not eyeballed)

**Recommended direction: (B) desaturate toward the theme background, keep VS Code's own 5 hues.**

Pixel/HSL evidence (computed from the actual documented hex values, not estimated):
- **Dark theme — real mismatch.** echarts series[0] `#59a4f9` = HSL(212°,93%,66%). mermaid/d2's own
  line colour on the SAME theme, `#48a0c7`, = HSL(198°,53%,53%). Gap: 40pts saturation, 13pts
  lightness, 14° hue shift (echarts leans indigo, mermaid/d2 leans cyan-teal) — a genuine
  colorimetric mismatch, not just perception.
- **Light theme — NOT actually a colour-value mismatch.** echarts series[0] `#0063d3` = HSL(212°,100%,41%)
  vs. mermaid/d2's `#0069cc` = HSL(209°,100%,40%) — numerically almost identical. The "oversaturated"
  read on light theme is a **mark-style effect**: echarts paints a large, 100%-opacity SOLID FILLED
  bar; everything else is a 1–2px line stroke or pale box tint. Same colour reads far louder as a
  filled area than a hairline — the real lever on light theme is closer to reducing fill
  opacity/area than changing hue/saturation.

Concrete values, using `mix(colour, bg, t)` (the same helper already used for `muted` elsewhere):
- **Dark series** — `mix(seriesColor, '#121314', 0.22)` for all 5:
  `#59a4f9→#4984c7` HSL(212,53,53) · `#89d185→#6fa76c` HSL(117,25,54) · `#cca700→#a38604` HSL(49,95,33) ·
  `#f14c4c→#c03f40` HSL(360,51,50) · `#b180d7→#8e68ac` HSL(274,29,54). Series[0]'s resulting S/L
  (53%,53%) land almost exactly on mermaid/d2's own values — same formula, no hand-tuning, converges
  naturally. Hue stays 212° vs. mermaid's 198°, so it's still recognizably "VS Code's own blue," just
  no longer louder than its neighbour.
- **Light series** — a gentler `mix(seriesColor, '#ffffff', 0.12)` (light touch, values were already
  close): `#0063d3→#1f76d8` · `#388a34→#50984c` · `#bf8803→#c79621` · `#e51400→#e8301f` ·
  `#652d90→#77469d`. Peak saturation drops ~100%→~75-81%, taking the edge off without erasing hue
  identity or matching mermaid's still-100%-saturated stroke (per the mark-style point, that would be
  the WRONG target for a filled shape).

Rejected: **(A)** keep-as-is — dark theme has a real, measured 40pt saturation gap, not just
aesthetics. **(C)** hard-align series[0] to the literal mermaid/d2 line colour — barely moves
anything on light (values already near-identical); on dark it would collapse series[0] into a
shared structural line colour while leaving series[1-4] as raw VS Code hues, making the palette
internally INCONSISTENT (4 raw + 1 borrowed) — worse than either the current all-raw or the
uniformly-muted all-5 proposal above. A categorical chart needs its own coherent 5-hue set for
multi-series legibility, which (C) would break.

## What Codex actually saw

On `vscode-light-2026`, echarts renders its bars in a fully-saturated, flat blue (~`#1a73e8` —
Codex describes it as looking like a Google-Material primary swatch) while every other engine in
the same theme (d2's borders, mermaid's borders, vega/vega-lite's bars) uses a softer, muted
steel-blue. Same pattern on `vscode-dark-2026`, less extreme because the dark background absorbs
more of the contrast. Echarts is described as the one diagram that "didn't get the theme memo" —
glossy/poster-bright next to everything else's pastel-ish restraint.

## What's actually going on

Same root mechanism as [task 424](424-echarts-material-dark-vintage-clash.md) — echarts' `auto`
mode bakes a PER-THEME series override in `ECHARTS_CONTENT_PALETTE`
(`src/echarts-theme.ts:240-253`), and for the vscode-2026 themes it deliberately uses **VS Code's
own native chart colours**, not the shared muted diagram palette:

```ts
'vscode-dark-2026': {
  bg: '#121314', fg: '#bbbebf', accent: '#59a4f9',
  series: ['#59a4f9', '#89d185', '#cca700', '#f14c4c', '#b180d7'], // VS Code charts.* registry
},
'vscode-light-2026': {
  bg: '#ffffff', fg: '#202020', accent: '#0063d3',
  series: ['#0063d3', '#388a34', '#bf8803', '#e51400', '#652d90'], // VS Code charts.* registry
},
```

The code comment (`echarts-theme.ts:230-231`) states the intent explicitly: *"VS Code Dark/Light
2026 → VS Code's own chart colours (`charts.*` registry defaults...)"*. This mirrors what VS Code
itself uses for its own chart UI (test coverage bars, chart-rendering extensions, etc.) — a
legible, deliberate design choice to feel native to the editor. It's the SAME kind of "give this
theme its own distinct series identity" choice as material-dark's vintage pairing (task 424), just
using VS Code's palette instead of ECharts' vintage gallery.

Separately: `mermaid-palettes.ts:38-43`'s `vscode-dark-2026`/`vscode-light-2026` entries set
`line`/`accent` to a SIMILAR but not identical blue (`#48a0c7` dark / `#0069cc` light — the same
blue mermaid/d2/plantuml's strokes use, see [task 426](426-diagram-accent-adoption-split.md)) —
so echarts' bars and the rest of the diagram family's strokes are BOTH blue-ish on this theme, but
from two different colour sources with different saturation, which is likely part of why they read
as "close but not matching" rather than either "clearly on-theme" or "clearly a different family."

## Options

- **(A) Keep as-is.** VS Code's own chart colours are a deliberate, documented choice
  (`echarts-theme.ts`'s own comment) — arguably MORE correct for "feels native to this editor"
  than matching mermaid's muted blue would be. Close with no change if the native-VS-Code-chart-
  colours identity is considered the right call even if it stands out from other diagram engines.
- **(B) Desaturate the vscode-2026 series to match the shared palette's saturation level**, while
  keeping the VS Code-native hues (don't swap to a different colour family, just tone down
  vibrancy) — e.g. mix each series colour toward the theme background the way `deriveDiagramColors`
  already does for `muted` elsewhere, so echarts stays recognizably "VS Code blue-ish" but sits
  quieter next to mermaid/d2/vega.
- **(C) Align echarts' series[0] to EXACTLY the same blue mermaid/d2/plantuml use** (`#48a0c7`/
  `#0069cc`, the `line`/`accent` from `MERMAID_PALETTES`) instead of VS Code's own
  `charts.*`-derived blue, so the "this is the theme's blue" signal is literally the same pixel
  value across every engine, not two close-but-different blues.

## Out of scope

- The material-dark vintage-clash finding — separately tracked, [task 424](424-echarts-material-dark-vintage-clash.md).
- Any change to explicit (non-`auto`) echarts theme selections.

## Verification

- [x] `test/vscode-e2e/diagram-visual.spec.ts`'s echarts-on-vscode-2026 goldens refreshed — see the
      blind-spot note below for why they did NOT catch this themselves.
- [x] Painted-pixel checks in the real webview on BOTH surfaces (see below).
- [x] The harness spec that was still pinning the pre-425 raw blue, fixed.
- n/a (A) was not the chosen direction.

## 2026-07-29 — the leftovers, and a measured blind spot in the golden net

Three things were still open after 425 was called done. All three are closed now.

**1. A third stale assertion.** `media-src/e2e/echarts.spec.ts` still expected the raw `#59a4f9`,
so it was failing — the same staleness already found twice (the vscode-e2e spec, and the goldens).
Rewritten to ask `resolveEchartsTheme` for the expected value instead of restating it: what a
harness spec owns is the WIRING (a rendered chart on this content theme really carries the series
the resolver hands out), and the literal value is pinned once already, in
`test/backend/echarts-theme.test.ts`. A hardcoded hex there only re-arms the trap on the next tune.
RED-checked by pointing the page at a different content theme.

**2. The goldens are blind to this whole class of change — measured, not assumed.** The
`diagram-echarts-vscode-*-2026` baselines still held the raw pre-425 blue and the `@visual` suite
kept PASSING against a correctly-muted render. Not a tolerance-ratio problem (the bars are 31 555 px
= ~14 % of the shot, far above `maxDiffPixelRatio: 0.005`): it is pixelmatch's **per-pixel**
threshold, left at Playwright's default `0.2` → maxDelta `35215 × 0.2² = 1409`, while raw→muted is
only `504` (dark) / `264` (light). Same-hue desaturation is exactly what tasks 424/425 are about, so
the one net that looks like it covers this cannot see it.

- Both echarts baselines regenerated; they now carry `#4984c7` / `#1f76d8`, same 31 555 px.
- ⚠️ **Open decision, deliberately NOT taken here:** `threshold: 0.1` (maxDelta 352) would make the
  goldens catch it, but that per-pixel setting is suite-wide across all 80 baselines and the
  header's tolerance was tuned by measurement against anti-aliasing noise. Changing it needs its own
  measurement pass, not a guess folded into this task.

**3. The IR pane was never asserted.** Only the full-Preview overlay was measured, while the pane the
user actually edits in had no series-colour check on any theme. Added to
`echarts-theme.spec.ts` (both modes), measured off the painted canvas like the existing one — green
on both. So the muted palette is confirmed on the default editing surface too, not only in Preview.
