# 451 — Replace the fixed settle sleeps in the real-VS-Code suite with polled conditions

**Status:** DONE, all 7 candidate files converted where safe and verified clean (2026-07-31) — 2
from the prior session (`d2-table-chrome`, `svg-marker-refs`) + 5 this session
(`mode-switch-render-reuse`, `plantuml-sprite-size`, `mermaid-style-scope`, `block-fidelity`,
`preview-rehighlight`). `block-fidelity` is PARTIALLY converted: 3 of its 4 sleeps converted clean,
but the pre-mode-switch settle had to be put BACK after a poll-based fix passed 28/28 solo yet still
flaked once in a 39-test FAST-tier run — see its section below for the full investigation and why
the sleep is now empirical, not understood. 3 other files deliberately LEFT as sleeps with reasons
recorded in-source and here (`wysiwyg-parity`, `mode-switch-parity`,
`theme-flip-during-first-render`). The premise turned out to be half wrong from the start (see
"Premise correction") — the reachable saving is smaller than the original estimate, a scope
reduction the team lead needs to see, not a silent partial close.
**Parent:** [447 — suite cost analysis](447-vscode-e2e-suite-cost-analysis.md)
**Estimated saving:** **−5 to −10 min** *after* 449/450 (the sets overlap — see below)
**Do after:** [449](449-e2e-probe-tier.md) and [450](450-e2e-collapse-per-parameter-boots.md)

## Session 2 (2026-07-31) — the 4 files assigned as follow-up

Measured before/after with a `git show HEAD:<path> > <path>` swap (real baseline, not inferred from
the removed sleep literals), converted version restored after each measurement. Every converted
file also run with `--repeat-each=3` before being called done — this repo has measured
focus/timing specs at 1/4 pass on identical runs (see the `vscode-e2e-focus-tests-are-flaky`
lesson), so n=1 green is not evidence.

| file | before (solo) | after (solo) | `--repeat-each=3` | status |
|---|---|---|---|---|
| `mode-switch-render-reuse` | 1m47.8s (32.4s + 1m11.1s) | 21.3s (8.3s + 8.8s) | 6/6 pass, pair-times 20.1s/20.4s/17.5s | **done** |
| `plantuml-sprite-size` | 31.7s | 8.4s | 3/3 pass, IDENTICAL geometry every run (125×142 / 348×240) | **done** |
| `mermaid-style-scope` | 41.3s | 8-11.6s (first run 21.1s was a cold VS Code re-resolve) | 3/3 pass, 11.6s/10.0s/9.1s | **done** |
| `block-fidelity` | 43.4s (solo) | ~34s (solo, 3 of 4 sleeps converted; the 4th put back) | 12/12 solo + 39/39 in FAST tier with the mode-switch settle restored | **done (partial conversion)** |
| `preview-rehighlight` | 16.0s (solo) | 7.0s (solo) | 6/6 pass across two `--repeat-each=3` runs | **done** |

**`mode-switch-render-reuse` gotcha (write this down, it will cost the next person an hour
otherwise):** the fixture `all-renderers.md` has **13** d2 fences, but only **12** ever produce an
`<svg>`. The 13th is `shape: sequence_diagram`, which is NOT faithfully renderable by our
dagre/ELK layout and deliberately falls back LOUDLY to raw source (never a silently-wrong
picture) — see the fixture around line 651. A poll target of `d2: 13` hangs forever; the file's own
header comment already says "12 Preview d2 blocks" for the same reason. Target is `d2: 12`.

**`plantuml-sprite-size` — converted despite reading like the geometry-quiescence bin, and why
that's still correct:** the final assertions DO read `getBoundingClientRect()` (px), which looks
exactly like the `wysiwyg-parity`/`mode-switch-parity` shape the discriminator says to leave. But
the thing being POLLED is not that geometry — it's `data-vmarkd-scaled="1"`, an attribute
`scalePumlSvg` (`media-src/src/diagrams/plantuml/plantuml-render.ts`) stamps as the LAST step of a
synchronous, one-shot width/height-attribute write, for the vector block. The sprite block skips
that pass entirely (it themes itself — see the fixture's own comment), so its raw engine-emitted
width/height are written once on insertion and never touched again; "found, nonzero box" IS its
finished state there. Also unlike `wysiwyg-parity` this is a DEDICATED 2-block fixture with no mode
switching — no other diagram's reflow to race against. Corroboration: 3/3 repeat-each runs measured
the IDENTICAL svg dimensions (125×142 sprite, 348×240 vector) — a mid-reflow false-pass would show
some variance across runs; it didn't. Read the implementation to find the actual completion signal
rather than polling the assertion's own value and hoping — that is what makes this a conversion and
not a guess.

**`block-fidelity` — 3 of 4 sleeps converted and clean; the 4th (pre-mode-switch settle) put back
after a poll-based fix proved insufficient. DONE as a partial conversion, not fully converted.** 4
tests. Converted and holding: `waitForInitialRender` (initial-render readiness via `pre code` + the
TYPE-HERE anchor paragraph), the per-mode-switch POST-switch readiness poll (anchor text findable
in the new mode's DOM), and the post-keystroke writeback settle (polling
`vscode.workspace.textDocuments` for the typed suffix, since the writeback debounce is 250ms —
`edit-sync.ts` — so the removed 2500ms sleep was a 10x margin).

The deciding experiment (baseline via `git show 0404227~1:test/vscode-e2e/block-fidelity.spec.ts`
into a scratch copy under `test/vscode-e2e/tmp-baseline-block-fidelity.spec.ts` — testDir-scoped,
NOT `<repo>/tmp/`, since Playwright only discovers specs inside `testDir`; deleted immediately
after each measurement) found a genuine conversion-caused regression, not pre-existing flake:
tallied across several batches, the first fully-converted version flaked 1/11 attempts on the
WYSIWYG mode-switch test vs. 0/29 baseline attempts, including a same-shape full-file
`--repeat-each=3` baseline run (the exact run configuration that had produced the one converted
failure) staying clean 12/12.

**Mechanism narrowed, cause NOT identified.** `waitForInitialRender` going from a blind 1500ms
sleep to a poll (resolving much sooner than 1500ms) makes the subsequent mode-switch toolbar click
fire sooner. The failure symptom is a LOST click, not a slow one — `.vditor-wysiwyg`/`.vditor-sv`
never appears and the `.waitFor` times out on a *permanently hidden* element (60+ polls over 30s,
element present the whole time, never shown). First attempt: added `waitForModeToolbarReady` — a
poll for the edit-mode toolbar panel + `button[data-mode="…"]` both existing in the DOM before
dispatching the click. This passed 28/28 clean across two solo `--repeat-each` batches, looked
fixed, and was reported as such — but a subsequent `xvfb-run -a npm run test:vscode:fast` run (39
tests, different load/sequencing than the file run solo) flaked on the SAME test again, proving the
DOM-presence poll was not gating the actual cause. Read `EditMode.ts` (vendored vditor) to check
the three obvious candidates and ruled out all three: `setEditMode`'s early-return guard
(`vditor.currentMode === type`) cannot fire on a document's first switch; the panel-open click
handler calls `stopPropagation()`, so it cannot be an outside-click-closes-the-panel race;
`dispatchEvent` on a CSS-hidden button still runs its listener synchronously, so DOM
presence/visibility isn't the gate either. **The actual cause is unidentified.** Given the
poll-based fix demonstrably did not work, reverted just that one settle: `switchToWysiwyg` and
`switchToSv` each keep a 1500ms sleep immediately before the mode-switch click
(`MODE_SWITCH_CLICK_SETTLE`, commented with this whole investigation so nobody re-attempts the same
poll without tracing the click→`setEditMode` path first). Re-verified: 12/12 solo
(`--repeat-each=3`, full file) AND 39/39 in `test:vscode:fast` (0 flakes), the same run
configuration that had exposed the poll-based fix's failure.

**Measured (solo, single run each)**: baseline 43.4s (4 tests) → converted (3/4 sleeps, one
restored) ~34s (4 tests, estimated from the repeat-each batch: 1.5min/12 ≈ 7.5s avg × 4 tests +
mode-switch settle overhead not separately isolated).

**`preview-rehighlight` — converted, verified clean, DONE.** Classified as markup/attribute
(`.hljs` class stamp + a code→div swap), not geometry, so convertible under the task's own rule —
but with a real hazard worth recording: `preview.render()`'s `highlightRender` chains through
`addScript(...).then(() => addScript(...).then(() => {...}))` even when the scripts are already
loaded, so "the class landed" is never available on the same tick, and the custom-diagram scheduler
(`findBlocks`, `diagram-kit/diagram-dom.ts`) swaps the fixture's `d2` fence's `<code>` for a `<div>`
via a MutationObserver + `requestAnimationFrame`, not synchronously either — two independent async
pipelines racing against the same `pre > code` selector the assertion reads.

Converted all 3 sleeps to completion-marker polls (not the assertion's own span-count value, so a
real regression still surfaces as a hard assertion failure, not a poll timeout):
- initial 8000ms (post `.vditor-ir` appearing) → poll for IR's code block carrying `.hljs`
  (`code-source.ts` stamps it directly on the IR marker's own `<code>`) AND the d2 fence rendered
  to an `svg` (real async-compile floor, per this task's own rule — poll the render marker, don't
  guess a shorter delay).
- per-visit 5000ms (post toggle-into-Preview) → poll for exactly one `pre > code` left in the
  preview pane (the d2 `<code>` has been swapped to a `<div>` by then) carrying `.hljs`. This is a
  STRUCTURAL end-state poll, immune to the count/order race a `pre > code.hljs` read could hit
  mid-swap (transiently matching both the js block and the still-`<code>` d2 block).
- per-visit 3000ms (post toggle-back-to-edit) → poll for the edit pane's own `style.display` flip,
  the one thing the *next* toggle-to-Preview click depends on — same "poll the click's own
  precondition, not a fixed margin" fix that resolved `block-fidelity`'s flake above.

**Measured**: solo 16.0s → 7.0s. `--repeat-each=3` run twice (6 attempts total): 6/6 pass
(6.2s–11.6s per run).

## Premise correction — the top-offenders table conflates two different waits

Re-ran the census after 449/450 (script: sum `setTimeout(r, N)` / `waitForTimeout(N)` literals per
default-run spec file; the first pass under-measured because it didn't allow `_`-separated numeric
literals like `15_000` — fixed and re-run). Result, ranked, **default run only** (excludes `@probe`,
`@visual`, `*spike*`):

| file | sleep | bin |
|---|---|---|
| `mode-switch-render-reuse` | 64.0 s (was 109 s — 450's merge already cut most of this as a side effect) | **done (session 2)** — markup/attribute-existence (svg/canvas/leaflet present per known block count), see Session 2 for the `d2:12` gotcha |
| `wysiwyg-parity` | 51.0 s | **leave** — geometry (callout `getBoundingClientRect().height`, cross-pane byte-diff) measured after switching through 3 panes across 8 engines on `all-renderers.md`; a poll can declare "stable" on a mid-reflow plateau, which is a **false pass**, not a flake — worse than a slow test |
| `theme-flip-during-first-render` | 45.0 s | **leave** — negative assertion (task's own rule) |
| `mode-switch-parity` | 43.7 s | **leave** — same geometry-quiescence shape as `wysiwyg-parity` (drift `<120px`, LCS block pairing across mode switches on `all-renderers.md`); the risk is a false pass on a still-growing document, not a timeout |
| `d2-table-chrome` | 25.0 s | **done** — colour/attribute check (fill/stroke), d2 emits its SVG as one atomic write (no post-paint resize pass, same as the existing `d2-theme.spec.ts:63` precedent) |
| `diagram-sizing-audit` | 25.0 s | left with 449 (`@probe`, excluded from default) |
| `plantuml-sprite-size` | 25.0 s | **done (session 2)** — LOOKS like geometry (svg width / viewBox width) but the poll targets `data-vmarkd-scaled="1"`, a completion marker, not the px value itself — see Session 2 for the full reasoning |
| `mermaid-style-scope` | 24.0 s | **done (session 2)** — markup/attribute check (id-scope match, computed fill/stroke equality) |
| `svg-marker-refs` | 24.0 s | **done** |
| `block-fidelity` | 18.5 s | **converted, not yet clean (session 2)** — see Session 2 |
| `preview-rehighlight` | 16.0 s | not yet examined (session 2 scope, queued) |

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
- [x] Convert the top 6 remaining files — **7 of 7 convertible files done**: `d2-table-chrome`,
      `svg-marker-refs` (prior session); `mode-switch-render-reuse`, `plantuml-sprite-size`,
      `mermaid-style-scope`, `block-fidelity`, `preview-rehighlight` (this session). 3 reclassified
      as leave (`wysiwyg-parity`, `mode-switch-parity` → geometry-quiescence across N engines;
      `theme-flip-during-first-render` → negative assertion), each with an in-source `task 451:
      leave` comment naming the reason. Before → after wall clock per converted file recorded
      above (Session 2 table).
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
