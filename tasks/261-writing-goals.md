# Task 261 — Session writing goals (word-count target + progress)

**Status:** planned · **Impact:** ⚪ low, cheap · **Origin:** task 192 §10

## Problem

Counting exists (status bar: words + reading time) but there are no targets: Bear/Ulysses/
iA-class writers set a per-document goal and watch progress. Pure host-side arithmetic on
numbers we already compute every edit.

## Scope

- [ ] Goal source: front-matter key (`writing-goal: 2000`) or `vmde.writingGoal` setting
      (front-matter wins); status-bar item becomes `1 240 / 2 000 words` with a subtle
      progress affordance + tooltip showing session delta (words since open).
- [ ] Session delta tracked per document in memory; optional daily total in `globalState`
      (foundation for a later streak view — data only, no UI v1).
- [ ] Goal reached → one unobtrusive status-bar state change (no toast spam).

## Follow-up (added 2026-07-03, Ghostwriter parity): document + session statistics panel

- [ ] One on-demand stats view (status-bar click → QuickPick, or a tab beside the outline
      panel): document = words/chars/sentences/paragraphs/pages estimate + a Flesch-class
      readability NUMBER; session = active time, words written, average WPM (derived from
      this task's session-delta data). Host-side arithmetic only; reuse task 262's
      sentence segmentation (Intl.Segmenter) so the two never disagree. Schedule AFTER
      261/262 land — they build all the inputs.

## Out of scope

- Streaks/history UI, per-project goals, character-based goals, deadlines.

## Verification

L1: goal resolution (front-matter vs setting) + delta arithmetic units (external modify
must not count as "written" — pin using the echo-suppression signal). L3: set a goal in
front-matter → status-bar text shows n/target and updates on typing.
