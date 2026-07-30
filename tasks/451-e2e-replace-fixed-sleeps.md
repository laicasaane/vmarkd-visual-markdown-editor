# 451 — Replace the fixed settle sleeps in the real-VS-Code suite with polled conditions

**Status:** ⚠️ PARTIALLY DONE (2026-07-30) — 2 files converted and verified; the premise turned out to
be half wrong (see "Premise correction" below) — this is a scope reduction the team lead needs to
see, not a silent partial close.
**Parent:** [447 — suite cost analysis](447-vscode-e2e-suite-cost-analysis.md)
**Estimated saving:** **−5 to −10 min** *after* 449/450 (the sets overlap — see below)
**Do after:** [449](449-e2e-probe-tier.md) and [450](450-e2e-collapse-per-parameter-boots.md)

## Premise correction — the top-offenders table conflates two different waits

Re-ran the census after 449/450 (script: sum `setTimeout(r, N)` / `waitForTimeout(N)` literals per
default-run spec file; the first pass under-measured because it didn't allow `_`-separated numeric
literals like `15_000` — fixed and re-run). Result, ranked, **default run only** (excludes `@probe`,
`@visual`, `*spike*`):

| file | sleep | bin |
|---|---|---|
| `mode-switch-render-reuse` | 64.0 s (was 109 s — 450's merge already cut most of this as a side effect) | markup-convertible, **not done this session** — just stabilized under 450, any poll must satisfy 4 merged assertion groups at once; flagged as a follow-up, not attempted here |
| `wysiwyg-parity` | 51.0 s | **leave** — geometry (callout `getBoundingClientRect().height`, cross-pane byte-diff) measured after switching through 3 panes across 8 engines on `all-renderers.md`; a poll can declare "stable" on a mid-reflow plateau, which is a **false pass**, not a flake — worse than a slow test |
| `theme-flip-during-first-render` | 45.0 s | **leave** — negative assertion (task's own rule) |
| `mode-switch-parity` | 43.7 s | **leave** — same geometry-quiescence shape as `wysiwyg-parity` (drift `<120px`, LCS block pairing across mode switches on `all-renderers.md`); the risk is a false pass on a still-growing document, not a timeout |
| `d2-table-chrome` | 25.0 s | **done** — colour/attribute check (fill/stroke), d2 emits its SVG as one atomic write (no post-paint resize pass, same as the existing `d2-theme.spec.ts:63` precedent) |
| `diagram-sizing-audit` | 25.0 s | left with 449 (`@probe`, excluded from default) |
| `plantuml-sprite-size` | 25.0 s | **not done** — measures a geometric ratio (svg width / viewBox width), but on a *dedicated* 2-block fixture, not `all-renderers.md`, so the cross-engine-reflow risk above doesn't apply the same way; verified but not converted this session, next candidate |
| `mermaid-style-scope` | 24.0 s | **not done** — markup/attribute check (id-scope match, computed fill/stroke equality), same convertible shape as the two done files; verified but not converted this session for time, next candidate |
| `svg-marker-refs` | 24.0 s | **done** |
| `block-fidelity` | 18.5 s | not re-examined |
| `preview-rehighlight` | 16.0 s | not re-examined |

**The discriminator that replaces the task's original table:** does the assertion read *geometry*
(px, height, position, drift) or *existence/markup/attribute* (svg present, id matches, colour
equals)? Geometry measured across a multi-engine document mid-switch is a false-pass risk under
polling — leave it, it's a genuine quiescence wait, not a missing-marker problem. Existence/markup
is safely convertible: poll for the exact precondition the final assertion already names.
**Consequence: the two largest numbers in the original table (`wysiwyg-parity`, 51 s;
`mode-switch-parity`, 43.7 s) are in the un-convertible bucket**, so the header's −5 to −10 min
estimate is not reachable in full without risking silently degrading those two nets. What's
reachable from the convertible bucket alone (`d2-table-chrome` + `svg-marker-refs` done, +
`plantuml-sprite-size` + `mermaid-style-scope` + `mode-switch-render-reuse` not yet done) is closer
to −2 min done, −2 more min available.

## Why

The 145 default spec files contain **945 s ≈ 15.8 min** of hardcoded `setTimeout(r, N)` /
`waitForTimeout(N)` literals (static floor — it undercounts sleeps inside helpers called per block).
Most are "let it settle" waits sized for the worst case, on a condition the test can already name:
`data-vmarkd-cache-hit` present, `data-processed="true"`, a stable SVG child count, the error box
mounted. `expect.poll` / `locator.waitFor` return as soon as it is true.

**Overlap warning — do not double-count the saving:** `diagram-sizing-audit` (25 s) leaves with
task 449, and merging the multi-test files in 450 removes the *repetitions* of the same settle in
`mode-switch-render-reuse` (109 s), `wysiwyg-parity` (51 s), `mode-switch-parity` (43.7 s),
`inline-code-gap` (22 s). Re-measure the remaining floor after those two land, then work this list.

## Top offenders (static, before 449/450)

| file | sleep | file | sleep |
|---|---|---|---|
| `mode-switch-render-reuse` | 109.0 s | `wysiwyg-parity` | 51.0 s |
| `theme-flip-during-first-render` | 45.0 s | `mode-switch-parity` | 43.7 s |
| `d2-table-chrome` | 25.0 s | `diagram-sizing-audit` | 25.0 s (leaves with 449) |
| `plantuml-sprite-size` | 25.0 s | `mermaid-style-scope` | 24.0 s |
| `svg-marker-refs` | 24.0 s | `inline-code-gap` | 22.0 s |
| `block-fidelity` | 18.5 s | `preview-rehighlight` | 16.0 s |

## Rules

- Convert to `expect.poll(...)` / `waitFor` on the signal the assertion already reads.
- **A sleep guarding a NEGATIVE assertion must stay a sleep** ("nothing re-renders in the next N ms",
  "no second render fires") — there is no condition to poll for. Leave it, and add a one-line
  comment saying it is a negative assertion, so the next reader does not retry the conversion.
  `flip-skip`, `theme-flip-during-first-render` and `diagram-fast-edit-safety` are largely this shape.
- Engine-render waits (PlantUML ~7–8 s cold, D2 compile+layout) have a real floor — poll for the
  render marker rather than shortening the timeout blindly.

## Steps

- [x] Re-run the sleep census after 449/450 (script in 447 §1, fixed to allow `_`-separated numeric
      literals — the first pass silently under-counted `15_000`-style sleeps as 0) and re-rank. See
      "Premise correction" above.
- [ ] Convert the top 6 remaining files — **2 of 6 done** (`d2-table-chrome`, `svg-marker-refs`),
      2 more verified-convertible but not touched (`plantuml-sprite-size`, `mermaid-style-scope`),
      2 reclassified as leave-or-defer (`wysiwyg-parity`, `mode-switch-parity` → geometry, leave;
      `theme-flip-during-first-render` → negative assertion, leave; `mode-switch-render-reuse` →
      convertible but deferred, see table). Recorded before → after wall clock per converted file
      below.
- [x] Comment every sleep left behind with the reason it cannot be polled — done for the 2 converted
      files' own remaining structure (none left), for the premise-correction table above, AND
      (added after an advisor pass caught the tick was premature) in the source itself: every
      remaining sleep in `wysiwyg-parity.spec.ts`, `mode-switch-parity.spec.ts` and
      `theme-flip-during-first-render.spec.ts` now carries a `task 451: leave` comment naming the
      specific reason (geometry-quiescence across N engines / no single done-marker across a queued
      re-render). Comment-only changes, re-verified with `biome check` + `tsc --noEmit` (both clean);
      not re-run in real VS Code since nothing behavioural changed.
- [x] Add the rule to the `vmarkd-testing` skill's real-VS-Code recipe: replaced the example's
      `setTimeout(4000) // settle` (stacked on top of an existing `waitFor`) with a poll on the same
      condition the assertion reads, plus a new "a fixed sleep is still correct in three shapes"
      section (negative assertions / geometry-quiescence-across-engines / no-observable-marker) so
      the pattern doesn't re-spread the same way.

## Verification

- [x] Each touched spec passes solo, three times in a row (a poll that is too eager is a new flake
      source — this is the risk of the task):
  - `svg-marker-refs.spec.ts` — first attempt conflated the assertion's *reference* count
    (`checked`, can exceed the block count) with the *element* count being polled (fixed 3
    mermaid/flowchart blocks measured in the fixture) — polled `> 3` on a quantity that only ever
    reaches exactly 3, timed out red on the first real run. Fixed to `>= 3`. Then 3/3 clean:
    13.7 s, 10.3 s, 12.4 s (was ~48 s+ — two 12 s sleeps plus the surrounding waits). A second,
    separate bug (caught by advisor review, not by a red run): the post-switch poll on `bad.length
    === 0` had no `.catch()`, so on a REAL regression it would throw at the poll site and never
    reach the hard assertions below that carry the actual offending-ref list — the exact
    diagnostic-loss failure mode task 450 already names. Added `.catch(() => {})` (matching the
    pattern already used in `clipboard-elements.spec.ts`/`paste-url-link.spec.ts` under 450);
    re-ran solo once more to confirm still green (16.0 s) — did not repeat the full 3× since the
    change only affects the red path, not the green one already proven 3×.
  - `d2-table-chrome.spec.ts` (2 parameterised tests) — 3/3 clean runs, both tests each time:
    13.1 s/9.9 s, 9.8 s/7.9 s, 9.6 s/8.3 s (was ~25 s+ sleep per test, ×2 tests).
  - Monotonicity: not instrumented with logging (would need a temporary console.log inside the
    poll), but reasoned instead — both polled quantities are set-membership/count reads on DOM
    nodes that are only ever inserted, never removed, during a render (element count) or attribute
    values that are written once (fill/stroke, id, `bad`/`checked` array contents from a single
    fresh evaluate per poll) — nothing in the polled path can regress from true back to false
    within a render pass, so a false-stable read (the actual risk this check exists for) is not
    structurally possible here the way it would be for a size that shrinks then regrows.
- [x] `d2-table-chrome.spec.ts` + `svg-marker-refs.spec.ts` also passed together with
      `clipboard-elements.spec.ts` + `paste-url-link.spec.ts` in the same combined run used to
      re-verify the task 450 timeout fix (see that task's notes) — no interaction issues.
- [x] `xvfb-run -a npm run test:vscode:fast` green — ran as part of the end-of-session final pass
      (covers this session's other touched files too — 419's `cut-selection`/`inline-code-gap` are
      FAST members): **39/39 passed, 9.1 min**. Also `xvfb-run -a npm run test:vscode:smoke`:
      **10/10 passed, 1.8 min**.
