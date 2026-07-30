# Task 218 — CSV/TSV paste → markdown table

**Status:** ✅ **DONE (2026-07-30)** · **Impact:** ⚪ low · **Origin:** task 192 §5

## Result

Rides the ONE pre-Vditor transform point built for [task 242](242-ansi-paste-strip.md), exactly as
this task's scope required ("build the hook once"). ANSI stripping runs first, then the table sniff —
ordered so an escape sequence sitting between two tabs cannot break the column count.

**Decision on the `ask` mode, which this task asked to "decide + pin": no `ask`.** An inline
toast/choice on every spreadsheet paste is a lot of machinery to make the common case slower. The
false-positive risk is not uniform across delimiters, so the setting's axis is *which delimiter is
trusted*, not *whether to interrupt* — `vmarkd.paste.csvAsTable`:
- `tsv` (default) — tab-separated only. A 2+ column, 2+ row tab-separated block is spreadsheet data;
  prose does not contain aligned tabs.
- `always` — also comma-separated. Opt-in, because two lines of comma-ful prose genuinely match.
- `off` — never.

**Context guard.** The transform runs BEFORE Vditor's own `codeElement` branch exists, so the code
context is computed at the patch site using Vditor's own two expressions and passed in. A paste into
a fence stays literal (the 191 P0-9 contract) — without this a TSV paste would build a markdown
table *inside a code block*. This is the one thing a unit test cannot cover (no vditor, no real
caret), so it is asserted in the real editor.

Escaping: a `|` in a cell becomes `\|` (it would otherwise end the column early) and a newline
inside a quoted field is flattened to a space (it would end the ROW). Both are silent corruptions
otherwise. Ragged blocks are REJECTED rather than padded — guessing would invent cells the user
never wrote. Caps: 200 rows, 50 columns, 200 KB.

**Verified red-then-green:** L1 `paste-table.test.ts` (22 cases — quoted fields containing the
delimiter, doubled-quote unescaping, tab preferred over comma when both are present, plus the
rejection matrix: single line, single column, ragged, comma-ful prose, empty delimiters, over-cap,
CRLF) and 5 more in `paste-transform.test.ts` for the code-context skip and the ANSI→sniff ordering;
L3 `test/vscode-e2e/paste-table.spec.ts` asserts both halves in one boot. Disabled, the L3 fails
3/3.

One thing the L3 taught: Lute re-serialises the table with padded columns (`| name  | qty |`), so
the spec asserts the collapsed form — pinning exact spacing would pin Lute's formatter rather than
the behaviour under test.

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
