# 377 — nomnoml: split structure ink from label ink

**Status: ✅ DONE — user-approved (2026-07-28)**

## Report

> "kolory ok, teraz nomnoml" — the same treatment task 376 gave flowchart.

## Cause

`themeNomnomlSvg` rewrote nomnoml's baked `#33322E` to `currentColor` everywhere: class-box borders,
edges, arrowheads AND labels all landed on the theme foreground, so the structure was as loud as the
body text.

## Fix

Structure takes the palette's `muted` (via the new shared `mutedInk()` in diagram-palette.ts, which
falls back to `currentColor` so an unresolvable palette keeps today's behaviour); labels keep
`currentColor`.

Scope kept deliberately narrow: **only the ink**. nomnoml stays out of full palette-pairing —
ADR-0006 records that pairing was trialled and reverted at the user's request because the
surface-fill look was not wanted — and the 6% node tint is pre-existing, not a new surface.

## The trap: nomnoml's labels carry no fill of their own

A `<text>` in nomnoml has only `stroke="none"`; its ink is INHERITED from an ancestor
`<g fill="#33322E">` — the very group the structural pass recolours. So the first attempt (decide
per element by tag name) turned the entire diagram muted, labels included. Measured, not guessed:
the inked pixels went `#f0f6fc` → `#9198a1` wholesale.

The fix resolves each label's *inherited* fill FIRST, then pins those that had nomnoml's default ink
back to `currentColor` after the structural pass. Labels whose ink comes from a `#fill:` directive in
the source are left alone, so an author's colour still wins.

Verified in the live webview rather than from the markup:
`text[fill=currentColor]` over `g[fill=#9198a1]`, computed fill `rgb(240, 246, 252)`.

### A reading mistake worth recording

The pixel histogram after the fix still showed the muted colour dominating and almost no white, which
looked like the fix had not taken. It had: box borders are ~2600 px while glyph CORES are only ~81 px
(12pt text is thin and mostly anti-aliased), so the ink counts are not comparable by rank. The DOM
probe settled it. Histograms are fine for "did anything change", useless for "which element changed".

## Version

Covered by the 1.2.2 → **1.2.3** bump already made for task 376 — nomnoml is a cached engine too, and
the render-cache hash folds in the extension version, so cached SVGs from 1.2.2 cannot be served.

## Verification

- Unit (`custom-diagrams.test.ts`, 2 new cases): structure vs label roles, and the 6% tint left
  untouched. The fixture is shaped like nomnoml's REAL output — `<text>` with no fill, inheriting
  from a group — because a fixture with fill on the text passes while the real diagram breaks. That
  is exactly what happened here.
- e2e: the 40 pixel baselines (task 375) regenerated; all 5 themes green, cross-pane equality intact.

## Open

- [ ] Not yet judged by the user — sent as a before/after sheet across the 5 themes.
