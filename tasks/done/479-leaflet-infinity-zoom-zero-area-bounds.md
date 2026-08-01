# Task 479 — A single-point geojson/topojson map computes an infinite zoom and renders degenerate

**Status:** 🟢 DONE — 2026-08-01. Fixed with option (c) from the scope list: detect zero-area bounds
explicitly and `setView(center, 12)` instead of `fitBounds()`. Non-degenerate path unchanged
byte-for-byte (same `layer.getBounds()` call, same `fitBounds(bounds, { padding: [20, 20] })`); unit
+ real-VS-Code e2e both green. · **Impact:** 🟡 medium — any lone-point (or all-duplicate-point)
geojson/topojson diagram renders a broken map, silently · **Origin:** task 459, diagnosed against the
vendored Leaflet source · **Related:** [459](459-a11y-diagram-zoom-and-callout.md), [423](423-leaflet-zoom-control-theme.md)

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

- [x] Decide the correct behaviour for zero-area bounds. **Chosen: option (c)** — detect the
      degenerate case explicitly (`isDegenerateBounds()`, `media-src/src/diagrams/engines/geojson-topojson.ts`)
      and use `setView(bounds.getCenter(), DEGENERATE_POINT_ZOOM)` instead of `fitBounds()`.
      `DEGENERATE_POINT_ZOOM = 12` — a "city/neighborhood" level in Leaflet's convention (0 = world,
      ~19 = building), close enough to be a useful view of a single point without reading as an
      arbitrary max-zoom clamp (the thing the maxZoom approach — tried and backed out in 459 — would
      have been). No `maxZoom` was added to the map; the non-degenerate path is untouched.
- [x] Covers **all-identical-coordinates**: `isDegenerateBounds()` checks
      `bounds.getNorthEast().equals(bounds.getSouthWest())`, which is true for a single Point, N
      Points at identical coordinates, and a collapsed LineString alike — all three are unit-tested
      individually (`geojson-topojson.test.ts`, `describe('initLeafletMap zero-area bounds (task 479)')`).
- [x] Topojson checked — it goes through the exact same `initLeafletMap`, so no extra branching was
      needed; a dedicated unit test (`'topojson goes through the same degenerate-bounds path as
      geojson'`) and a topojson block in the real-VS-Code e2e fixture both exercise it directly.

## Verification

- [x] Unit (`media-src/src/diagrams/engines/geojson-topojson.test.ts`): `isDegenerateBounds` tested
      directly (point / real extent / invalid bounds); `initLeafletMap` wiring tested for a lone
      Point, an identical-coordinate FeatureCollection, a collapsed LineString, and topojson — all
      assert `setView` was called with a finite zoom and `fitBounds` was NOT. A dedicated
      "normal multi-extent map is UNCHANGED by the fix" test asserts `fitBounds` is still called with
      the exact same `{ padding: [20, 20] }` and `setView` is NOT called on that path. 19/19 pass;
      `npx vitest run … --coverage` on just this file: the new code (`isDegenerateBounds` + its two
      call sites in `initLeafletMap`) is fully covered — the only uncovered lines (151-160, 173) are
      the pre-existing remote-basemap branch and `pointToLayer` callback, untouched by this fix.
- [x] Real-VS-Code e2e: new spec `test/vscode-e2e/geojson-lone-point.spec.ts` + fixture
      `test/vscode-e2e/fixtures/geojson-lone-point.md` (a lone Point geojson block AND a lone-point
      topojson block). Asserts both maps render with a non-zero-size container, a finite zoom
      (`> 2` and `< 19`, i.e. not collapsed toward 0 and not maxed at the basemap's 19), and a
      center matching the input coordinates. Ran with `node build.mjs` then
      `xvfb-run -a npm --prefix test/vscode-e2e test -- geojson-lone-point.spec.ts` — **1/1 passed**,
      measured `zoom: 12` for both maps.
- [x] Re-ran `test/vscode-e2e/diagram-zoom-keys.spec.ts` unchanged (still its 10°-square Polygon
      fixture, not reverted to a Point) — **1/1 passed**, `geoZoomBefore: 5.19...` confirms the
      non-degenerate `fitBounds()` fractional-zoom path is untouched by this fix.
      Also re-ran `test/vscode-e2e/geojson-basemap.spec.ts` (the cheapest sanity net for this engine)
      — **3/3 passed**.

## Note

Nothing user-reported this. It was found by instrumenting a failing test for a different bug — worth
recording, because it is the second time today that running a real-webview spec surfaced something
green unit tests and a complete-looking implementation had both missed.
