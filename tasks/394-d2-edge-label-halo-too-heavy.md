# 394 — D2 edge-label halo reads as a thick hand-inked outline, not an invisible gap

**Status: ✅ DONE (2026-07-28), shipped in `a614663`.** Found 2026-07-27 while the user reviewed the
`all-renderers.md` d2 blocks in the real editor (tasks 375–378 visual review).

**Outcome — the root cause was COLOUR, not width.** The halo was painted in
`--vscode-editor-background` (the editor UI colour) instead of the PAGE surface a named content
theme actually paints, so on github-light it was a DARK halo on white — which is what read as a
"thick hand-inked outline". Fixed by a new `--vmarkd-page-bg` token that each named theme publishes
for itself, falling back to the editor background for `auto`. Unit + harness (5 themes) +
real-VS-Code e2e, RED→GREEN verified both ways. No stroke-width tuning was needed after all.
(Header left stale until 2026-07-29 — the fix landed, this line did not.)

## Report

> "d2 taki rodzaj napisow na vscode light odpada" (the `api -> server: request` edge label) — text
> reads as sketchy/hand-drawn with what looks like a scribble through it.
>
> On a second block, the `verified by` / `gate` edge labels visibly overlap the node boxes above
> them with a bold black outline (`|md` pipeline diagram, `snippet -> pipeline.checklist: verified
> by` and `notes -> ship: gate`).

## Screenshot confirmation + colour evidence (2026-07-28) — this task's premise needs correcting

The screenshot this task was waiting for now exists. The user re-reported the SAME label
(`verified by`, the `|md` pipeline diagram) on a **light** editor theme:

> "labelka na jasnym ma otoczkę, powinna mieć kolor labelek w boxach"

What the screenshot shows: the glyphs are unreadable — a dark, heavy outline fuses the letters into
a blob straddling the boundary between the grey code-block panel above and the white page.

**This contradicts the "not a colour mismatch" inference below.** A halo painted in the CANVAS
colour on a light theme should be near-white and therefore invisible; what is on screen is dark.
Width alone does not explain a *dark* halo on a *light* background — a too-thick halo in the right
colour reads as an over-wide white gap, not a black outline. So there is a colour fault here in
addition to (or instead of) the width fault this task was opened for. **Do not start by re-tuning
`stroke-width` — establish the colour first**, or you will tune a number that was never the cause.

Established so far, by reading and by test:
- The halo colour comes from `labelHalo()` (`d2-render.ts:1125-1128`):
  `sty.bg ?? 'var(--vscode-editor-background, transparent)'`. For the editor-paired palettes
  `pairedTheme` sets `bg: undefined`, so the `var()` branch is the live one, and
  `d2-render.test.ts:1046` pins that.
- **Ruled out — `var()` failing in an SVG presentation attribute.** The obvious suspect was that
  CSS custom properties don't substitute in presentation attributes (only in declarations), which
  would drop `stroke` and let an inherited dark stroke through. **Tested in headless Chromium:**
  `<text stroke="var(--vscode-editor-background, transparent)">` computes to `rgb(255,255,255)`,
  identical to a literal `#ffffff`, with `stroke-width` intact. Chromium substitutes it fine. This
  candidate is dead — do not spend time on it again.

Remaining candidates, and what distinguishes each (pick by measuring the LIVE element in the real
webview — read `getComputedStyle(labelEl).stroke` and `.paintOrder`, not the source):
1. **`--vscode-editor-background` resolves to a dark value at that point in the DOM** (or is
   undefined there, so the `transparent` fallback applies and something else supplies the dark
   stroke). Distinguisher: the computed `stroke` is dark, or is `none`/`transparent` while the blob
   is still visible.
2. **`paint-order` is not taking effect**, so the 4px stroke paints OVER the fill instead of under
   it — that turns any halo into an outline around hollow glyphs regardless of colour. Distinguisher:
   computed `paint-order` is not `stroke`, or the glyph interiors are lighter than the edges.
3. **Stale cached SVG** with a dark `sty.bg` baked in from a render under a dark theme. The
   file-header comment claims the halo is "resolved at PAINT time", but that is only true on the
   `var()` branch — a catalog `d2-*` theme bakes a literal hex that a theme flip cannot re-resolve.
   Distinguisher: the computed stroke is a literal dark hex, and the fault disappears after a cache
   wipe / version bump but returns on a theme flip.
4. **Halo painted against the wrong surface** — the label overlaps the code-block panel (visible in
   the screenshot), which is a different grey than `--vscode-editor-background`. This cannot produce
   a *dark* halo on a light theme on its own, so it is a contributor to visible-ness at most, not
   the cause. Ties into task 395 (the overlap itself).

Note the user's own framing points at [task 421](421-d2-edge-label-color-match-node-label.md) as
well: they want the label to take the node-label colour. 421 covers the FILL; this task covers the
halo. Both touch the same two emit sites (`d2-render.ts:1147`, `:1742`) — do them in one pass.

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

- ~~No screenshot secured yet~~ — **secured 2026-07-28** (user-supplied, light theme, `verified by`).
  See the colour-evidence section above. The crop attempt in the real-VS-Code harness had timed out
  three times (the `.language-d2` locator screenshot needs a longer timeout or a scroll-into-view
  first); that harness gap is still open if an automated before/after diff is wanted.
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
