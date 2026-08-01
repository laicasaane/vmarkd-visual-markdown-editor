# 380 — vega/vega-lite axis labels have no gap under the tick

**Status: ✅ DONE** (pending the user's look at the regenerated baselines)

## Report

Raised by me while reviewing the pixel baselines, as "axis labels sit on the axis line", then
corrected by measurement before any fix.

## What it actually is — and what it is not

Counted pixels in the "A" column of the vega fixture (github-dark):

```
rows 205–211   28 ink px   the bar above the axis
rows 212–216    1 ink px   the axis tick
rows 217–226    4→10 px    the letter "A"
```

The tick ends on row 216 and the glyph starts on 217 — they **touch exactly, with no overlap**. So
this is NOT the flowchart case (task 378), where the routed line ran THROUGH the word; a halo would
have had nothing to knock out. The issue is spacing, not collision, and the fix has to be spacing.

## Fix

`axis.labelPadding: 4` in the shared vega/vega-lite render config (vega's default is 2). Four
values were rendered in the real editor in ONE editor launch — 2 (current), 4, 6, 8 — and shown to
the user, who chose 4.

Everything in that config is a DEFAULT: vega-embed merges the chart's own spec on top, so an author
who sets `axis.labelPadding` in their own spec still wins.

The config was extracted to `vegaRenderConfig(fg)` so both engines share one definition and the unit
test has a seam to pin.

## Verification

- Unit: labelPadding is 4; every axis colour is driven from the themed foreground; the canvas stays
  transparent.
- e2e: baselines regenerated — **exactly 10 files changed** (vega + vega-lite x 5 themes), no other
  engine moved. Full matrix 5/5 green.
- No version bump needed, and the reason is timing rather than luck: vega/vega-lite ARE cached and
  the cache key folds in the extension version, but 1.2.3 (bumped for tasks 376/377) has not been
  packaged or installed anywhere yet, so no cache entry exists under it. The installed build is
  1.2.2, whose entries all become unreachable the moment 1.2.3 lands. If 1.2.3 had already shipped,
  this change would have required 1.2.4.
