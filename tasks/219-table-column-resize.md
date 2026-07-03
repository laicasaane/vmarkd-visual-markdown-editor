# Task 219 — Table column resize by mouse (spike-first)

**Status:** planned — SPIKE first · **Impact:** ⚪ low · **Origin:** task 192 §5

## Problem

No mouse column resizing (`responsive-tables.ts` is only an overflow-scroll wrapper).
BUT: markdown pipe tables cannot store column widths — so the core question is the
persistence story, and it may kill the feature.

## Scope

- [ ] **Spike (timeboxed):** decide persistence: (a) visual-only per-session widths
      (cheap, lost on reopen — is that useful enough?); (b) an HTML comment sidecar
      (`<!-- vmarkd:cols 120,80,* -->` above the table — round-trip risk, pollutes the doc
      for other viewers); (c) don't build it (record the decision in this file and close).
      Bring the options to the user with a demo — do not pick silently.
- [ ] If (a)/(b): drag handles on header cell borders (min-width clamp, double-click
      auto-fit), widths as `col` styles; interplay with `#fix-table-ir-wrapper` panel and
      responsive overflow wrapper.

## Out of scope

- Row height, column reorder by drag, alignment (exists via panel/hotkeys).

## Verification

- Spike exit: a decision + demo GIF/screenshot for the user (memory: show partial results
  for eval).
- If built — L2: drag changes width, clamps, `getValue()` byte-stable in mode (a) / exact
  sidecar in (b); table panel + hotkeys unaffected. L3 real-VS-Code: one leg incl.
  round-trip through save.
