# Task 479 — A single-point geojson/topojson map computes an infinite zoom and renders degenerate

**Status:** 🔴 OPEN — found 2026-07-31 while fixing task 459's keyboard zoom; **deliberately not
fixed there** · **Impact:** 🟡 medium — any lone-point (or all-duplicate-point) geojson/topojson
diagram renders a broken map, silently · **Origin:** task 459, diagnosed against the vendored
Leaflet source · **Related:** [459](459-a11y-diagram-zoom-and-callout.md), [423](423-leaflet-zoom-control-theme.md)

## The bug

`initLeafletMap` (`media-src/src/diagrams/engines/geojson-topojson.ts`) fits the map to the data's
bounds via `fitBounds()`. For a geojson whose features collapse to a **single point** — one `Point`
feature, or several features at identical coordinates — those bounds have **zero area**.

Leaflet's `getBoundsZoom()` / `_getBoundsCenterZoom()` then compute a zoom of **`Infinity`** when the
map has no `maxZoom` set. Confirmed by reading the vendored source
(`media-src/vendor/leaflet/leaflet.js`), not inferred from behaviour.

**The part that makes this nasty:** it **returns `Infinity`, it does not throw.** So
`initLeafletMap`'s existing `try`/`catch` never sees it — there is no error, no warning, no
fallback. The map just ends up at an infinite zoom and renders degenerate. In task 459's
instrumentation it surfaced as `geoZoomBefore: null`, because `JSON.stringify` turns `Infinity`
into `null` — which is itself a good reminder that a `null` in a serialized probe can be a
non-finite number, not a missing value.

## Why it was NOT fixed in 459

459 was a keyboard-zoom task. Fixing this properly is not a one-liner, and it was tried:

> The obvious fix is a `maxZoom` clamp on the map. That was attempted during 459 and **backed out**:
> it interacts with `fitBounds()`'s headroom and broke 459's own `zoomIn`-has-room assertion. It
> needs its own verification, not a drive-by.

So 459 changed only its **test fixture** — from a single `Point` to a ~10°-square `Polygon` with real
spatial extent — so that the keyboard-zoom behaviour under test was not masked by this unrelated
degenerate state. That is the right call: the fixture change makes 459's spec test what it claims to
test, and does not pretend this bug is gone.

## Scope

- [ ] Decide the correct behaviour for zero-area bounds. Candidates, none chosen yet:
      a `maxZoom` on the map (simplest, but see the headroom interaction above); a `minZoom`/padding
      on the `fitBounds` call; or detecting the degenerate case explicitly and using
      `setView(center, someSensibleZoom)` instead of `fitBounds`. The third is the most direct
      statement of intent — "a single point has no extent, so pick a zoom" — and does not perturb
      the non-degenerate path at all, which is the property the other two lack.
- [ ] Make sure the fix covers **all-identical-coordinates**, not just a literal one-feature file.
      A LineString whose points coincide, or a FeatureCollection of N identical Points, is the same
      zero-area case and is easier to hit by accident.
- [ ] Check topojson too — it goes through the same `initLeafletMap`.

## Verification

- [ ] Unit: assert the computed zoom is finite for a single-Point input, and that a normal
      multi-extent input's zoom is **unchanged** by the fix (the regression risk is that a clamp
      quietly changes framing for every existing map).
- [ ] Real-VS-Code e2e: a fixture with a lone-point map renders a usable map. This is a
      webview-rendering behaviour, so per AGENTS.md it needs the real editor, not just the harness.
- [ ] Re-run `test/vscode-e2e/diagram-zoom-keys.spec.ts` — it is the spec that surfaced this, and its
      fixture was deliberately changed to avoid the degenerate case. Whoever fixes this should
      consider whether that fixture should go back to a Point, or whether a *separate* lone-point
      fixture is the better regression pin (probably the latter — 459's spec is about keyboard zoom,
      not about bounds fitting, and conflating them is how the original masking happened).

## Note

Nothing user-reported this. It was found by instrumenting a failing test for a different bug — worth
recording, because it is the second time today that running a real-webview spec surfaced something
green unit tests and a complete-looking implementation had both missed.
