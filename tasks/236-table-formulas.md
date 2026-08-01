# Task 236 — Table formulas (sum/avg column) — evaluate-first

**Status:** planned — evaluate-first, park-able · **Impact:** ⚪ low (PM niche) · **Origin:** task 192 §9

## Problem

Spreadsheet-minded PMs ask for column sums in markdown tables. Nothing exists; the
question is whether a markdown editor should do this at all.

## Scope

- [ ] **Evaluate first (timeboxed):** adopt the org-mode/Advanced-Tables `<!-- TBLFM: -->`
      comment convention (interop, plain-markdown round-trip, invisible on GitHub) with a
      tiny subset: `sum`/`avg`/`count` over a column into a target cell. If the demo feels
      alien in vMarkd, PARK with the decision recorded here.
- [ ] If built: recompute on cell edit (the fix-table-ir edit events), write the computed
      value into the target cell as a normal model edit; the TBLFM comment is the source
      of truth and round-trips byte-stable (comments are already invisible in preview —
      keep that).

## Out of scope

- Full expression language, cross-table references, currency/format handling, a formula
  editor UI.

## Verification

- Evaluate exit: working demo + user decision (memory: show partial results for eval).
- If built — L1: formula parse/apply unit (column letters, empty/non-numeric cells);
  L2: edit a cell → target cell updates, `getValue()` carries value + comment; L3: one
  real-VS-Code leg with save fidelity.
