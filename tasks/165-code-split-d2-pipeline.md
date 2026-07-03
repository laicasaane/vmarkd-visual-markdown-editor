# Task 165 — Code-split the D2 layout pipeline out of the eager bundle

**Status:** ✅ DONE (2026-07-03). D2 pipeline code-split out of main.js + a new startup-cost gate.
**Source:** vMark perf analysis (2026-06-28, 39-agent workflow `wf_19aa433d-4fa`).
**Value / Risk:** 🟨 medium (removes ~109 KB / 23% parse + top-level module-eval from editor startup for every non-D2 doc) / 🟢 low (proven IIFE-bundle precedent; D2 render is already async-gated).
**Engines:** D2 (and its bundled dagre).

## Outcome (2026-07-03)

**Result:** `main.js` **484 → 379 KB (−106 KB / −22%)**; the whole cluster (dagre + d2-render + d2-refine +
elk-layout + astar + d2-geometry) is now the lazy **`media/vditor/dist/js/d2/d2-main.js` (108.5 KB)** and is
**verified absent from `main.meta.json`** (grep = 0). Eager module count 200. A non-D2 doc never fetches it.

- **`d2-entry.ts`** (new) — IIFE assigning `window.__vmarkdD2 = { renderD2Graph, renderD2GraphElk,
  canvasMeasure, unsupportedReason, d2Theme }`. Mirrors `elk-entry.ts`; main-thread, no Worker.
- **`build.mjs`** — new `d2Options` esbuild block (IIFE, outfile `js/d2/d2-main.js`), added to both build paths.
- **`custom-diagrams.ts`** — the static d2-render/elk-layout value-imports became a **type-only**
  `window.__vmarkdD2` (`typeof import(...)`), so no dagre lands in main.js; `renderD2()` reads the engine off
  a **cached `loadD2Engine(cdn)` promise**.
- **`scripts/check-startup-cost.mjs`** (new gate, wired into `package.json` + CI) — guards **eager module
  count ≤ 230** + **largest eager module ≤ 34 KB** (both deterministic, from the metafile). This catches a
  heavy engine leaking back into main.js even under the size ceiling's slack. NOTE: a direct parse-TIME probe
  was tried and dropped — V8 lazy-parses function bodies, so `vm.Script(main.js)` measures ~0 ms; the module
  graph is the faithful, non-flaky proxy for the top-level-eval boot cost.
- **`check-bundle-size.mjs`** — main.js ceiling lowered **525 → 430 KB**; new **`d2-main.js` budget 150 KB**.

**Corrections to the plan as written:** (1) `faithfulRender` is NOT in `__vmarkdD2` — it is shared by the
eager wavedrom/vega renderers, so it stays in main.js (it is tiny and pulls no dagre). (2) The load MUST be a
**cached promise**, not a bare `addScript`: a multi-D2 doc renders blocks concurrently and the `addScript`
`getElementById` dedup resolves the instant the `<script>` tag exists — before it executes — so blocks 2..N
read an undefined global and boot-error (caught by `d2-feature-parity` + `d2-lazy-load` before the fix).

**Verification.** Real-VS-Code e2e: **`d2-lazy-load.spec.ts`** (new — a non-d2 doc never loads d2-main.js /
`__vmarkdD2` absent; a d2 block renders SVG + `data-d2-engine` via the lazy bundle). Regression green:
`d2-feature-parity`, `d2-theme`, `custom-diagrams-render` (shared faithfulRender), `cross-diagram-edit`,
`diagram-cache`. `npm test` 1249; typecheck; `lint:ci` (414); coverage thresholds; both budget gates green.

## Problem

The whole D2 layout cluster is **statically** pulled into the eager `media/dist/main.js`
(`finish-init.ts` → `custom-diagrams.ts:8-15` imports `renderD2Graph`/`canvasMeasure`/
`unsupportedReason`/`d2Theme` from `./d2-render` and `renderD2GraphElk` from `./elk-layout`), yet it
executes **only** for `.language-d2` blocks. Verified bytes in `media/dist/main.meta.json`:

```
dagre 40424 + d2-render 33855 + d2-refine 20887 + elk-layout 5174 + astar 3773
+ d2-geometry 3314 + d2-wasm 1038 + faithful-render 483 + d2-config 364  ≈ 109 KB
= 22.9% of main.js's ~477 KB total.
```

`custom-diagrams.ts` is the **sole** eager runtime entry into the cluster (the other runtime
importers — `elk-layout.ts:24`, `d2-refine.ts:10` — are inside it; dagre's only importer is
`d2-render.ts`), so it code-splits behind one boundary. Task 145 audited bundle perf but never
proposed this split; the 525 KB budget ceiling (`scripts/check-bundle-size.mjs:13`) doesn't catch
the eager-parse cost (main.js is ~466 KB, under budget).

> **Impact is real but bounded:** the 109 KB is served from a local `vscode-resource` origin (no
> network), so the saving is **parse + top-level module-eval** at startup (dagre's ESM has
> non-trivial init) — a few ms, not a dramatic TTI win. Frame it honestly; substantiate with a
> before/after first-paint timing in the real webview.

## Plan (mirror the proven `elk-entry.ts` / `elk-main.js` IIFE precedent — `build.mjs:34-46`)

1. **`media-src/src/d2-entry.ts`** — IIFE entry assigning
   `window.__vmarkdD2 = { renderD2Graph, renderD2GraphElk, canvasMeasure, unsupportedReason, d2Theme, faithfulRender }`
   (same shape as `elk-entry.ts` → `window.__vmarkdElk`). **Main thread, no Worker/blob** (D2's
   dagre+refine+astar and ELK both already run on the main thread — keep it that way).
2. **`media-src/build.mjs`** — add a `d2Options` block mirroring `elkOptions`, outfile
   `media/vditor/dist/js/d2/d2-main.js`.
3. **`custom-diagrams.ts`** — replace the static imports (8-15) with an `addScript('.../d2-main.js')`
   (the helper at `custom-diagrams.ts:47`, already used at 231/288/493/637/783) **inside the existing
   async `compileD2(cdn, code).then(async ...)`** (line 341) — all the synchronous engine calls
   (`d2Theme:374`, `renderD2GraphElk:383`, `renderD2Graph:392`) already live in that `.then`, so the
   `addScript` resolves before reading the engine off the global. dagre then leaves main.js
   **entirely** (it's not in `elk-main.js`). Keep the tiny `d2-config` (364 B) **eager** as the
   shared settings channel.
4. **`scripts/check-bundle-size.mjs`** — lower the main.js ceiling (~420 KB) and add a `d2-main.js`
   budget **in the same change** (or CI's 525 KB ceiling won't reflect the new layout).

## Constraints
- CSP / Worker-rejection: use the `addScript` script-tag pattern like `elk-main.js`, **never** a Web
  Worker/blob (the stock ELK blob worker rejects in the webview).
- Lute round-trip: the `window.__vmarkdD2` bridge must inject **no** DOM into the editable surface
  (elk-main.js already satisfies this); rendered SVG + `data-processed`/`data-d2-engine` attrs
  (`custom-diagrams.ts:393-396`) unchanged.
- Caret/scroll: the `addScript` is awaited inside the existing async `compileD2().then`, so first-D2
  render gains a **one-time** script-fetch latency only; preserve the post-render `themeSvg`/caret
  behaviour.
- Source-path test imports (`d2-render.test.ts:2`, `d2-quality.test.ts:15-17`, `elk-layout.test.ts`,
  `astar.test.ts`, `faithful-render.test.ts`) import from **source** modules, not the bundle, so they
  stay intact.

## Verification
- **Real-VS-Code e2e (MANDATORY)** in `test/vscode-e2e/`: a `.language-d2` block still renders
  (`data-d2-engine` set, SVG produced) after the now-lazy load — do **not** defer to the user.
- Bundle-size gate green with the new ceilings; `main.meta.json` confirms dagre + d2-* no longer in
  main.js.
- **Before/after first-paint timing** in the real webview (task 145's verification ask) to
  substantiate the win, not assert it.
- Keep `d2-theme`/`custom-diagrams-render` specs green. `tsc` + `biome` + vitest + Playwright,
  headless (`xvfb-run -a`). Verify coverage.

## See also
- `elk-entry.ts` + `build.mjs:34-46` (the precedent), memory `d2-elk-main-thread` + ADR-0004
  (main-thread ELK boot), task 145 (bundle perf audit — this is the unaddressed follow-up), task 104
  (D2 renderer).
