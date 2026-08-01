# Task 475 — `echarts-theme.spec.ts`'s live-flip test asserted a pre-task-412 contract

**Status:** 🟢 **FIXED and verified red→green, 2026-07-31.** Follow-up audit (same day) triaged the 13
other specs flagged below: `d2-content-theme-flip.spec.ts` and `retheme-flip-matrix.spec.ts` (test 1)
were the same class and are now fixed the same way; the other 11 don't need it (10 have no live flip
at all, 1 — `plantuml-theme-flip.spec.ts` — has a small fixture that already fits the viewport but
turned out to have a different, real task-412 regression, left open). See "Follow-up audit" below.
Not a regression from today's uncommitted work (tasks 454/466) — confirmed pre-existing at HEAD via a
clean git worktree. Root cause: task 412's viewport gate (`diagram-retheme.ts`'s `gateAndRender` /
`viewport-gate.ts`) defers
a live theme re-render for any diagram outside the ±200px viewport margin until it actually scrolls
into view. `echarts-theme.spec.ts`'s `chart + mindmap background follows a live light->dark flip`
test (added 2026-06-14, `e1982cf`) opens `all-renderers.md` — a long, many-diagram fixture where both
the echarts chart and the mindmap sit far below the fold at document-top — flips the theme, and reads
the corner pixel WITHOUT ever scrolling either diagram into view. Task 412 (`d887361`, 2026-07-30)
generalized the (pre-existing, mermaid-only) viewport gate to the echarts/mindmap path a month after
this test was written, and nothing updated the test for the new scroll-gated contract. The gate has
worked as designed since 412 landed; this test alone kept asserting the old "always eager" behaviour.

· **Impact:** 🟢 test-only, no product bug. · **Origin:** discovered while triaging a report of a
"deterministic failure, nobody owns it yet" against the working tree — team-lead asked whether it was
caused by today's uncommitted echarts work (tasks 454/466). **Fixed:** 2026-07-31.

## How this was found

Team-lead reported `echarts-theme.spec.ts:172` failing deterministically —
`expect(after.chart).toBe('18,19,20')` received `'255,255,255'` (the LIGHT background survives a
light→dark flip) — and asked to determine whether tasks 454 (echarts `data-code` stamping rework) or
466 (source-resolver consolidation into `diagram-surfaces.ts`) caused it, both of which touch this
exact code path in the uncommitted tree.

**Pre-existing, not a regression — proven with a worktree.** `git worktree add tmp/echarts-flip-head
HEAD` (a0d6ccc, no uncommitted work), symlinked `node_modules` / `media-src/node_modules` /
`test/vscode-e2e/node_modules` / `test/vscode-e2e/.vscode-test` back into the main tree (relative
symlink depth is easy to get wrong across 2–4 directory levels — verify with `readlink -f` before
trusting a build), built, and ran the same spec: **identical failure**, same received value
`255,255,255`. HEAD predates both task 454 and task 466 entirely (they're uncommitted), so this rules
out both as the cause. Worktree removed and `git status` confirmed clean after (no stray directories
left in the tree).

## Mechanism (measured, not guessed)

Instrumented `reRenderEcharts` (`echarts-retheme.ts`) and the echarts branch of `rethemeDiagrams`
(`diagram-retheme.ts`) with a temporary `window.__vmarkdDebugEcharts` event log (reverted before
finishing — see "Verification"), then read it back via a throwaway diagnostic spec after the same
flip sequence the failing test uses:

1. `rethemeDiagrams`'s echarts branch DID fire: the resolved spec was correctly the dark theme
   (`backgroundColor: "#121314"`, i.e. `18,19,20`), the signature-skip gate correctly saw a changed
   signature, and `collectLangCandidates` + `collectMindmapCandidates` found exactly 2 candidates
   (the chart + the mindmap) — `candidateCount: 2`.
2. `reRenderEcharts` (the actual dispose+reinit) was **never entered** — its own start-of-function
   debug push never appeared in the log, even 4s after the flip.
3. Logging each candidate's `getBoundingClientRect()` at the moment `gateAndRender` partitions them
   showed why: `{ top: 1800, bottom: 2220 }` for the chart and `{ top: 2340, bottom: 2557 }` for the
   mindmap, against `window.innerHeight: 786`. `viewport-gate.ts`'s `isVisibleish` only treats an
   element as immediately-renderable when `r.bottom > -rootMarginPx && r.top < vh + rootMarginPx`
   (`rootMarginPx = 200`) — here `vh + rootMarginPx = 986`, and both candidates' `top` (1800, 2340)
   are far past that. Both are correctly classified as offscreen and registered on the shared
   `IntersectionObserver` instead of rendered immediately. Since the test's `evaluate()` calls never
   scroll the webview, the observer's intersection callback never fires, `reRenderEcharts` is never
   called, and the ORIGINAL (light-themed) canvas is exactly what the corner-pixel read sees —
   `255,255,255`, byte-for-byte the reported symptom.

This is design-correct behaviour for the gate (task 412's whole point: don't dispose+reinit every
offscreen diagram on every flip) meeting a test written before that behaviour existed.

## The fix

`test/vscode-e2e/echarts-theme.spec.ts`'s live-flip test now scrolls the chart, then the mindmap,
into view (`scrollIntoView({ block: 'center' })`) AFTER the flip — before the flip would be stale,
since the gate partitions candidates at flip time — mirroring the pattern
`retheme-preview-surface.spec.ts` already established for the other four gated engines (mermaid/
plantuml/wavedrom/d2). Also replaced the fixed `setTimeout(4000)` settle with `expect.poll` on the
actual corner-pixel condition (task 451's own convention: poll a real condition instead of guessing
how long dispose→`looseJsonParse`→`init`→`setOption` takes). No `media-src/src/` change was needed —
the retheme mechanism itself is correct; only the test's assumption was stale.

## Follow-up audit (2026-07-31) — the 13 flagged specs, triaged and resolved

The 13 specs named below were read in full against their fixtures (static: block count/position in
the fixture vs. the harness's ~786px window + 200px gate margin) and, for anything not confidently
callable from that alone, booted for real.

| spec | target | flip? | verdict | outcome |
|---|---|---|---|---|
| `d2-content-theme-flip.spec.ts` | all 12 D2 blocks (all-renderers.md §18, deep below fold) | config-changed | **AT RISK → BROKEN, FIXED** | see below |
| `d2-label-halo.spec.ts` | D2 labels, initial open only | none | SAFE | no flip in the spec at all |
| `d2-md-content-theme.spec.ts` | D2 `\|md\|` label, initial open only | none (config set pre-open) | SAFE | same |
| `d2-table-chrome.spec.ts` | D2 sql_table, initial open only | none (config set pre-open) | SAFE | same |
| `d2-theme.spec.ts` | first D2 svg, initial open only | none (config set pre-open) | SAFE | same |
| `plantuml-native-dark.spec.ts` | own small fixture, initial open only | none (config set pre-open) | SAFE | same |
| `plantuml-stdlib.spec.ts` | initial open only | none (config set pre-open) | SAFE | same |
| `plantuml-stdlib-more.spec.ts` | initial open only; the 2 tests that *would* touch a flip are `test.skip` (task 355 step 5) | none in the running test | SAFE | same |
| `plantuml.spec.ts` | first plantuml svg, initial open only | none (config set pre-open) | SAFE | same |
| `probe-cloudogu.spec.ts` | `@probe` tier, excluded from default run; no flip anyway | none | SAFE | same |
| `probe-pumlmode.spec.ts` | `@probe` tier, excluded from default run; no flip anyway | none | SAFE | same |
| `plantuml-theme-flip.spec.ts` | own 3-block fixture, workbench flip | **CANNOT TELL statically → booted** | small fixture DOES fit the viewport (no staleness) — found a **different**, real bug instead, see below | not fixed (out of this task's scope) |
| `retheme-flip-matrix.spec.ts` (test 1) | all 14 engine families across all-renderers.md | workbench flip ×2 | **AT RISK → BROKEN, mostly FIXED** | see below |
| `retheme-flip-matrix.spec.ts` (test 2, d2Layout cache scope) | — | config-changed (no diagram-position assertion) | SAFE | unaffected, still green |

Only 3 of the 13 needed a boot (the other 10 were callable from "no live flip in the test" alone,
which is a stronger and cheaper signal than measuring fixture geometry). Total: **8 real-VS-Code
boots** across those 3 specs (iterating on the fix), no full-suite run.

### `d2-content-theme-flip.spec.ts` — confirmed broken, fixed

Same mechanism as `echarts-theme.spec.ts`: `reThemeGeoAndD2` (`diagram-retheme.ts`) routes D2 through
`gateAndRender` too (task 412 generalized it there, same as mono/echarts), and this spec's 12 D2
blocks sit in `all-renderers.md`'s §18, far below the fold. Red on the clean tree: `compiles=1`
(should recompile ~all 12), palette never moved. Fixed the same way — scroll every `.language-d2`
element into view **one at a time, each followed by a short pause**, not a single bulk pass of
back-to-back `scrollIntoView` calls (measured: a bulk pass only got `compiles` to 4, not >11 — the
IntersectionObserver needs a beat at each scroll position to actually fire before the viewport moves
on) — then `expect.poll` on `__vmarkdD2RenderStats.compiles` instead of a fixed sleep (task 451).
Verified green twice (`compiles=14` both times, `#48a0c7` present, `#3d444d` gone, palette moved).

### `retheme-flip-matrix.spec.ts` test 1 — confirmed broken, staleness fixed, one separate pre-existing bug left open

Same class again, but comprehensive: this spec asserts census stability + a colour-digest change
across **all 14 diagram families** on `all-renderers.md` after **two** workbench flips, with zero
scrolling. Red on the clean tree: `d2AfterSecond - d2AfterFirst = 0` (nothing outside the fold
re-rendered on the real flip at all). Applied the same fix — scroll every diagram instance (not just
first-of-lang; several langs have >1 copy, e.g. 12 D2 blocks, 2 mermaid, 4 wavedrom) into view in
turn with a pause between each, before each flip's settle wait.

After that fix, the compile counter finally moves (`afterSecondFlip - afterFirstFlip = 13`), but the
assertion still fails — **expected 12, not 13**. This is a **separate, pre-existing bug in the test's
math, not a gate-staleness issue**: `drawnD2` is defined as `dark.out.d2.svgs` (12 — the fixture's
`sequence_diagram` D2 block is intentionally unrenderable and always falls back to raw source, so
only 12 of its 13 D2 fences ever produce an `<svg>`), but `d2RenderStats.compiles` in
`media-src/src/diagram-engines/d2.ts:204` increments once per block **handed to the engine**
(`compiles += blocks.length`), regardless of whether that block ends up with an svg or the loud
fallback — so a real flip recompiles all 13 blocks, not 12. The assertion is comparing "svgs drawn"
against "compile attempts issued" — two different counts — and would have been wrong the same way
before task 412 too (the pre-gate "eager" path also recompiled all 13 every flip). I did **not**
change this — confirmed with a throwaway local probe (swapping `drawnD2` for `d2Blocks` = 13, the
correct total-block-count) that the entire rest of the file — all 14 per-lang census-stability checks
*and* the colour-digest-changed assertion — passes clean once that one line is corrected, so the
scroll fix by itself is doing what it should. Reverted the probe; the file's only lasting change is
the scroll-before-flip fix, same shape as `d2-content-theme-flip.spec.ts`'s. **Flagging this
`drawnD2`/block-count mismatch for whoever owns this spec to decide the right fix** (compare against
`d2Blocks` instead, or exclude the always-falls-back block from the counter) — picking one is a
product-behaviour judgment call outside this audit's mandate.

### `plantuml-theme-flip.spec.ts` — NOT a staleness bug; a different, real task-412 regression

This one's fixture (`plantuml-theme-flip.md`, 3 small PlantUML blocks) genuinely fits inside the
viewport — booting it showed all 3 blocks correctly re-rendered in the new theme colour, so scrolling
would change nothing here. It fails on a **different** assertion: `stats.calls` (the
`__vmarkdPumlRethemeStats.calls` counter, incremented once per `reRenderPlantuml` call in
`plantuml-retheme.ts:88`) is `3`, not the expected `1`. Before task 412, `reThemeMono` called
`reRenderPlantuml` **once per flip**, and that one call internally redrew every visible plantuml
block in a batch (`reRenderLang`'s own loop). Task 412 restructured this to gate **per diagram**:
`gateAndRender`'s `renderOne` callback now calls `monoOrGeoRerender('plantuml')` — i.e.
`reRenderPlantuml` — **once per un-gated candidate**, each scoped to its own `blockScopeOf(target)`.
For 3 visible blocks that's 3 calls now, not 1. The *actual* correctness guarantee task 411's
"exactly once" guard existed to protect — no block gets cleared+redrawn **twice** in one flip (the
double-fire/thrashing bug) — still holds: `panesReRendered: 3 === total: 3`, i.e. each block was
redrawn exactly once, not twice. Only the **unit** the `calls` counter measures changed (batch-call
count → per-diagram-call count) as an architectural side effect of task 412, independent of whether
anything is stale. This is a real, load-bearing assertion that now fails on every viewport-fitting
multi-block PlantUML flip — **not fixed here** (out of this task's scope, and — same reasoning as
above — deciding whether `calls` should now mean something else, or whether `reRenderPlantuml`
should batch its candidates instead of firing once per gated candidate, is a judgment call for
whoever owns `plantuml-theme-flip.spec.ts` / task 412, not something to paper over silently).
- **Alternative fix NOT taken:** exempt echarts (and/or mindmap) from the viewport gate on cost
  grounds — a chart dispose+reinit is cheap compared to the gate's stated rationale (plantuml
  ~2.2s/render, D2 ~365ms/compile), so "always eager" might be a defensible product choice for this
  specific engine. That's a product call, not a bug fix, and is the user's/team-lead's to make — the
  test fix above is the conservative option that doesn't touch runtime behaviour.

## Verification

- [x] Real-VS-Code e2e, red→green, `node build.mjs` then
      `xvfb-run -a npx playwright test echarts-theme.spec.ts --retries=0 --reporter=list` from
      `test/vscode-e2e/`: **RED** on the clean (uninstrumented) tree — `chart + mindmap background
      follows a live light->dark flip` failed, `Expected: "18,19,20"`, `Received: "255,255,255"`, the
      other 3 tests in the file passed. **GREEN** after the spec fix — all 4 tests pass, run twice
      (once as the full file, once the live-flip test alone) with no flake.
- [x] Diagnostic instrumentation (`window.__vmarkdDebugEcharts` pushes in `echarts-retheme.ts` +
      `diagram-retheme.ts`) fully reverted before the final green run — `git diff` on both files
      matches exactly what task 454 already had, confirmed by diffing against the state read at the
      start of this investigation.
- [x] `npm test` (2407 tests, all green), `npm run typecheck`, local
      `./node_modules/.bin/tsc -p tsconfig.json --noEmit` (clean, no output), `npm run lint:ci`
      (642 files, clean — the whole tree, not scoped; no pre-existing warnings this time), and
      `./node_modules/.bin/biome format --write` + `biome check` scoped to the touched files before
      that (also clean).
- [x] No `media-src/src/`/`src/` change shipped — this task's only diff is
      `test/vscode-e2e/echarts-theme.spec.ts`. `tasks/454-echarts-preview-retheme-gap.md` is untouched
      by this task (it was already modified in the working tree by its own owner before this
      investigation started).
- [x] Cleanup: throwaway diagnostic spec (`test/vscode-e2e/zzdebug-echarts-flip.spec.ts`) deleted;
      `git worktree remove tmp/echarts-flip-head --force` run, confirmed absent from
      `git worktree list`; empty scratch dir removed.
