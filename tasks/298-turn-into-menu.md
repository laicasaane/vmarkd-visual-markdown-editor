# Task 298 — "Turn into" block transform menu

**Status:** planned · **Impact:** 🟡 med-high · **Surfaces in:** 285 bubble + 259 handle + 215 menu · **Origin:** task 192 §12

## What it is & the effect

Notion's staple, shipped by BlockNote as the FIRST element of its formatting toolbar: one
dropdown that converts the current block between paragraph / H1–H6 / quote / bullet /
ordered / task list / code fence / callout — "make this a heading" without touching
markdown syntax.

**Today in vMarkd:** block-type changes are scattered and partial — the heading popover
(WYSIWYG only) does levels, list toggles live in the toolbar, quote/callout/code
conversions mean hand-editing markers. There is no single "what is this block → make it
that" affordance (grep 'turn into' → zero; task 254 covers heading LEVELS only).
**After:** caret in any block → one menu → any block type; the transform is a clean model
edit, so undo is one step and serialization is exact.

## Scope

- [ ] Core = a pure `blockTransform(blockMd, targetType)` util: rewrite the leading
      markers/structure (para↔heading↔quote↔bullet↔ordered↔task↔fence↔callout), preserving
      inline content; multi-line blocks defined per pair (quote→para strips `> ` per line;
      para→fence wraps; fence→para unwraps losing lang — confirm-gated). Unit-test EVERY
      source→target pair — the matrix is the deliverable.
- [ ] Apply through the normal pipeline (re-spin, one model edit, one undo — the task-219
      col-ops pattern); with a multi-block selection (from 288), transform each.
- [ ] Surfaces: dropdown in the 285 bubble, click-menu on the 259 drag handle, entries in
      the 215 context menu, palette command with a quick-pick — ONE command core, four
      entry points.
- [ ] Current-type detection + checkmark; destructive pairs (→fence, callout→) get the
      lossy-note styling.

## Out of scope

- Turn-into for VOID blocks (diagram↔code is just the fence lang — cheap, include;
  table↔anything — exclude), Notion-style "turn into page" (that's 276 extract-to-note).

## Verification

L1: the full pair matrix (this is 80% of the work — be exhaustive, incl. nested list
items and callout bodies). L2: menu on each surface → `getValue()` exact per pair, caret
kept, one undo. L3 real-VS-Code: bubble-dropdown journey + save fidelity.
