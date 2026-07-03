# Task 256 — Table formatter in sv/source mode (prettify pipes)

**Status:** planned · **Impact:** ⚪ low, near-free · **Origin:** task 192 §10 (probe-verified)

## Problem

Probe: IR round-trips auto-pad tables (implicit normalization on save), but
`SpinVditorSVDOM` keeps messy pipes VERBATIM — sv edits save unformatted. Users of
Markdown Table Prettify expect "format table" exactly on this raw-pipe surface. Tasks
218/219 are different (paste-import / visual widths).

## Scope

- [ ] Command `vMarkd: Format table` (palette + 215 context menu, sv-focused but works in
      any mode): run the caret's table block through Lute Md→Md (the normalizer exists per
      the probe) with caret restore; alignment rows and escaped `|` preserved by the
      engine (pin).
- [ ] Optional `Format all tables` variant; block-scoped minimal diff.

## Out of scope

- Format-on-type, column resize (219), CSV import (218).

## Verification

L1: normalize unit on messy fixtures incl. escaped pipes + full-width chars. L2: sv command
→ padded pipes in source + right pane unchanged semantically, caret kept. (L3 optional —
no webview-only mechanics; fold a leg into an sv spec when touched.)
