# 368 — table arrow-nav no longer auto-scrolls the caret into view (harness spec red)

**Status: 🔍 OPEN — reproduced, cause not investigated. PRE-EXISTING.**

## Symptom

`media-src/e2e/keybugs.spec.ts:353` — "🟢 arrow nav through table cells keeps the caret on screen
(auto-scroll) (ir)" fails: after 30 `ArrowDown` presses through a 40-row table in a 500px-high
editor, the scroller's `scrollTop` is unchanged, i.e. the caret walks off-screen exactly as it did
before the fix that test was written to guard.

The rest of the harness suite is green (387 passed, 1 skipped).

## Not a regression from 365/366

Verified by stashing the working tree and rebuilding: it fails identically on the clean tree. It came
in earlier — bisecting it is the first step, since the test name marks it as a fixed bug that has
come back rather than an aspiration.

## Where to start

- The spec asserts a scroll on the nearest scrollable ancestor of the active mode element. Confirm
  first WHICH element that resolves to today; if the scroller moved (e.g. a wrapper gained
  `overflow-y`), the walk may simply be reading the wrong node and the product behaviour could be
  fine.
- Then check the caret-into-view path itself for tables.
