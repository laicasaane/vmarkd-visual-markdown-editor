# Task 314 — Live table VIEW controls: sort · filter · column stats (file untouched) [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled.

## What it is & the effect

In Preview and the sv right pane, every rendered table gets quiet header controls: click a
header to SORT, type to FILTER rows, a footer strip shows count/sum/avg/min/max for
numeric columns. **The markdown file is NEVER modified** — it's a lens, not an edit — with
an explicit opt-in "apply this sort to the file". A 40-row table stops being read-only
wallpaper and behaves like a tiny spreadsheet view.

## Why novel

Every markdown tool renders tables statically; Obsidian needs a plugin, Notion only sorts
its own database blocks. View-layer sorting of a PLAIN markdown table with byte-safe
opt-in writeback is shipped nowhere. Deliberately distinct from the backlog's 236 formulas
/ 219 ops — those EDIT the file; this only views it.

## Feasibility on our assets

Preview panes are inert DOM we already scope features to; sorting = `<tr>` reorder +
overlay; the opt-in write reuses splitRowCells + cell-level minimal-diff writeback (60/61)
so untouched cells keep exact bytes. One hard constraint: stays OUT of the editable IR
surface (reordering there would fight writeback).

## Honest value

High daily value for data-heavy notes; low risk; medium demo. A natural pairing release
with 313 (numbers layer).

## Decision

- [ ] **ADOPT**
- [ ] **PARK** — reason: _______
