# Task 261 — Session writing goals (word-count target + progress)

**Status:** planned · **Impact:** ⚪ low, cheap · **Origin:** task 192 §10

## Problem

Counting exists (status bar: words + reading time) but there are no targets: Bear/Ulysses/
iA-class writers set a per-document goal and watch progress. Pure host-side arithmetic on
numbers we already compute every edit.

## Scope

- [ ] Goal source: front-matter key (`writing-goal: 2000`) or `vmarkd.writingGoal` setting
      (front-matter wins); status-bar item becomes `1 240 / 2 000 words` with a subtle
      progress affordance + tooltip showing session delta (words since open).
- [ ] Session delta tracked per document in memory; optional daily total in `globalState`
      (foundation for a later streak view — data only, no UI v1).
- [ ] Goal reached → one unobtrusive status-bar state change (no toast spam).

## Out of scope

- Streaks/history UI, per-project goals, character-based goals, deadlines.

## Verification

L1: goal resolution (front-matter vs setting) + delta arithmetic units (external modify
must not count as "written" — pin using the echo-suppression signal). L3: set a goal in
front-matter → status-bar text shows n/target and updates on typing.
