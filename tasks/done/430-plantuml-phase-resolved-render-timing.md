# Task 430 — Phase-resolved PlantUML render timing (queue wait · import · expand · engine · post)

**Status:** done — measurement infrastructure shipped, gated off by default · **Impact:** 🟡 med (every future PlantUML perf claim is currently unfalsifiable) · **Origin:** Codex PlantUML perf investigation (2026-07-28), next step #2

## Problem

Every number we quote about PlantUML performance comes from a **different fixture, a different run, and
a different instrument**:

- ~2.2 s for a minimal C4 render, and 2,573 ms → 2,225 ms (−14 %) for the stdlib trim — task
  [349](349-plantuml-edit-perf.md).
- ~90 % of that inside `TimLoader.load`, from a CDP profile in a **plain chromium page**, with a noted
  ~3× console-serialisation inflation vs the real webview — task
  [352](352-plantuml-render-cost-rebuild-cache.md).
- 0.9–1.15 s first block, 530–775 ms engine parse, 30–50 ms warm simple diagram — task
  [139](139-plantuml-perf-loading.md).
- 7.7–10.8 s cold vs 1.5–2.0 s warm for five diagrams — task [348](348-plantuml-render-cache.md).
- ~150 ms from the debug-log strip — task [351](351-plantuml-engine-debug-log-strip.md).

None of these are comparable, and none of them can be re-derived cheaply after a change. The practical
consequence: an improvement in one phase can be swallowed by noise or by a regression in another, and
nobody can tell — the only end-to-end signal we have is "the whole thing took N ms".

Nothing in the tree closes this gap:

- `media-src/src/plantuml-render.ts` has **zero** timing instrumentation — no `performance.now()`, no
  logging at all (unlike `edit-activity.ts` / `stream-render.ts`, which do use `performance.now`).
- `test/vscode-e2e/perf-timeline.spec.ts` is a **different axis**: it polls the webview DOM every 100 ms
  on `all-renderers.md` to see *when code colouring lands relative to diagram rendering* (task 145
  follow-up). It counts `.language-plantuml svg` appearing — it cannot resolve anything inside a single
  render, and 100 ms polling is coarser than several of the phases we care about. It is the right
  **pattern** to copy (a MEASUREMENT spec with a trivial assertion so it never gates CI), not a
  duplicate of this work.

## Scope

- [x] Instrumented `renderPlantumlBlock` / `plantumlRender` with `performance.now()` marks around the
      five phases (`plantuml-timing.ts`'s `PumlTiming` accumulator, wired into `plantuml-render.ts`):
      1. **queue wait** — `start('queueWait')` at enqueue (`plantumlRender`'s loop, right before chaining
         onto `renderQueue`), `end('queueWait')` at the top of `renderPlantumlBlock`;
      2. **engine import** — wraps the `loadPlantumlEngine` call; confirmed non-zero only on a cold load
         (measured ~350-620ms cold vs 0ms warm-reuse) — and, per the task 429 finding, ALSO non-zero on
         the block immediately after a `renderedIsClass`-triggered discard (measured ~425-500ms), which is
         exactly the "makes a 429 misread visible here" join this task predicted;
      3. **stdlib expand** — wraps `loadStdlib` + `expandStdlibIncludes`; 0 when the block has no stdlib
         include (the block is skipped entirely), small (~1-4ms) on a warm stdlib map vs ~25-80ms cold;
      4. **engine render** — wraps the `renderFn()` call through the `MutationObserver` settle (ended in
         `check()`, or in the 5s fallback — a `settledBy: 'observer' | 'fallback'` field on the record
         tells the two apart so a wedge doesn't misreport as a slow render);
      5. **post-process** — wraps `themeOnce()`'s body (`removeDiagramLoading` + `scalePumlSvg` + the
         note; `themePumlSvg` too when `PUML_POST_RENDER_THEMING` is back on) — whatever post-render work
         actually runs today, not a fixed list.
      Also records `engineKind` and `engineDiscarded` (whether `renderedIsClass`'s safety net fired for
      this block) on every entry — the task-429/430 join point.
- [x] Reported through `logToHost` (`plantuml-timing.ts`'s `recordPumlTiming`) — one line per block, never
      `console.log`.
- [x] Gated behind a `window.__vmarkdPumlTimingEnabled` flag the e2e spec arms via `addInitScript` before
      any webview document exists (no pre-existing debug switch to hook into). A normal session never
      constructs a `PumlTiming` at all — every call site is `timing?.start(...)`, so the only cost on a
      default open is one boolean read per block (`pumlTimingEnabled()`).
- [x] Exposed as `window.__vmarkdPumlTimings` — an ARRAY (not last-write-wins), since a document can hold
      many PlantUML blocks and a single overwritten global would only ever show whichever block finished
      last.
- [x] `fixtures/plantuml-timing-c4.md` (two C4 blocks, same stdlib, different text) + MEASUREMENT spec
      `test/vscode-e2e/plantuml-phase-timing.spec.ts`: reports **cold** (block A, first-ever render),
      **engine-warm** (block B, same open, engine+stdlib-map already loaded), and **cache-hit** (close +
      re-open the SAME file within the same VS Code instance — the proven `abc-flip-cache-hit.spec.ts`
      pattern, since `VMARKD_E2E` wipes the disk render-cache once per TEST, not per document open). The
      cache-hit pass gets a genuine `data-vmarkd-cache-hit` HIT (not the engine-warm fallback the task
      anticipated as the likely outcome) — `renderPlantumlBlock` is never entered on that path, so
      `__vmarkdPumlTimings` correctly stays empty: the cache path's cost relative to the five phases is
      exactly zero renderer work.

      **Observed contention, not breakage (recorded, not fixed — assertion left HARD, not softened):**
      this same pass produced `hits=2/2` reliably early in this session (verbatim: `[puml-timing]
      cache-hit pass: hits=2/2, timing records=[]`, several runs, including immediately after the task
      429 adversarial-review fix landed). Later in the same session, with more agents concurrently
      running their own `xvfb-run` VS Code e2e suites, the identical assertion started failing
      (`hitCount` 0/2) — reproducibly across 3 retries, and after widening the settle windows to match
      `abc-flip-cache-hit.spec.ts`'s proven 3s/2s timings. Diagnosed by running that OTHER, pre-existing,
      unrelated spec (`abc-flip-cache-hit.spec.ts` — not touched by this task) in isolation: it failed
      the identical way at the identical moment, which rules out anything in this task's or task 429's
      code (cache keying is by source-text hash, independent of PlantUML routing) and points at the
      shared render-cache disk store racing under concurrent agents. Left the assertion HARD rather than
      softened to accommodate it — a suspected environment problem is not a reason to make the test blind
      to a real future regression in the same path. Re-check once the tree is quiet.
- [x] **Naming decision** (per the repo-wide `*-probe.spec.ts` convention the `@probe` tier keys off):
      `plantuml-phase-timing.spec.ts` deliberately does NOT carry the `-probe` suffix. It is this task's
      actual deliverable — a reusable instrument meant to be re-run whenever a future PlantUML perf claim
      needs re-deriving, the same posture as `perf-timeline.spec.ts` (which it's explicitly modelled on
      and which also stays un-suffixed and in the suite) — not a one-off scratch probe written to answer
      one question and discarded. `plantuml-family-matrix.spec.ts` (task 429) also stays un-suffixed for
      a different reason: it's a real regression net (exact engine-load-count assertions, a pinned bug
      regression), not a measurement print.

## Out of scope

- Making anything faster. This task only makes the cost legible; the ranked levers stay where they are
  (task [412](412-generalize-diagram-viewport-gating.md) viewport gating, task
  [352](352-plantuml-render-cost-rebuild-cache.md) declined, tasks
  [139](139-plantuml-perf-loading.md)/[168](168-viewport-gate-initial-diagram-render.md) parked).
- A CI performance gate. Numbers vary too much across machines; this is a diagnostic, and the spec must
  stay non-blocking like `perf-timeline.spec.ts`.
- Generalizing the instrumentation to every engine. PlantUML first because it is the most expensive and
  the most-argued-about; other engines only if this shape proves useful.

## Verification

- [x] Unit tests for the phase accumulator (`plantuml-timing.test.ts`): start/end pairing, an unstarted
      phase reports 0 (not NaN/undefined), total is always the sum of the five phases (checked against a
      fake clock, not trusted on faith), a repeated `start()` before `end()` moves the open mark, `end()`
      with no matching `start()` is a no-op, plus `pumlTimingEnabled()`'s gate and `recordPumlTiming`'s
      window-array-append + log-line behaviour.
- [x] Real-VS-Code e2e: `plantuml-phase-timing.spec.ts` opens the C4 fixture, reads `__vmarkdPumlTimings`,
      and re-checks the arithmetic invariant against REAL webview numbers (not just the fake clock) —
      `queueWait+engineImport+stdlibExpand+engineRender+postProcess === total` on every record.
- [x] Confirmed inert when the flag is off — a second test in the same spec opens a plain fixture with NO
      `addInitScript` call and asserts `window.__vmarkdPumlTimings` is `undefined`. (No harness in this
      suite reads the real VS Code Output channel's content, so "no Output-channel lines" is verified
      structurally instead: `recordPumlTiming` — the only `logToHost` call site — is gated by the same
      `if (timing)` check that gates the window write, and the window write is the part directly tested.)
- [x] Re-derived the ~90% engine share (task 352's chromium-profile number): **83.0-86.4% across three
      runs** on the cold C4 block in the REAL webview (`engineRender / total`), consistent with 352's
      figure — no disagreement to report. Absolute numbers on this machine: cold total ~2.2-6.1s (noisy —
      shares a CPU with the rest of the VS Code test process), engine import ~350-960ms cold vs 0ms warm.

## Cross-task payoff (task 429)

This instrument is what made task 429's engine-load-count finding legible rather than just "loads=2,
looks fine": `plantuml-family-matrix.spec.ts`'s second test arms this gate and reads `engineDiscarded`
directly off the record instead of re-deriving it with a second circled-icon detector, proving a
`renderedIsClass` false-positive (bare "A"/"C"/"I"/"E" word in a wrapped label) costs a real ~425-500ms
`engineImport` on the FOLLOWING non-class block — the exact ~550ms task 139/429 predicted for a discard,
now measured instead of assumed. See task 429's Finding section for the bigger issue this audit surfaced
(the `object`-keyword `isClassSource` miss) and the secondary `renderedIsClass` finding this instrument
pinned.

## Related

Tasks [349](349-plantuml-edit-perf.md), [352](352-plantuml-render-cost-rebuild-cache.md),
[351](351-plantuml-engine-debug-log-strip.md), [348](348-plantuml-render-cache.md),
[139](139-plantuml-perf-loading.md), [429](429-plantuml-engine-load-count-coverage.md).
Existing pattern: `test/vscode-e2e/perf-timeline.spec.ts`. Memory: `debug-metrics-to-Output-channel`.
