# 378 — flowchart's edge label sits on the routed line

**Status: ✅ DONE — user-approved (2026-07-28)**

## Report

> "na flowcharta można jakiś fix? da się w ogóle?"

The `no` label of the fixture's decision branch is placed ON the line, so the routing strikes through
the word.

## Can it be fixed at all — yes

flowchart.js offers no label-background option: Raphael draws a bare `<text>`, and the label position
comes from its own router, which we do not want to reimplement. But the label does not need a box —
it needs the LINE to stop around the letters. So the text gets a **halo**: a stroke in the page's own
colour painted UNDER the glyphs (`paint-order: stroke`), which knocks the line out around the word
and leaves no visible rectangle. Same technique as task 372's d2 edge labels.

`paint-order` is the load-bearing part: without it the stroke paints OVER the glyph and just
fattens it into a blob.

## Width — measured, not picked

| width | result |
|---|---|
| 3px | nibbles the anti-aliased edge only — **54 changed pixels** in the whole diagram, no visible gap |
| **5px** | clear gap around the letters, line still reads as continuous — **chosen** |
| 7px | starts eating the line itself |

## Backdrop

The halo colour is the nearest ancestor that actually PAINTS a background, not the palette's `bg`.
With `theme.content: auto` those agree, but a named content theme paints the markdown body itself,
and a halo in the wrong colour is a smear rather than a gap. When nothing resolves, the labels are
left alone — a struck-through label beats a coloured smear.

## Where it runs

`applyFlowchartLabelHalo` (flowchart-retheme.ts) is called after `drawSVG` on BOTH paths — the first
render, through the `window.__vmarkdFlowchartAfterDraw` global the esbuild patch calls, and the live
re-theme. Same one-definition arrangement as the colours in task 376.

## Verification

- Unit (3 new cases): the halo is painted under the glyphs in the backdrop colour at 5px; the
  backdrop comes from the nearest ancestor that paints one; nothing is touched when no backdrop
  resolves.
- e2e: the 40 pixel baselines regenerated, all 5 themes green.

## Open

- [ ] Not yet judged by the user — sent as a ×6 crop of the width comparison plus before/after in the
      5 themes.
