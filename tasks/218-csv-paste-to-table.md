# Task 218 — CSV/TSV paste → markdown table

**Status:** planned · **Impact:** ⚪ low · **Origin:** task 192 §5

## Problem

Pasting spreadsheet data (TSV from Excel/Sheets, CSV) inserts plain text. Zero csv handling
anywhere (grep → 0). A common "paste from spreadsheet" affordance in markdown editors.

## Scope

- [ ] Detector in a pre-Vditor paste hook: `text/plain` (or the text/html-table case —
      Vditor already converts real `<table>` HTML, verify and leave that path alone) that
      parses as ≥2 columns × ≥2 rows with a consistent delimiter (tab first, then comma,
      quoted-field aware) → convert to a pipe table.
- [ ] Setting `vmarkd.paste.csvAsTable`: `ask | always | off` (default `ask` — a small
      inline toast/choice, since false positives on comma-ful prose are real; TSV can
      default to always-convert safely — decide + pin).
- [ ] Context guards: never inside code fences/sv-raw contexts (stays literal — the 191
      P0-9 contract); escape `|` in cells.
- [ ] One undo step; one edit post (the paste pipeline contracts from 191 apply).

## Out of scope

- Column type inference/alignment guessing, >100×100 guard beyond a size cap (cap + fall
  back to plain paste), CSV file drop.

## Verification

- L1: parser unit — delimiter sniffing, quoted fields, escaping, rejection matrix (prose
  with commas, single column).
- L2: paste TSV in ir/wysiwyg/sv → table renders + `getValue()` pipe table; inside a fence
  → literal; `ask` flow.
- L3 real-VS-Code: one leg — clipboard TSV + Ctrl+V → table persisted to disk.
