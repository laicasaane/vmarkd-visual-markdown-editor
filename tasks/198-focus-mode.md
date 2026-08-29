# Task 198 — Focus mode (dim all but the current block)

**Status:** planned · **Impact:** ⚪ low · **Origin:** task 192 §2

## Problem

The other half of Typora's F8/F9 writing pair (typewriter = task 197). Nothing similar
exists (grep zen/focus-mode → 0).

## Scope

- [ ] Toggle (toolbar `…` panel entry + setting `vmde.editor.focusMode`, default off):
      non-current top-level blocks get a dim class; the block owning the selection stays
      full-opacity.
- [ ] Drive from the existing selectionchange infrastructure (the gap-paragraph /
      callout-nav pattern — memory: `:focus-within` FAILS in this DOM, use
      selection/selectionchange), rAF-debounced, attribute/class-only (Lute-safe — classes
      on Vditor's own block elements round-trip fine; do NOT inject wrapper nodes).
- [ ] CSS: opacity transition, `.vditor--dark` variant, excluded in Preview mode.

## Follow-up (added 2026-07-03): granularity enum

- [ ] After block-level ships, grow the boolean into `vmde.editor.focusMode`:
      `off | block | sentence | line` (Ghostwriter/iA offer exactly these). Sentence/line
      dim PART of a block → intra-block ranges: either the CSS Custom Highlight API
      (re-evaluate — the prior rejection in memory was for code COLOURING; pure
      opacity-dimming may be fine) or wrapLuteFlatten Lute-invisible spans (proven by
      wysiwyg-code-highlight). The one part touching the dual-node risk zone — same
      selectionchange driver, off the keystroke path.

## Out of scope

- Typewriter coupling (independent toggles).

## Verification

- L1: none meaningful beyond class-computation helper if extracted.
- L2: caret in block N → only N undimmed; move caret → follows; serialization unchanged
  (`getValue()` byte-stable with the toggle on — torture fixture).
- L3 real-VS-Code (mandatory): visual class state under injected CSS + mode switches;
  toggle off restores all.
