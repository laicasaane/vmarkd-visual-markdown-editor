# 394 — D2 edge-label halo reads as a thick hand-inked outline, not an invisible gap

**Status: 🔍 MEASURED, no fix written.** Found 2026-07-27 while the user reviewed the
`all-renderers.md` d2 blocks in the real editor (tasks 375–378 visual review).

## Report

> "d2 taki rodzaj napisow na vscode light odpada" (the `api -> server: request` edge label) — text
> reads as sketchy/hand-drawn with what looks like a scribble through it.
>
> On a second block, the `verified by` / `gate` edge labels visibly overlap the node boxes above
> them with a bold black outline (`|md` pipeline diagram, `snippet -> pipeline.checklist: verified
> by` and `notes -> ship: gate`).

## What was checked

Task 372 gave every d2 connection label a halo: `paint-order="stroke" stroke="…" stroke-width="4"`
painted UNDER the glyph fill, so a routed line can't cut through the letters. Measured directly on
the real webview (`api -> server: request`, `all-renderers.md`, `theme.content: auto`,
`diagram.d2Sketch: true`):

```
fontSize: 14.6667px
strokeWidth: 4          (halo, both sides of every glyph stroke)
glyph bbox: 49.1 x 16.0 px
```

A 4px stroke on a ~14.7px label is a heavy fraction of the glyph's own stroke weight — the visual
effect the user is describing ("sketchy", "black outline crossing the box") is consistent with the
halo itself being too thick at the label's ACTUAL rendered size, not a colour mismatch: font-family
was checked and is the normal `"Source Sans 3","Source Sans Pro",system-ui,sans-serif` stack (no
dedicated "sketch" font exists — task 120 keeps text emit crisp, unrelated to rough.js).

Task 378 (flowchart's own edge-label halo, same `paint-order: stroke` technique, different
renderer) tuned this by eye + pixel-diff before picking a width (3px "no visible gap" / 5px "clear
gap, still reads continuous" / 7px "eats the line"). Task 372 shipped `stroke-width="4"` with no
equivalent measurement against d2's own label font size — worth the same treatment here.

## Not done

- No screenshot secured yet (crop attempt timed out in the real-VS-Code harness three times in a
  row — the `.language-d2` locator screenshot needs a longer timeout or a scroll-into-view first).
- Not yet confirmed whether the width alone explains the "overlaps the box" complaint (`verified
  by`/`gate`) or whether that is ALSO a layout-spacing gap — see task 395, likely related but kept
  separate since the crowding also affects labels with no halo at all (task title text).
- No decision on the right width for d2's ~14.7px label font — needs the same 3/5/7-style
  measurement task 378 did, against d2 specifically (not copied from flowchart's number).

## Next step

Get a clean before/after screenshot at 1–2 candidate widths (`labelHalo()` in `d2-render.ts:1126`),
pick by the same pixel-diff method task 378 used, ship + version-bump (cache key includes the
extension version — a render-output change needs the bump, per `editor-config.ts`'s documented
contract) + unit/e2e coverage mirroring `d2-label-halo.spec.ts`.
