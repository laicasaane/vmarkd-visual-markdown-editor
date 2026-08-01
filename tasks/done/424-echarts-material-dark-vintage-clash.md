# Task 424 — echarts on `material-dark` clashes with the shared muted palette (Codex visual finding #1)

**Status: ✅ REVERTED to the ORIGINAL vintage salmon, plus a NEW extension: vega/vega-lite now match
it too.** · **Impact:** 🟠 medium-high (the single most visually jarring mismatch found across all 80
theme snapshots, per the original audit) · **Origin:** Codex visual-consistency audit (2026-07-28),
finding #1

> **⚠️ 2026-07-28 — REVERSED at the user's own explicit call, after seeing the shipped fix live.**
> The direction below (Option C: re-seed material-dark's echarts series from one-dark's accent
> purple `#c678dd`) DID ship, and the earlier "real-webview visual proof BLOCKED" note in this
> section turned out to be a red herring: the VSIX the user tested was a version that had never
> actually been reinstalled with the fix (the extension was rebuilt via `node build.mjs`, which
> does NOT update an installed `.vsix` — see the `install-vsix-to-see-visual-changes` project
> memory). Once a fresh VSIX was packaged + installed, the user DID see the purple result live —
> and rejected it: **"kolor diagramow na material jest zly, powinien byc ten lososiowy [salmon],
> na vega tez [vega too]."** So the ORIGINAL `vintage` gallery salmon (`#d87c7c`,
> `src/echarts-gallery.ts`) is restored for echarts' material-dark `auto` pairing — this task's
> Option A, effectively, now that it's been compared live against Option C and lost. **New scope
> added, not originally part of this task:** vega/vega-lite (which render their own hardcoded
> default blue, `#4c78a8`, completely independent of any content-theme pairing — see
> `media-src/src/diagram-engines/vega.ts`'s `VEGA_MARK_COLOR` map) now ALSO default to the same
> `#d87c7c` salmon on material-dark, via a `config.mark.color` (vega-lite) +
> per-mark-type `config.<type>.fill`/`.stroke` (raw Vega — verified empirically that Vega does
> NOT honour the vega-lite-only `config.mark.color` fallback) override in `vegaRenderConfig`.
> Verified axis-label text stays the themed foreground, not salmon (a raw-vega axis label is also
> a `text` mark, and `markColorConfig` sets `config.text.fill` — checked live in a chromium probe
> that axis-role text keeps `config.axis.labelColor`, unaffected).
>
> **Verified:** unit suite green (`test/backend/echarts-theme.test.ts` + new
> `media-src/src/diagram-engines/vega.test.ts` cases) · typecheck clean · lint clean · real-VS-Code
> e2e `test/vscode-e2e/echarts-theme.spec.ts` — `echarts + vega + vega-lite all render the shared
> material-dark salmon (task 424 reprise)` — asserts the actually-PAINTED output (canvas
> dominant-pixel for echarts, rendered `fill` attribute for vega/vega-lite's SVG marks), not
> `getOption()`/config introspection. Extension version bumped 1.2.4 → 1.2.5 specifically so the
> render-cache (keyed on `version` — see `render-cache-client.ts`) evicts the stale purple SVGs
> cached under 1.2.4, instead of repeating the exact "fix shipped, cache still serves the old
> result" trap this task hit once already.

## Design proposal (2026-07-28, Codex acting as UI designer, pixel-verified not eyeballed)

> **Correction to this task's own framing first:** pixel-sampling material-dark's actual d2/mermaid
> render shows their line colour is `#4b5263` (one-dark's `line`) — HSL(222°,14%,34%), a near-neutral
> cool-gray, **not blue**. Vega/vega-lite's blue (which looked like "the shared family" in the
> screenshots) is Vega-Lite's own hardcoded default mark colour — it's blue on every theme regardless
> of pairing, a coincidence, not a material-dark identity. So Option (B) below as originally worded
> ("land in the same blue-gray family as vega/mermaid/d2") was chasing a family that doesn't exist.

**Recommended direction: (C), but seeded from one-dark's real accent, not the bespoke tan.**
Pair echarts' material-dark series to **`#c678dd`** — One Dark's signature purple (the same colour
`atom-one-dark` uses for syntax keywords, already present as `MERMAID_PALETTES['one-dark'].accent`
and touched by mermaid/d2/plantuml's note/accent elements on this exact theme) — via the EXISTING
`seriesPalette()` helper (`echarts-theme.ts:74-89`), instead of `VINTAGE_SERIES`. Concretely:

```ts
// ECHARTS_CONTENT_PALETTE['material-dark']:
series: seriesPalette(deriveDiagramColors(MERMAID_PALETTES['one-dark']).accent, bg)
// seeds the golden-angle (137.5°) hue rotation from #c678dd (H286) instead of an unrelated
// ECharts-gallery colour — walks purple→teal→gold→red→blue-violet, all clamped to the same
// saturation/lightness rule seriesPalette already uses for the no-baked-pairing fallback.
```

This is real thematic cohesion (a colour material-dark users already associate with "this is my
One Dark theme") rather than either keeping vintage's disconnected reds/browns (Option A — rejected,
this is the worst mismatch in the whole 80-image set, not a defensible feature) or chasing a
"shared blue family" that doesn't actually exist (the original framing of B).

## What Codex actually saw

Comparing `diagram-echarts-material-dark-linux.png` against `diagram-vega-material-dark-linux.png`
/ `diagram-vega-lite-material-dark-linux.png` (same underlying chart data, rendered by different
engines) side by side: vega/vega-lite render the bars in the shared muted steel-blue every other
engine uses on `material-dark`; echarts renders the SAME chart in a salmon/coral pink (~`#e08787`).
It's the one screenshot in the whole 80-image set that doesn't read as "same family" as its
neighbors — and echarts itself is blue in the other 4 themes, so it's inconsistent with itself too.

## What's actually going on (read the code before assuming this is a bug)

This is **not an accident** — it's a documented, deliberate architectural choice from task 90
(echarts theme pairing, shipped 2026-06-10). Unlike mermaid/d2/plantuml/graphviz (which derive
their colours from the shared 5-field `MERMAID_PALETTES` via `pairedPalette`), echarts' `auto`
mode has its OWN per-content-theme baked mapping (`src/echarts-theme.ts:233-254`,
`ECHARTS_CONTENT_PALETTE`):

```ts
'material-dark': {
  bg: '#282c34',       // material-dark page background — chart blends with the page
  fg: '#abb2bf',
  accent: '#d7ab82',
  series: VINTAGE_SERIES,   // ECharts' own built-in "vintage" gallery theme's series colours
},
```

`VINTAGE_SERIES` pulls its colour array directly from ECharts' vendored `vintage` gallery theme
(`echarts-gallery.ts`) — a warm, retro, muted-but-NOT-blue palette (browns/oranges/dusty pinks).
The salmon Codex saw is one of `vintage`'s categorical series colours. Task 90's own file (line
~101) records this as a deliberate tradeoff: using ECharts' existing named gallery themes per
content-theme pairing is "cheaper" than deriving a matching series algorithmically from the shared
palette (the way `seriesPalette()` does for the `auto`-with-no-baked-pairing fallback case,
`echarts-theme.ts:74-89`).

So the real question isn't "is this a bug" — it's "was pairing material-dark with the warm
`vintage` gallery theme, instead of the shared muted-blue family, the right call, now that it can
be seen side by side with every other engine?"

## Options

- **(A) Keep as-is, it's intentional.** `vintage-dark` is even offered as an EXPLICIT selectable
  theme (`ECHARTS_CUSTOM_NAMES`) for users who want this look on purpose — the `auto` pairing just
  defaults material-dark to it. If the warm/retro contrast is considered a feature (visual variety
  across content themes, echarts as "the chart that gets its own vibe"), close this with no code
  change, just note the decision was reviewed and kept.
- **(B) Re-pair `material-dark`'s `auto` echarts theme to the shared palette family.** Drop the
  `series: VINTAGE_SERIES` override for `material-dark` in `ECHARTS_CONTENT_PALETTE` and let it
  fall through to the algorithmic `seriesPalette()` derivation (same mechanism the no-baked-pairing
  fallback already uses) — this would make echarts' bars land in the same blue-gray family as
  vega/mermaid/d2 on that theme, at the cost of losing the distinct "vintage" identity.
  `vintage-dark` stays available as an explicit opt-in theme either way.
- **(C) Middle ground — keep a distinct-but-compatible palette.** Replace `VINTAGE_SERIES` with a
  custom series derived from `deriveDiagramColors`'s `accent`/`line` (already `#d7ab82` for this
  theme) via `seriesPalette()`, so echarts still has SOME visual identity on material-dark but
  starts from the same accent the rest of the theme uses instead of an unrelated gallery palette.

## Out of scope

- The `vscode-2026` themes' echarts colour choice — that's a related but separately-caused finding, [task 425](425-echarts-vscode2026-oversaturated.md).
- Any change to the explicit `vintage-dark` selectable theme itself.

## Verification (once a direction is picked)

- [ ] If (B) or (C): real-VS-Code e2e / visual check that echarts on material-dark now sits
      visually with its neighbors — the same kind of side-by-side comparison Codex did, but as a
      committed screenshot check (extend `test/vscode-e2e/diagram-visual.spec.ts`'s existing
      material-dark echarts golden, don't add a new spec).
- [ ] Confirm `vintage-dark` (the explicit named theme) is unaffected by whatever change is made
      to the `auto`/material-dark baked pairing.
- [ ] If (A): no code change — just record the decision here and close.
