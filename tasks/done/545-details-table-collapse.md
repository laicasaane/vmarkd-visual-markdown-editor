# Task 545 — Collapse Markdown tables inside edit-mode details

**Status:** done — 2026-09-05 · **Impact:** 🟡 medium · **Origin:** Project Owner recording and investigation, 2026-09-04

## Problem

In IR/WYSIWYG edit mode, toggling a well-formed `<details>` region changed its chevron and hid
ordinary body blocks, but Markdown tables inside the region remained visible. The details
controller correctly projected `data-vmde-details-hidden`; `fixResponsiveTables()` defeated it by
writing inline `display: table !important`, which outranked the disclosure stylesheet's
`display: none !important`.

## Scope

- Keep responsive tables rendered as tables while a disclosure is open.
- Let the existing details hidden-state rule collapse tables with the rest of the body.
- Preserve table sizing, wrapping, source bytes, native Preview behavior, and unrelated table flows.
- Add a production-wiring regression containing prose, tables, and fenced code in the details body.

## Implementation

- [x] Add a failing unit regression proving responsive normalization does not override an important
      hidden-state rule.
- [x] Add failing Chromium and real-VS-Code details regressions with Markdown tables.
- [x] Remove only the `important` priority from responsive tables' inline `display: table`; retain
      the existing width/table-layout normalization and Vditor source CSS patch.
- [x] Verify focused unit, Chromium, real-VS-Code, coverage, build/type/budget, and local quality
      gates; record the environment-blocked network audit honestly.

## Acceptance

- [x] Closed edit-mode details hide prose, tables, and fenced blocks in IR and WYSIWYG.
- [x] Opening restores the tables with computed `display: table` and preserves exact Markdown.
- [x] Native full Preview still uses browser details behavior.
- [x] No unrelated responsive-table behavior or source fidelity changes.

## Completion evidence

The responsive-table normalizer still writes `display: table`, but at normal inline priority. Its
existing important width, max-width, min-width, and table-layout normalization remains unchanged.
That lets the existing details `display: none !important` state win while collapsed and lets the
patched Vditor/base table display render normally when open.

- RED: the new unit assertion received `table` instead of `none`; Chromium failed in both IR and
  WYSIWYG on a visible table carrying `data-vmde-details-hidden`; the no-retry real-VS-Code journey
  failed on the same visible hidden-marked table.
- GREEN: focused unit/details coverage passes 11/11; the focused responsive-table coverage report
  covers the changed line and reports 85.5% lines for the module.
- Chromium: the complete details suite passes 11/11; the full suite passes 603 with 5 intentional
  skips.
- Real VS Code 1.129.0: the expanded IR/WYS/native-Preview details journey passes 1/1 with no retry.
  The routine FAST tier exits green with 57 passed and two unrelated configured-retry flakes
  (`clipboard-collapsed` selection cut and immediate save-after-revert).
- Build, lint, webview/strict/VS-Code-e2e typechecks, bundle budget (607/608 KB), and startup budget
  (294/294 modules) pass.
- The aggregate quality run passed brand, lint, knip, jscpd, dependency boundaries, and—after the
  process sandbox was lifted—full coverage (259 files / 3,749 tests) plus the 13-module ratchet.
  `npm audit` remains unrun to completion: the sandbox could not reach npm (`EAI_AGAIN`), and the
  requested unsandboxed aggregate rerun was denied because it would disclose dependency metadata.
  No dependency or lock files changed.
