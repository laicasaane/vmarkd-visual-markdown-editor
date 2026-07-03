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

## Column/row MOVE commands (added 2026-07-03 — independent of the resize spike, buildable now)

- [ ] takumii.markdowntable parity (~246K installs): **move column left/right** and
      **move row up/down** in the existing table panel + hotkeys — the Vditor panel only
      inserts/deletes/aligns; reordering a column in WYSIWYG today means retyping every
      cell. One model edit through the normal pipeline, pipe-escape aware, one undo step.
      No persistence question (unlike widths) — this half is NOT gated on the spike.

## Cell-range selection (added 2026-07-03, WYSIWYG audit — prosemirror-tables pattern)

- [ ] Drag across cells (or Shift+Arrow) selects a CELL RECTANGLE — the spreadsheet
      gesture users expect in tables. True multi-cell native selection is impossible in
      Chromium contenteditable (single-Range model), so do what prosemirror-tables does:
      a parallel fake-selection state painted as `.vmarkd-cell-selected` classes on
      existing td/th (class-only → Lute-safe). Ops over the range: Ctrl+C copies as TSV
      (text/plain) + markdown fragment, Delete clears cell contents, row/col insert-
      delete applies to the range; Esc drops the range (fits 288's ladder).
- [ ] **Merge cells: deliberately NEVER** — rowspan/colspan is not representable in GFM
      pipe tables (Toast UI resorts to custom syntax); record so nobody re-litigates.

## Out of scope

- Row height, column reorder by drag, alignment (exists via panel/hotkeys), merge cells
  (see above — permanent).

## Verification

- Spike exit: a decision + demo GIF/screenshot for the user (memory: show partial results
  for eval).
- If built — L2: drag changes width, clamps, `getValue()` byte-stable in mode (a) / exact
  sidecar in (b); table panel + hotkeys unaffected. L3 real-VS-Code: one leg incl.
  round-trip through save.
