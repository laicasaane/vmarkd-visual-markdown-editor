# Task 235 — Checklist progress indicators

**Status:** planned · **Impact:** ⚪ low (PM, cheap & visible) · **Origin:** task 192 §9

## Problem

No rollup anywhere: a PM scanning a doc can't see "7/12 done" without counting checkboxes.

## Scope

- [ ] Per-section indicator: headings whose section (heading → next same-or-higher
      heading) contains task items get a small `7/12` badge (+ thin progress bar) rendered
      as a `data-render` decoration — counts nested items, live-updates on toggle/edit
      (drive from the same observer that styles task items, rAF-debounced).
- [ ] Doc-level rollup in the status bar next to the word count (reuse the task-223
      message shape — one `doc-stats` post covers both; coordinate if 223 lands first).
- [ ] Setting `vmarkd.tasks.progress` (default on — decoration-only, zero serialization
      impact); hidden when a section has no tasks.

## Out of scope

- Per-list inline badges (heading-level is enough v1), progress in the outline panel
  (nice follow-up — note only), history/burndown.

## Verification

- L1: counting unit — nested lists, tasks inside callouts/blockquotes, section boundary
  edge cases (setext, EOF).
- L2: badge renders with correct counts; click a checkbox → badge updates without a full
  re-render; `getValue()` byte-stable with the feature on.
- L3 real-VS-Code (mandatory): counts under the real pipeline + status-bar rollup text.
