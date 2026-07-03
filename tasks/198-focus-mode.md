# Task 198 — Focus mode (dim all but the current block)

**Status:** planned · **Impact:** ⚪ low · **Origin:** task 192 §2

## Problem

The other half of Typora's F8/F9 writing pair (typewriter = task 197). Nothing similar
exists (grep zen/focus-mode → 0).

## Scope

- [ ] Toggle (toolbar `…` panel entry + setting `vmarkd.editor.focusMode`, default off):
      non-current top-level blocks get a dim class; the block owning the selection stays
      full-opacity.
- [ ] Drive from the existing selectionchange infrastructure (the gap-paragraph /
      callout-nav pattern — memory: `:focus-within` FAILS in this DOM, use
      selection/selectionchange), rAF-debounced, attribute/class-only (Lute-safe — classes
      on Vditor's own block elements round-trip fine; do NOT inject wrapper nodes).
- [ ] CSS: opacity transition, `.vditor--dark` variant, excluded in Preview mode.

## Out of scope

- Sentence-level focus, typewriter coupling (independent toggles).

## Verification

- L1: none meaningful beyond class-computation helper if extracted.
- L2: caret in block N → only N undimmed; move caret → follows; serialization unchanged
  (`getValue()` byte-stable with the toggle on — torture fixture).
- L3 real-VS-Code (mandatory): visual class state under injected CSS + mode switches;
  toggle off restores all.
