# Task 430 — Phase-resolved PlantUML render timing (queue wait · import · expand · engine · post)

**Status:** planned — measurement infrastructure, not a user-facing fix · **Impact:** 🟡 med (every future PlantUML perf claim is currently unfalsifiable) · **Origin:** Codex PlantUML perf investigation (2026-07-28), next step #2

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

- [ ] Instrument `renderPlantumlBlock` / `plantumlRender` with `performance.now()` marks around the five
      phases that actually exist in the code path:
      1. **queue wait** — enqueue → start of engine work (`renderQueue`, `plantuml-render.ts:846` +
         the chaining at `:997-1000`);
      2. **engine import** — `loadPlantumlEngine` (only non-zero on a cold load or a safety-net discard,
         which makes a task [429](429-plantuml-engine-load-count-coverage.md) misread visible here);
      3. **stdlib expand** — `expandStdlibIncludes` + lib-map load (`plantuml-stdlib.ts:105`);
      4. **engine render** — the `render()` call up to the `MutationObserver` settle;
      5. **post-process** — `themePumlSvg` + sprite/DOM fixups.
- [ ] Report through `logToHost` (`media-src/src/webview-log.ts`) so the breakdown lands in the vMarkd
      Output channel, per the standing "debug/metrics to the Output channel, not the devtools console"
      rule — **not** `console.log`.
- [ ] Gate it behind the existing debug/diagnostic switch (or a `window.__vmarkd*` flag the e2e sets) so
      a normal session pays nothing. Timing that costs render time is self-defeating.
- [ ] Expose the last breakdown on `window` (e.g. `__vmarkdPumlTimings`) so an e2e can read structured
      numbers instead of scraping log text.
- [ ] Add a fixed C4 timing fixture + a MEASUREMENT spec (modelled on `perf-timeline.spec.ts`: prints the
      breakdown, asserts only that it is non-empty) that reports **cold** and **warm** (cache-hit) runs
      of the same source, so the cache path is measured on the same fixture as the live path.

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

- [ ] Unit test for the phase accumulator itself (phases sum to the total, a skipped phase reports 0),
      so the arithmetic isn't trusted on faith.
- [ ] Real-VS-Code e2e (webview-affecting, per AGENTS.md): open the C4 fixture, read
      `__vmarkdPumlTimings`, assert all five phases are present and the total is within a sane bound of
      the wall-clock render the spec itself measures.
- [ ] Confirm the instrumentation is inert when the flag is off — assert `__vmarkdPumlTimings` is absent
      and no Output-channel lines are emitted on a default open.
- [ ] Re-derive at least ONE historical number (the ~90 % engine share on a C4 block) with this
      instrument in the **real webview**, and record it here — if it disagrees with task 352's chromium
      profile, that disagreement is itself the finding (352 flags the ~3× console inflation caveat).

## Related

Tasks [349](349-plantuml-edit-perf.md), [352](352-plantuml-render-cost-rebuild-cache.md),
[351](351-plantuml-engine-debug-log-strip.md), [348](348-plantuml-render-cache.md),
[139](139-plantuml-perf-loading.md), [429](429-plantuml-engine-load-count-coverage.md).
Existing pattern: `test/vscode-e2e/perf-timeline.spec.ts`. Memory: `debug-metrics-to-Output-channel`.
