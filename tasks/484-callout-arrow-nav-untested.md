# Task 484 — `callout-nav.ts`'s arrow-into-a-collapsed-callout interaction has no test at any layer

**Status:** 📋 OPEN — found 2026-08-01 · **Impact:** 🟡 medium — a shipped caret-navigation
behaviour with zero regression coverage, in the subsystem this repo has historically broken most
often · **Origin:** found while extracting shared geometry out of the nav cluster for
[473](473-duplication-baseline.md); **pre-existing, not caused by that change** ·
**Related:** [473](473-duplication-baseline.md), [179](179-fix-callout-editing.md), ADR-0007 (caret
ownership).

## What was found

`media-src/src/editing/callout-nav.ts` implements `setupCalloutArrowNav` — ArrowDown/ArrowUp
stepping the caret across a **collapsed callout** (the void-block navigation shape, sibling to
`hr-nav.ts`'s step-across-an-`<hr>`). Searching for its coverage turned up nothing at either layer:

- **No unit test file.** There is no `callout-nav.test.ts`.
- **No real-VS-Code spec.** Every `callout*.spec.ts` in `test/vscode-e2e/` was grepped for
  `ArrowDown`/`ArrowUp` — none exercises this interaction. `callout-edit.spec.ts` covers *typing*
  inside a callout (task 179), not arrow navigation past one.

Its two siblings are covered: `hr-nav.ts` has a dedicated real-VS-Code test
(`hr-edit.spec.ts` — "ArrowDown/Up steps the caret across a void `<hr>`"), and
`gap-paragraph.ts`'s `setupTrailingNav` is covered by `trailing.spec.ts` / `bottom-gap.spec.ts`.
So this is a gap in one of three parallel implementations, not a deliberate layer-wide decision.

## Why it matters more than the raw number suggests

This repo's caret work is where regressions have actually shipped — see the EOF caret jump, the
code-block arrow-nav empty paragraph, the callout marker text-node split, the callout uneditability
in task 179. AGENTS.md requires a real-VS-Code e2e for any webview/renderer behaviour precisely
because that class of bug does not reproduce in the chromium harness.

An untested arrow-nav handler in that subsystem is the shape most likely to be broken silently by
an unrelated Vditor bump or caret refactor — and, because collapsed callouts are a niche state,
most likely to reach a user before anyone notices.

## Scope

- [ ] Add a real-VS-Code spec: caret adjacent to a **collapsed** callout, ArrowDown steps past it
      (and ArrowUp in the other direction), with the caret landing where `hr-edit.spec.ts` asserts
      for the `<hr>` case. Mirror that spec's structure — the two handlers are siblings and their
      tests should read as siblings too.
- [ ] Consider a `callout-nav.test.ts` for the parts that are unit-testable. Note that the pure
      geometry it used to carry (`caretLineRect`, `topLevelBlock`) now lives in
      `editing/nav-geometry.ts` and **is** unit-tested there as of
      [473](473-duplication-baseline.md) — so what remains untested here is specifically the
      handler decision logic (the guard preamble and the edge-detection tail), not the geometry.
- [ ] While writing it: confirm the behaviour is actually correct today. This task assumes the
      handler works and is merely untested — that assumption is itself unverified, and the spec is
      what would settle it. If it turns out to be broken, that is a bug finding, not a test task.

## Note

Recorded rather than fixed on the spot because adding coverage for an interaction is **new work**,
not part of the refactor that surfaced it — the refactor removed no coverage, there was none to
remove. Folding it in would have mixed a behavioural claim into a no-behaviour-change commit.
