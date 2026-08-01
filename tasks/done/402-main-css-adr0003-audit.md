# Task 402 — Audit `main.css` growth against ADR-0003's own routing rule

**Status:** ✅ DONE (2026-07-27) · **Impact:** 🟡 med (CSS cascade discipline, currently unchecked) · **Origin:** Fable architecture review (2026-07-27)

**Result:** dated amendment added to ADR-0003 (`docs/adr/0003-css-theming-architecture.md`,
"Amendment 2026-07-27"). Precise git-commit baseline (`d89c53f`, the ADR's own commit):
1009 lines / 71 `!important` → now 1705 / 78 (**+69% lines, only +10% `!important`** — the
routing rule is working, growth is mostly new non-`!important` diagram-engine CSS). All 8
new `!important` declarations classified: 7 clean (VS Code neutralizers / our-own
anti-jank), 1 low-priority borderline case flagged (echarts/mindmap `height: auto
!important` arguably belongs in `patchVditorIndexCss` instead of `main.css` — not fixed,
just recorded as a candidate for whoever next touches that patch). Section-reorg
checklist item: confirmed **not new drift** — the 5-section reorganization was already an
open, unscheduled follow-up in ADR-0003 itself since 2026-06-13, still open. No `main.css`
rule was touched, so no visual-regression run was needed (audit-only, per the task's own
verification criteria).

## Problem

ADR-0003 (`docs/adr/0003-css-theming-architecture.md`, 2026-06-13) recorded `main.css`
at ~900 lines / ~62 `!important`, named the three irreducible-by-default `!important`
categories (VS Code injected-default neutralizers, IR/WYSIWYG edit-surface anti-jank,
layout/geometry/features), and gave a routing rule for every *new* styling need (token
vs. Vditor source-patch vs. `main.css`) whose explicit success criterion is that
`main.css` — and its `!important` count — **shrinks over time** as more things get
routed away from it.

Verified 2026-07-27: `main.css` is now **1705 lines / 78 `!important`** — line count
nearly doubled, `!important` count up ~26%. Six weeks of legitimate new theming work
(D2, PlantUML/Graphviz stdlib theming, diagram-engine additions) plausibly explains
most of this, and none of it has been checked against the ADR's own routing rule since
it was written. This isn't yet evidence of a broken rule — it's evidence nobody has
looked.

## Scope

- [x] Diff `main.css` against its 2026-06-13 state (used the exact ADR-0003 commit
      `d89c53f` as the precise baseline, not an approximation).
- [x] For each added `!important`, classified against the ADR's four-mechanism routing
      table — see the amendment for the full breakdown (7 clean, 1 borderline flagged).
- [x] Checked the 5-labeled-section structure: it never existed in the file (only one
      ad-hoc banner) — this was already an open ADR-0003 follow-up, not new drift.
- [x] Recorded findings as a dated amendment to ADR-0003 (`Amendment 2026-07-27`).
- [x] Data point for task 401: growth is legitimate and `!important`-growth (+10%) lags
      far behind line-growth (+69%) — i.e. CSS discipline is currently NOT the leading
      signal for a fork-trigger decision; the TS patch count (task 147/401) is still the
      more actionable metric. Noted in task 401 is left as a follow-up cross-reference —
      not edited here to keep this task's diff scoped to the CSS audit.

## Out of scope

- Wholesale `main.css` reorganization — only if the audit finds the section structure
  has genuinely drifted, and even then, prefer a follow-up task over doing it inline
  here.
- Changing the routing rule itself (ADR-0003's decision) — this task checks compliance
  with the existing rule, it doesn't revisit whether the rule is right.

## Verification

- [x] ADR-0003 has a dated amendment recording the audit's findings and the new
      baseline (line count / `!important` count as of this audit).
- [x] The one misrouted-candidate `!important` (echarts/mindmap `height: auto`) is
      recorded with a file:line-level description in the amendment — not fixed here
      (low priority, single narrowly-scoped rule, not a repeating pattern); a dedicated
      fix task was judged not worth filing on its own for this small an item.
- [x] N/A — no `main.css` rule was modified (audit-only), so no visual-regression run
      was required per this task's own verification criteria.
