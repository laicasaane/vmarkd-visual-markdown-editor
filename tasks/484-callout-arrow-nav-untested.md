# Task 484 — `callout-nav.ts`'s arrow-into-a-collapsed-callout interaction has no test at any layer

**Status:** ✅ CLOSED 2026-08-01 — real-VS-Code spec + unit suite both landed, behaviour confirmed
CORRECT (not a bug) · **Impact:** 🟡 medium — a shipped caret-navigation behaviour with zero
regression coverage, in the subsystem this repo has historically broken most often · **Origin:**
found while extracting shared geometry out of the nav cluster for [473](473-duplication-baseline.md);
**pre-existing, not caused by that change** · **Related:** [473](473-duplication-baseline.md),
[179](179-fix-callout-editing.md), ADR-0007 (caret ownership).

## Scope correction (found while writing the spec)

The scope line below said ArrowDown "steps past" the collapsed callout, by analogy with
`hr-nav.ts`. That was wrong — re-reading `callout-nav.ts`'s own header before writing the test
showed the DESIGNED behaviour is to **enter** the collapsed callout directly (expand the dual-node,
place the caret at its first/last editable position), never to step past it: "nothing ever moves
past it" (the file's own words). The real-VS-Code spec was written against that designed behaviour,
confirmed it holds (see Verification below), and is the correct baseline to regress against —
`hr-nav.ts`'s step-across-a-void-`<hr>` shape is a sibling in mechanism (keydown pre-empt + keyup
fallback), not in outcome.

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

- [x] Add a real-VS-Code spec: caret adjacent to a **collapsed** callout, ArrowDown/ArrowUp
      **enters** it (see the scope correction above — mirrors `hr-edit.spec.ts`'s STRUCTURE, not its
      outcome, since the two handlers land the caret differently by design).
      `test/vscode-e2e/callout-arrow-nav.spec.ts` + fixture `callout-arrow-nav.md` (paragraph /
      collapsed callout / paragraph). 2 tests, both directions.
- [x] `callout-nav.test.ts` for the unit-testable parts — the handler decision logic (guard
      preamble, keydown pre-empt, all 5 numbered keyup-fallback branches), with `expandMarker`
      mocked (its own class-adding side effect stubbed, per the module's header comment on what it
      does) so the tests exercise callout-nav.ts's own logic, not vendored Vditor internals. 25
      tests. 96.7% branch / 100% line coverage on `callout-nav.ts`; the 3 remaining branches
      (`caretLineRect` returning null, `onEdge` false, `topLevelBlock` returning null past an
      already-passed containment check) are unreachable in jsdom — no real layout engine, same
      documented boundary as `nav-geometry.test.ts`.
- [x] Confirmed the behaviour is correct today — **not a bug**. 6/6 real-VS-Code runs green across
      `--repeat-each=3` in both directions (ArrowDown enters at the first editable position,
      ArrowUp at the last). This settles the assumption the original scope flagged as unverified.

## Verification

- Unit: `npx vitest run --config test/vitest.config.ts media-src/src/editing/callout-nav.test.ts`
  — 25/25 green. Full unit suite (`npm test`) — 2598/2598 green (was 2573 before this task).
- Real-VS-Code: `xvfb-run -a npm --prefix test/vscode-e2e test -- callout-arrow-nav.spec.ts
  --repeat-each=3` — 6/6 green (per `[[vscode-e2e-focus-tests-are-flaky]]`, a caret+keyboard L3
  spec needs more than a single run as evidence). Sibling-regression check —
  `callout-edit.spec.ts`, `callout-rename.spec.ts`, `callout-popover-keys.spec.ts`,
  `callouts-mode.spec.ts`, `hr-edit.spec.ts` — 9/9 green, no regressions from touching this area.
- `npm run typecheck:vscode-e2e`, `npm run lint:ci` — clean.
- `npm run quality` — `check:coverage-modules` flagged `callout-nav.ts` as no longer 0%; pruned from
  `BASELINE_ZERO` in `scripts/check-coverage-modules.mjs` (its own header instructs pruning the
  moment a module gains coverage). `knip` FAILs on pre-existing, unrelated debt (not from this
  task — none of its findings reference callout-nav or the new spec/test files). The same
  quality run also flagged `diagram-zoom.ts` and `link-click-fix.ts` as prunable — those gained
  coverage from earlier commits in this branch, unrelated to 484; left as-is, out of this task's
  scope.
- Simplify pass (code-simplifier subagent) on the new unit test file: extracted a `setup(editor)`
  helper for the 15x-repeated `setupCalloutArrowNav` wiring, added explicit return types to two
  outlier helpers, named an inline ternary to match the e2e spec's equivalent. No assertions or
  semantics changed; e2e spec + fixture were already clean, left untouched. Still 25/25 green.

## Note

Recorded rather than fixed on the spot because adding coverage for an interaction is **new work**,
not part of the refactor that surfaced it — the refactor removed no coverage, there was none to
remove. Folding it in would have mixed a behavioural claim into a no-behaviour-change commit.
