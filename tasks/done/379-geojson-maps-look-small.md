# 379 — "geojson/topojson show shrunken maps"

**Status: ✅ CLOSED** — mostly NOT a defect. One small real improvement shipped (fractional zoom);
the rest is correct cartography and was left alone by the user's decision.

## Report

> "geojson i topojson pokazują pomniejszone mapy w preview"

## What it is not

**Not a sizing bug, and `invalidateSize()` was the wrong suspicion** — my own, recorded here so it is
not retried. Measured in the live editor:

| | wrapper | Leaflet container | drawn geometry | tiles |
|---|---|---|---|---|
| geojson | 545x300 | **545x300** | 218x237 | 0 |
| topojson | 545x300 | **545x300** | 455x229 | 0 |

The container is exactly the wrapper's size, so Leaflet knows its size correctly and there is
nothing to invalidate.

**Not a Preview-only problem either.** The pixel suite (task 375) measures IR / WYSIWYG / Preview
against each other and the delta for both engines is **0.0000** — all three surfaces render alike.

## What it actually is

`fitBounds` preserves GEOGRAPHIC proportions. The fixture's geojson describes a square area
(0.30° lon x 0.20° lat at 52°N ≈ 20.6 x 22.2 km), and the box is 545x300 — a square cannot fill a
wide frame without distorting distances, so it fits the height and leaves side margins. The
topojson fixture has 2:1 data and DOES fill the width (455 of 545): same code, different data,
different result — which is the proof the mechanism works.

The empty margins read as "a small drawing" because by default there is no basemap (offline;
`tiles: 0` measured). With `image.allowRemoteImages` on, the margins fill with map tiles.

## What shipped: fractional zoom

Leaflet snaps `fitBounds` to WHOLE zoom levels, and a level is a factor of 2 — a dataset can be
drawn at up to half the size the box could show. `zoomSnap: 0` removes the quantisation.

Honest about the size of the win: **3%** on this fixture (363x258 → 372x269), because the fit was
already near-optimal for a 300px box. It is free and correct, not a cure for the perception.

## What was rejected, and why the first attempt failed

Fitting the BOX to the shape of the data (so the drawing fills the width) was prototyped and shown
to the user: 465x469 in a 545x500 box — visibly fuller. **Rejected** by the user in favour of the
current fixed height, which keeps every map block a predictable height and stops text reflowing per
dataset.

Worth recording: the box change alone did **nothing** — the drawing stayed 218x237 and only the empty
space grew. Integer zoom quantisation swallowed the extra 200px. Box shape and fractional zoom only
work together; each alone is useless here.

## Verification

- Unit: the map is created with `zoomSnap: 0` (a guard against silent removal; the render itself is
  the pixel suite's job).
- e2e: baselines regenerated — **exactly 10 files changed** (geojson + topojson x 5 themes), no other
  engine moved, which is the scope proof. Full matrix 5/5 green, then re-verified on github-dark
  against the new baselines.
- No version bump: geojson/topojson are excluded from the render cache (not reusable static SVG), so
  no cached output can go stale.
