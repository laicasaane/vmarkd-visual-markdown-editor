# Task 169 — Yield a frame between native diagram renders on the open burst (spike-first)

**Status:** ❌ **KILLED / WONT-FIX (2026-07-05, spike done).** The spike falsified the premise: the native
`EditMode.ts` `.forEach(processCodeRender)` burst does **not** starve hljs colouring and is **not** one
synchronous block a yield could break up. The real freezes are individual heavy renders → that's task 182
(off-thread), not this. Evidence below; the original TODO plan is kept underneath for the record.

## Spike result (real VS Code, headless — measured 2026-07-05)
Two fixtures, longtask `PerformanceObserver(buffered)` + rAF-heartbeat installed as early as the webview
frame was evaluatable, polled the code-colour/diagram timeline:

| | native-burst (10 mermaid + 2 echarts + 2 code) | all-renderers (~15 mixed incl D2/plantuml) |
|---|---|---|
| IR content visible (`.vditor-ir__node`) | @257 ms | **@48 ms** |
| hljs code COLOURED | @257 ms | @1349 ms (interleaved, not last) |
| longtasks during open | 4 | **21** |
| max longtask / rAF max-gap | 466 ms / 566 ms | 726 ms / 738 ms |

**Why KILL (all three of the task's own kill criteria hit):**
1. **Premise false — colouring is NOT starved.** Code colours at 257 ms (native-burst) / interleaved at
   1349 ms (all-renderers), never last-behind-all-diagrams. hljs is not waiting on the native burst.
2. **Perceived first-paint IS masked** (the task says: if so, kill). IR content is on screen at 48–257 ms —
   the inline-init (task 38) + prerender teaser (task 50) paint the doc long before the diagram burst.
3. **The `forEach` is NOT one synchronous block a yield would split.** The open burst is already spread
   across **21 separate longtasks** (mermaid/echarts render async, so the loop kicks off work that resolves
   across many tasks). A single synchronous batch would show ONE ~3 s longtask, not 21. The residual
   freezes are individual heavy renders (466–726 ms EACH — one mermaid layout / one D2 WASM compile);
   yielding *between forEach iterations* cannot split a single render.

**Where the real cost is (and the right lever):** the per-render main-thread block (~0.5–0.7 s each) →
**task 182 (off-thread diagram render)** is the only thing that removes it. 169 (reschedule the loop) can't.
Reproduce: a longtask/heartbeat probe over an open of a native-heavy fixture (throwaway spec + fixture used
for the spike were removed; pattern mirrors `perf-timeline.spec.ts`).

---

## (Original TODO plan — kept for the record; superseded by the KILL above)
**Status was:** TODO (big / **spike-first** — confirm the native loop blocks the critical path before committing to the M-effort esbuild patch; the originally-proposed fix site was **wrong**, relocated below).
**Source:** vMark perf analysis (2026-06-28, 39-agent workflow `wf_19aa433d-4fa`).
**Value / Risk:** 🟨 medium (lets hljs colouring + paint interleave during a multi-diagram open burst) / 🟡 medium (esbuild patch on a Vditor seam + caret/scroll contract).
**Engines:** native-deferred (mermaid/echarts/graphviz/…).

## Problem (and the corrected diagnosis)

The custom-engine family already yields a frame between renderers (`custom-diagrams.ts:840-856`,
added by task 145 to stop synchronous renders starving hljs colouring — comment quantifies ~4.8 s on
a 15-diagram doc). The **native** open burst is the unthrottled analogue: it loops
`.vditor-ir__preview[data-render='2']` calling `processCodeRender` back-to-back **synchronously**
with no yield, so on a multi-mermaid/echarts doc the main thread is blocked through all layouts
before code colouring paints.

> **The candidate originally pointed at `deferIrDiagramRender` (`edit-activity.ts`) — that is the
> wrong path.** That hook is esbuild-wired only into Vditor's `ir/input.ts` (the per-INPUT/typing
> loop, `esbuild-shared.mjs:960-961`); on open no `input` event fires, `markEditActivity` sets
> `isTyping()` in capture phase (`edit-activity.ts:310-314`), and the line-269 not-typing branch
> effectively never runs on open. The **real** open-burst native loops are in Vditor:
> - `EditMode.ts:69-71` — `setEditMode(vditor,'ir',afterRender)` (via `initUI.ts:81`) on open;
> - `index.ts:330-335` — `setValue`, used by the streaming/refresh path (`main.ts:534`).
> Neither is patched (`patchIrDeferDiagramRender`'s anchor is `ir/input.ts`-only; `String.replace`
> per-file scope leaves `EditMode.ts`'s identical loop untouched).

## Spike (do this FIRST)

Write a **real-VS-Code open-perf spec** (`test/vscode-e2e/`, extend `perf-timeline.spec.ts`) on a
multi-mermaid/echarts doc and confirm the native loop actually blocks the critical path **before
interactivity** — and that the **task-38 inline-init + the prerender teaser don't already mask** the
perceived first-paint latency. If they do, **kill this** (the perceived win is already captured by
those). Promote to implementation only if the spike shows the synchronous native burst is the real
stall.

## Plan (if the spike confirms)

Add a **new** esbuild patch wrapping the **`EditMode.ts:69-71`** native loop to `await` a frame
between `NATIVE_DEFER` (mermaid/echarts/graphviz/…) renders, mirroring `custom-diagrams.ts:840-856`.

## Constraints
- **The `setValue` path (`index.ts:330-335`) is wrapped by `preserveCaretAndScroll` (`main.ts:534`)
  which assumes a SYNCHRONOUS `setValue`** — making its inner loop async/frame-yielding breaks that
  contract (caret/scroll restore fires before renders land). Likely: leave `setValue` sync, or
  restore caret after the burst settles. The pure-open `EditMode.ts` path is lower-risk (caret at
  top).
- Keep the keep-last-overlay semantics consistent with the typing path.
- Lute round-trip + CSP/Worker untouched (only render **scheduling** changes; engines stay
  main-thread). No `Date.now`/`Math.random`.

## Verification
- The spike's perf spec is the gate (and proves it's not already masked).
- **Real-VS-Code e2e (MANDATORY)** if shipped: multi-diagram open still renders all diagrams, caret
  at expected position, no scroll jump; hljs colouring paints during (not after) the burst.
- Keep `custom-diagrams-render` + streaming specs green. `tsc` + `biome` + vitest + Playwright,
  headless. Verify coverage + the esbuild patch's anchor-drift assert.

## See also
- **Note the overlap with task 168** (viewport-gate the initial render): 168 *skips* offscreen
  diagrams (removes CPU), 169 only *spreads* the visible burst across frames (reschedules). If 168
  lands, much of 169's burst shrinks to the visible set — consider sequencing 168 first and
  re-measuring whether 169 is still worth it.
- `custom-diagrams.ts:840-856` (the precedent), `esbuild-shared.mjs` (`VDITOR_TS_PATCHES`,
  `patchIrDeferDiagramRender`), task 145 (the hljs-starvation finding), task 38 (inline init), task 50
  (prerender teaser).
