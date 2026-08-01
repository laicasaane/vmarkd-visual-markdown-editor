# Task 183 — Stable diagram render across spin + off-thread d2 + content-hash cache (replaces the task-161 isTyping()-gated overlay)

> **Status:** ❌ ABANDONED — the Phase 1 capture/re-home experiment (`stableRenderNode`) was REMOVED
> ENTIRELY (2026-07-02, at the user's request). It never shipped on (default OFF), had a known
> grow/shrink regression when enabled, and was **redundant in practice**: task 161 (keep-last overlay) +
> task 175 (defer the per-keystroke spin, now always-on) already prevent any visible diagram flicker
> while typing, so capture/re-home fixed a blink you don't actually see while adding a real bug. Deleted:
> the `stableRenderNode` setting + protocol field + host read, `window.__vmarkdStableRenderNode`, the
> `captureRendersForSpin`/`rehomeRendersAfterSpin`/`codeBlocksIn` helpers + their globals in
> `edit-activity.ts`, the `patchIrCaptureRehomeSpin` esbuild patch + its ir/input.ts chain entry, and all
> associated unit/e2e tests (`stable-render.spec.ts`, `repro-multikey.spec.ts`). The task-161 overlay is
> the shipped, proven behaviour. **What DID survive from this task:** the Phase-0 spikes (kept) and the
> insight that the real diagram-render wins are the persistent cache (→ **task 184**, shipped always-on)
> and an off-thread d2 worker (→ **task 182**, still planned) — NOT a capture/re-home overlay. The design
> notes below are retained as historical context for any future worker/cache-first attempt.
>
> **Regression finding (2026-07-01, evidence in `test/vscode-e2e/repro-multikey.spec.ts`):** shipping
> items 1+3 made real editing WORSE (mermaid grew/shrank; diagrams seemed to blink). Root causes, from
> a flag-ON-vs-OFF multi-keystroke repro:
> - **item 3 (`RENDER_MS`=140):** the shorter window is < the typical inter-keystroke gap (~180 ms),
>   so the settle fires MID-BURST and repeatedly destroys+re-renders a slow MAIN-THREAD engine (mermaid
>   ~284 ms) that never catches up. `QUIET_MS`=220 is deliberately LONGER than a typing cadence so it
>   fires once, after you pause. ⇒ shortening the window is only safe once re-renders are cheap (Phase 3
>   cache) or off-thread (Phase 2 worker). Reverted.
> - **item 1 (capture/re-home):** with item 3 gone (no guard) `isTyping()` is always true at the spin,
>   so the existing `deferIrDiagramRender` path ALREADY re-homes the overlay correctly — my re-home hook
>   is then redundant AND sizes the overlay WRONG: it runs at `ir/input.ts:233` (before `setRangeByWbr`,
>   before the preview column's width is settled), so the mermaid svg (`width:100%; max-width:545`)
>   lays out at its NATURAL 545×1884 instead of the constrained 309×1067 — measured overlay=545 vs
>   live=309 with the flag ON, both=309 with it OFF. That 545↔309 swap is the "grows/shrinks / blinks".
> - **the "disappear" (~226 empty frames) is EQUAL flag-ON vs OFF** → not introduced by 183; it's the
>   repro's own tight `getBoundingClientRect` rAF loop starving the main-thread render (measurement
>   artifact), not a real regression.
> **Conclusion:** items 1 and 3 in isolation don't deliver the goal and regress; the disappearance +
> latency fix genuinely REQUIRES the off-thread worker (Phase 2) and/or the content-hash cache (Phase 3)
> so re-renders are cheap/non-blocking. Do those first; only then wire capture/re-home + a shorter window.
> **Goal:** kill BOTH diagram-edit problems on two orthogonal axes — (A) DISAPPEARANCE: the visible
> render must never go empty across a spin/settle, on EVERY path (typing, settle, INSERT, paste,
> mode-switch, theme-flip); (B) LATENCY: the ~450–500 ms edit→appear for heavy engines (off-thread
> for worker-viable engines + decoupled scheduling + a content-hash cache so we never wait on the
> 220 ms quiet window or re-render unchanged content).
> **Value / Risk:** 🟢 high (responsiveness + no-flash on every path) / 🟡 medium (capture/re-home
> rides a verified synchronous window in vendored Vditor; worker plumbing fully behind a fallback).
> **See also:** 161 (overlay being REPLACED), 172 (stripPreviewForSpin — retained), 175
> (fast-diagram-edit — retained), 182 (off-thread worker — implemented here),
> `[[d2-elk-main-thread]]`, `[[diagram-edit-debounce]]`, `[[show-partial-results-for-eval]]`.

## Why this exists (the two measured problems)

Editing a diagram has two independent failures:

1. **DISAPPEARANCE.** `SpinVditorIRDOM` is synchronous, block-scoped, and rebuilds the edited block
   via `blockElement.outerHTML = html` (`ir/input.ts:185`), which DESTROYS the rendered preview
   `<svg>` and emits an empty `data-render="2"` shell. The task-161 overlay re-injects a cached
   image, but it is **gated on `isTyping()`** — and on the INSERT path the task-175 synthetic settle
   re-dispatch runs with `isTyping()===false`, so no overlay engages and d2 flashes to raw source.
2. **LATENCY.** Even with typing non-blocking (task 175), the UPDATE lags ≈ `QUIET_MS (220ms) +
   single-engine render` (mermaid ≈284 ms, d2 ≈365 ms — synchronous main-thread). Editing one
   diagram re-renders only that one (not render-all), so the wall is the engine render freezing the
   main thread plus the quiet wait, plus redundant re-renders on undo/theme-flip/mode-switch.

This task **replaces** the fragile isTyping()-gated overlay with a mechanism whose never-empty
guarantee is structural (not timing-gated), and adds the off-thread + cache latency wins.

## Chosen architecture

Three pillars, mapped onto the two axes:

### Pillar 1 — STABLE-RENDER (axis A: disappearance)
Instead of caching a clone and re-injecting it (the isTyping()-gated overlay), **carry the live
render across the rebuild**. The spin owns the EXISTENCE of `.vditor-ir__preview` and its
`.language-X` wrapper; we own its CONTENTS. Two hooks bracket the destructive assignment inside the
**verified single synchronous task** of `ir/input.ts` (lines 178→233 contain no await/yield/paint):

- `__vmarkdCaptureRendersForSpin(blockElement, isIRElement)` — inserted right AFTER the anchor
  `log("SpinVditorIRDOM", html, "result", vditor.options.debugger);` and BEFORE `outerHTML`. Walks
  the in-scope `.vditor-ir__preview` panes; for each, grabs the live render node
  (`[class*="language-"] svg`, or the prior overlay's node if no fresh render landed yet) keyed
  `${lang}#${ord}` (existing single-walk `ordinalMap`). Canvas/WebGL engines (echarts/mindmap/stl/
  geojson/topojson) are rasterized to `<img>` instead of moving the instance-bound `<canvas>`.
- `__vmarkdRehomeRendersAfterSpin()` — inserted right BEFORE the anchor
  `setRangeByWbr(vditor.ir.element, range);`. Recomputes ordinals on the new DOM, and for each
  rebuilt `data-render="2"` preview wraps the held node in a
  `<div class="vmarkd-stale-overlay" data-render="1" data-lang="X" style="min-height:Hpx">`
  appended AFTER the source `.language-X` child (source stays `firstElementChild`).

Because no paint happens between destroy and re-home, the preview is **never observed empty**. The
hooks run **unconditionally** on every spin — per-keystroke, the task-175 `fenceRespinning` settle
re-dispatch, and the IR-root `innerHTML` branch — so it does NOT depend on `isTyping()` and fixes
the INSERT-path break at the root. `stripPreviewForSpin` (task 172) is retained and unaffected (it
operates on the spin INPUT string; capture works on live node references), so the re-home costs one
node move, not a multi-thousand-node re-tokenize.

### Pillar 2 — WORKER (axis B: forward-typing freeze)
Worker-viable engines (d2 flagship; graphviz/nomnoml/wavedrom by the same protocol) compute their
SVG string in a pooled Web Worker so the ~365 ms d2 pipeline never freezes the main thread.

**⚑ Phase-0 RESULTS reshaped this (2026-07-01, see "Phase 0" in the phased plan below).** The font-fidelity
spike proved OffscreenCanvas `measureText` in a worker **does NOT honour the bundled Source Sans 3**
even when the FontFace is loaded and `self.fonts.check()` returns true (worker measure drifts up to
**32 px** from the main-thread measure). So **text measurement MUST stay on the main thread**. The
recommended tier is therefore:
- **Tier 1 (RECOMMENDED — fully de-risked):** compile (TinyGo `d2compile`, ~1 ms) **and measure all
  labels on the MAIN thread** (cheap, fidelity-correct), then post `{graph, sizeMap, style}` to the
  worker, which runs the heavy **ELK layout + `toSVG`** (pure JS/geometry — no WASM, no fonts, no
  OffscreenCanvas needed). This is exactly the `elk-worker-spike`-proven config (~95 ms off-thread)
  plus a precomputed size map; the worker's `Sizer` becomes a `text|fontSize → {w,h}` lookup.
- **Tier 0 (possible but unnecessary):** the WASM-in-worker spike PROVED d2-compile boots + compiles
  in a worker under the real CSP (instantiate 4 ms, compile 1 ms, no `'wasm-unsafe-eval'` needed) —
  but since measurement must be on main and measurement needs the compiled graph, full-pipeline-in-
  worker forces a compile→main(measure)→worker(layout) ping-pong for no real gain (compile is ~1 ms).
  Not worth it; keep compile on main.
- **Tier 2 (fallback):** all main-thread (today's `renderD2GraphElk`/`renderD2Graph`).

Main-thread-bound engines (mermaid/echarts/abc/markmap/flowchart/plantuml/smiles/mindmap/leaflet/
stl) get NO worker — they keep the settle render but the stable-render re-home keeps their old SVG
visible across the gap (axis A still solved for them).

### Pillar 3 — CONTENT-HASH CACHE (axis B: repeat-render + decoupled scheduling)
A pure LRU `render-cache.ts` keyed `hash(lang, source-text, themeKey())` (FNV-1a 32-bit hex, cap
~64, SVG strings). A cache hit short-circuits the engine entirely → instant on undo/redo,
theme-flip-back, mode-switch, re-open and duplicate diagrams (helps ALL engines, including the
main-thread-bound ones), and is the authoritative source the re-home pulls from so the front buffer
is correct even when the captured node is stale. A short render debounce (`RENDER_MS`≈80 for worker
engines / ≈150 for main engines) reads the LIVE source and is independent of `QUIET_MS`, so render
latency is decoupled from the quiet window. Eager keystroke-driven pre-warm posts the current source
to the worker (idle-gated, see below) so the cache is usually warm by settle.

### Modules to add / change
- ✅ **`captureRendersForSpin` / `rehomeRendersAfterSpin` (DONE, in `media-src/src/edit-activity.ts`,
  NOT a separate render-preserve.ts).** DELIBERATE DEVIATION from the original plan: capture/re-home
  need `renderCache` + `visualSnapshot` + `restoreOverlay` + the STALE/COVER/OVERLAY class constants +
  `ordinalMap` + the lang sets, all private to edit-activity.ts — a separate file would have to export
  ~7 internals. Co-locating them (as `captureRendersForSpin(blockElement?)` + `rehomeRendersAfterSpin()`,
  registered as `window.__vmarkdCaptureRendersForSpin`/`__vmarkdRehomeRendersAfterSpin` in
  `installEditActivity`) is lower-risk and reuses the existing reveal lifecycle verbatim. Rather than
  snapshotting a live NODE (the reverted cloneNode risk), it reuses `visualSnapshot` (svg outerHTML /
  canvas→img string) so there is no moved-live-node hazard; the no-flash guarantee comes purely from
  the same-synchronous-task timing (spike 0.3), not from moving the node.
- **NEW `media-src/src/render-cache.ts`** — `hashRender(lang, source, themeKey)`, `getCachedSvg`,
  `putCachedSvg` (LRU), `themeKey()` (mode + contentTheme + d2 cfg). Pure, unit-tested.
- **NEW `media-src/src/diagram-worker.ts`** — worker entry; `{render, cancel}` handler;
  `layoutAndToSVG(graph, sizeMap, style, layout, refine)` factored pure (exported for vitest). Bundles
  the elkjs fake-worker modules (esbuild-inlined, NO runtime `importScripts`) + the `document={}` GWT
  banner shim. **No WASM, no fonts, no OffscreenCanvas** — the worker's `Sizer` is a `text|fontSize →
  {w,h}` map lookup (sizes are measured on MAIN, per Phase 0.2), with a char-width estimate as a
  last-resort fallback for any missing key.
- **NEW `media-src/src/diagram-worker-host.ts`** — `class DiagramWorkerPool`: one lazy keep-warm
  `new Worker(blobUrl)`, ready-gating queue, `id→promise` map, per-job timeout, **idle-gated
  keep-latest** dispatch (≤1 in-flight + ≤1 queued per block, drop superseded), fallback signaling;
  gated on `window.__vmarkdOffThreadDiagrams`. Main side does: `compileD2` (~1 ms) + enumerate every
  node/edge label + `canvasMeasure` each (main-thread, fidelity-correct) → posts `{graph, sizeMap,
  style, layout}`; the worker returns the SVG string.
- **CHANGE `media-src/src/edit-activity.ts`** — KEEP `isTyping`/`markEditActivity`/
  `deferUntilSettle`/`QUIET_MS` and task-175 `trySkipFenceSpin`/`fenceRespinning`. Repoint
  `__vmarkdDeferIrDiagramRender` to drop the `restoreOverlay` branch (visibility now owned by
  re-home) but keep the `NATIVE_DEFER`/`MEASURE_LANGS` settle scheduling + cover mode for
  main-thread engines. The old `snapshotRenders`/`restoreOverlay`/`visualSnapshot` stay behind the
  `stableRenderNode` flag as the rollout fallback (deleted in the cleanup phase).
- **CHANGE `media-src/src/custom-diagrams.ts`** — `renderD2` routes through `DiagramWorkerPool` when
  `window.__vmarkdOffThreadDiagrams !== false`, main-thread path as fallback; consults the cache
  first. `findBlocks`/`themeSvg` unchanged.
- **CHANGE `media-src/src/d2-render.ts` / `elk-layout.ts`** — `canvasMeasure` stays MAIN-only
  (Phase 0.2: worker measure is unfaithful). Add a label enumerator over a `D2Graph` (so the host can
  pre-measure every `text|fontSize`) and let `layoutElk`/`layoutDagre`/`toSVG` accept a precomputed
  `Sizer` that is a pure map lookup — same signature the worker uses, so the layout+toSVG code path
  is byte-identical on main and in the worker.
- **CHANGE `media-src/src/diagram-retheme.ts`** — migrate `reRenderD2`/`reRender*` off
  `innerHTML=''` onto the swap-when-ready primitive + cache invalidation by `themeKey()` (no-flash
  theme flip).
- **CHANGE `media-src/esbuild-shared.mjs`** — NEW `patchIrCaptureRehomeSpin` (insert both hooks at
  the two anchors, assert-on-drift like the existing four patches). `patchIrDeferDiagramRender`
  (490-503) unchanged.
- **CHANGE `media-src/build.mjs`** — add a `diagramWorkerOptions` esbuild target →
  `media/vditor/dist/js/diagram-worker.js` (iife, minify, `globalThis.document={}` banner),
  mirroring `elkOptions`.
- **CHANGE `media-src/src/finish-init.ts`** — `installRenderPreserve(app)` + boot the worker pool;
  register teardown.
- **CHANGE `src/extension.ts` + `media-src/src/main.ts` + `package.json`** — add settings
  `vmarkd.advanced.offThreadDiagrams` (default true) and `vmarkd.advanced.stableRenderNode`
  (default true) → window globals, mirroring `fastDiagramEdit`. **No CSP change needed** (Phase 0.1:
  `worker-src … blob:` + `'unsafe-eval'` already cover the blob worker; under Tier 1 WASM isn't even
  posted to the worker).

### Render lifecycle — the precise moment the old render is removed
1. **Keystroke (capture-phase `input` on `#app`):** `markEditActivity()` arms `QUIET_MS` (kept);
   render-preserve's listener notes the edit, hashes the live source, and (idle-gated) eager-posts
   it to the worker so the cache warms while typing.
2. **Task-175 skip:** inert fenced-body char → no spin, the wrapper + its render stay painted.
3. **Non-skipped keystroke OR 220 ms settle re-dispatch:** `ir/input.ts` computes the spin string →
   `captureRendersForSpin` records live node refs → `outerHTML` destroys the old preview (refs keep
   it alive) → `rehomeRendersAfterSpin` re-inserts each held node as a `data-render="1"` overlay
   into the new shell, **before paint**. Visible pixels pass from "old preview node" to "overlay in
   new preview node" with zero empty frames.
4. **Render off the critical path:** worker (string), async main (string), or cover-mode live render
   for measuring engines. The OLD render (the re-homed overlay) stays visible throughout. On a cache
   hit the new SVG is available immediately.
5. **ATOMIC SWAP (the only moment the old render is removed):**
   - String engines: build the new SVG into a detached node, then a single synchronous
     `wrapper.replaceChildren(newNode)` + `overlay.remove()` (no paint between) — old→new in one frame.
   - Measuring engines: render beneath an opaque cover holding the old render; `revealWhenReady()`
     (rAF, gated on `hasFreshRender` — svg/canvas or a terminal `.vmarkd-diagram-error` box outside
     the cover, with `REVEAL_TIMEOUT_MS` as the never-stuck safety) removes the cover + stale child.
   On swap, `putCachedSvg(h, svg)` and update `lastSvgByBlock[lang#ord]`.
6. **Drop-if-stale reconciliation:** a worker result carries `requestedHash`; on arrival re-find the
   block by ordinal, recompute the hash from the LIVE source — swap only if equal, else DROP the
   swap but BANK the SVG in the cache (so an undo to that content is an instant hit). The front
   buffer stays painted, so a late/stale result never blanks the diagram.

### Spin handling
The render survives `SpinVditorIRDOM` destroy-rebuild because capture and re-home bracket the
destructive assignment within ONE synchronous task — the browser only paints at task boundaries, so
`old → empty → re-homed-old` is never observed. Unconditional (not isTyping()-gated). Back-to-back
spins before a fresh render lands: capture falls back to grabbing the prior overlay's node (needs a
selector that also matches the `data-lang` overlay wrapper, not only `.language-X`).

### Caret safety
Capture/re-home touch ONLY the preview half (`.vditor-ir__preview`, contenteditable=false,
data-render-marked) and its `[class*="language-"]` render node. They NEVER read/mutate the editable
source half (`.vditor-ir__marker--pre code`) or the `<wbr>` caret marker. Re-home runs BEFORE
`setRangeByWbr` and appends a preview-half sibling, so Vditor's caret restore (re-derived from
`<wbr>` in the source) is untouched. The async worker swap fires on a later task and mutates only
the contenteditable=false preview subtree — it cannot eject or scramble the caret, even when the
caret is in that block's source. `swapIn` must route through `previewOf(node)`/`findBlocks` guards
(the source `<code class="language-X">` precedes the preview one in document order, so an un-scoped
`.language-X` query would hit the source first).

### Worker protocol + engines
- Engines: d2 (Phase 2), then graphviz/nomnoml/wavedrom (Phase 5). Everything else stays
  main-thread + double-buffered + cached.
- Messages: main→worker `{type:'boot', d2Wasm:ArrayBuffer, font:ArrayBuffer}`,
  `{type:'render', id, lang, source, theme, layout}`, `{type:'cancel', id}`; worker→main
  `{type:'ready'}`, `{type:'result', id, svg}`, `{type:'error', id, kind:'boot'|'compile'|'unsupported', message}`.
- One keep-warm worker, lazy-spawned on first worker-engine render, idle-gated keep-latest (a
  running synchronous WASM/GWT job can't be interrupted, so `cancel` only drops queued jobs).
- Fallback (never break rendering): flag off / spawn fail / boot timeout / `error kind:'boot'` /
  per-job timeout (~5 s) → main-thread `renderD2`. Gated behind `vmarkd.advanced.offThreadDiagrams`.

### Serialize fidelity
The re-homed render lives inside `<div class="vmarkd-stale-overlay" data-render="1">`; `data-render="1"`
makes the subtree invisible to both Lute AST walkers (`VditorIRDOM2Md`, `SpinVditorIRDOM`), so it
contributes ZERO markdown bytes — `getValue()`/`serializeForHost()` are byte-identical present vs
absent. `data-lang` (not `.language-X`) keeps observers from re-processing it. The editable source is
never touched. `stripPreviewForSpin` keeps the re-mounted SVG out of the spin's `ParseHTML` input.

### Coverage of BOTH render families
Both families render INTO the same `.vditor-ir__preview` the spin rebuilds, so the single
capture/re-home covers both by node shape. **Family A** (Vditor built-in, e.g. mermaid): the engine
renders into `code.language-mermaid`; capture grabs the `<svg>`, re-home carries it, processCodeRender
re-renders, swap reveals. **Family B** (custom, e.g. d2): `findBlocks` does the code→div swap and
`renderD2` writes into `div.language-d2`; capture grabs that `<svg>` identically. The worker spans
both families (graphviz is A, d2/nomnoml/wavedrom are B) through the same pool.

### What this means for mermaid (and the main-thread engine class: echarts, abc, markmap, …)
Mermaid was the original "appears slowly / disappears" complaint, so spell out exactly which pillars
help it. Mermaid is **main-thread-bound**: it lays out via live-DOM `getBBox`/`getComputedTextLength`
(~119 `getBBox` calls), not canvas text metrics. **Phase 0.2 is the proof it can NEVER move to a
worker** — if OffscreenCanvas `measureText` (the *simplest* worker measurement) is already unfaithful
to the bundled font in a worker (32 px drift, `fonts.check()` lies), mermaid's far heavier live-SVG
layout measurement is categorically impossible off-thread. So **Pillar 2 (worker) does NOT apply to
mermaid.** The other two pillars are engine-agnostic and ARE what fix the complaint:
- **Pillar 1 (capture/re-home) = the disappearance fix, for free.** Mermaid's `<svg>` lives in
  `code.language-mermaid` inside the same `.vditor-ir__preview` the spin rebuilds, so capture grabs it
  before `outerHTML` and re-home carries it across — unconditionally (not `isTyping()`-gated). The 0.3
  no-paint guarantee is engine-agnostic ⇒ mermaid never flashes empty across a spin/settle, same as
  d2. As a measuring engine its cold render goes UNDER an opaque cover holding the old svg and is
  revealed only when ready (`revealWhenReady`), so even a fresh layout never shows half-drawn.
- **Pillar 3 (content-hash cache) = the biggest mermaid latency win.** `hash(lang, source, themeKey)`
  → SVG skips the whole ~284 ms mermaid render on undo/redo, theme-flip-back, IR↔WYSIWYG↔Preview
  switch, re-open and duplicate diagrams — mermaid benefits from the cache identically to d2.
- **Decoupled scheduling.** The mermaid edit→appear latency was dominated by `QUIET_MS`(220 ms) + the
  spin/reveal pipeline, NOT `mermaid.render` (~55 ms isolated). A `RENDER_MS` debounce independent of
  `QUIET_MS` (reading the live source) shortens appear-after-pause; with old-stays-visible the
  perceived behaviour becomes "old held, new swaps in shortly after you pause" not "gap then pop".

**Honest residual (mermaid-specific):** the COLD render compute stays on the main thread — no worker,
and no useful eager pre-warm (pre-rendering during active typing would re-introduce the keystroke lag
task 175 removed). So a first render of a NEW heavy mermaid (cache miss) is still a ~55–284 ms
main-thread render at settle. But it happens AFTER the user pauses, with the old diagram visible the
whole time and an atomic swap, so it reads as "smooth", not "frozen/disappeared". The
`flowchart.htmlLabels:false` lever was already spiked (`mermaid-htmllabels-spike`) and does NOT
meaningfully cut that render. Net: **mermaid gets axis-A fully + axis-B via cache + decoupled
scheduling; only the off-thread-compute slice of axis-B is d2-only.** The same reasoning applies to
echarts/abc/markmap/flowchart/mindmap/stl (all main-thread by the task-182 classification).

## Phased plan

> **Scope decision (2026-07-01):** implement **Phase 1 (capture/re-home)** + the **decoupled
> `RENDER_MS` scheduler** (the scheduling half of Phase 3) NOW — these two fix the disappearance AND
> shorten appear-after-pause for BOTH d2 and mermaid, with no worker and no cache. The **content-hash
> cache (the other half of Phase 3)** and the **d2 worker (Phase 2)** stay PLANNED in this task, not
> built yet. Order matters: capture/re-home first (structural no-flash), THEN the scheduler (safe to
> shorten the wait precisely because the old render now stays visible regardless of timing — this is
> what the reverted 220→100 band-aid lacked).

**Phase 0 — De-risk spikes (real-VS-Code, nothing shipped) — ✅ DONE (2026-07-01).** Three headless
real-VS-Code spikes (`test/vscode-e2e/phase0-*-spike.spec.ts`), all green.
- 0.1 ✅ d2-compile WASM boots + compiles inside a webview Worker under the real CSP (`instantiate`
  4 ms, `compile` 1 ms, graph produced) — **`'wasm-unsafe-eval'` NOT needed** (`'unsafe-eval'`
  suffices). Method that avoids the elkjs cross-origin trap: inline `wasm_exec.js` into the blob +
  transfer the `.wasm` ArrayBuffer (NO `importScripts`/`fetch` inside the worker).
- 0.2 ⚠️ **DECISION-GRADE:** OffscreenCanvas `measureText` in a worker does NOT honour the bundled
  Source Sans 3 even with the FontFace loaded from bytes AND `self.fonts.check()===true` (worker
  drifts up to **32.44 px** vs main; URL-based `FontFace.load()` also just hangs). ⇒ **measure on the
  MAIN thread, pass a size map into the worker** (Tier 1). This SIMPLIFIES the worker (no WASM, no
  fonts, no OffscreenCanvas there).
- 0.3 ✅ Structural no-paint proof: a same-task detach+reattach is **never painted empty**
  (`emptyFrames=0`), and the cross-task control DID catch empty frames (`emptyFrames=2`) so the
  detector is valid. Today's d2 settle shows `badFrames=0` ONLY because the timing-gated overlay
  engages — confirming the fragility this task replaces with the structural guarantee.
- 0.4 (graphviz cost) — deferred to Phase 5 planning (graphviz stays main-thread + double-buffered
  for now; worker-izing it is a breadth question, not a Phase-2 blocker).

**Phase 1 — Stable-render for the IR path (axis A) + the scheduler (item 3) — ✅ SHIPPED (2026-07-01),
behind `stableRenderNode` flag (default ON):**
- `captureRendersForSpin`/`rehomeRendersAfterSpin` in `edit-activity.ts` (co-located, see Modules) +
  `patchIrCaptureRehomeSpin` (esbuild, anchored on the outerHTML block + `setRangeByWbr`; chained into
  the ir/input.ts patch entry) + `window.__vmarkdStableRenderNode` from `vmarkd.advanced.stableRenderNode`
  (package.json/protocol.ts/extension.ts/main.ts×2). The old isTyping-gated overlay path in
  `deferIrDiagramRender` stays as the flag-OFF fallback.
- **Item 3 (scheduler) shipped WITH Phase 1:** `RENDER_MS=140` (vs the legacy `QUIET_MS=220`, selected by
  `quietMs()` on the flag) — safe because task 175 already decoupled typing from the spin AND capture/
  re-home makes the shorter window flash-free; PLUS the `fenceRespinning` guard in `markEditActivity`
  (kills the fence-respin double-debounce), now safe because re-home is unconditional (the guard-without-
  re-home is exactly what caused the reverted disappear).
- **Tests (all green):** unit `patchIrCaptureRehomeSpin` drift-guard (`vditor-source-patches.test.ts`),
  unit capture/re-home + flag-window + no-op-when-off (`edit-activity.test.ts`), manifest setting
  (`manifest.test.ts`); real-VS-Code `stable-render.spec.ts` (d2 + mermaid: `emptyFrames=0/157`, overlay
  `data-render="1"`, fresh render lands) + the existing t161-visual / diagram-edit-monitor (flowchart+
  graphviz no-shrink) / diagram-fast-edit-safety (byte-correct round-trip) / spin-strip all still pass.
  Deferred to later phases: the delete-path assertion, and worker/cache/theme specs.

**Phase 2 — d2 worker (axis B), behind `offThreadDiagrams` flag:**
`diagram-worker.ts` + `diagram-worker-host.ts` + build target + idle-gated keep-latest + drop-if-stale
+ main-thread fallback. **Tier 1 per Phase 0.2:** compile + measure on MAIN, ELK layout + `toSVG` in
the worker (no WASM/fonts/OffscreenCanvas in the worker). No CSP change (Phase 0.1).

**Phase 3 — Content-hash cache (axis B, all engines):**
`render-cache.ts` + `RENDER_MS` decoupled scheduler + eager pre-warm + cache as the re-home source.
Instant undo/redo/mode-switch/duplicate.

**Phase 4 — Theme-flip + mode-switch no-flash:** migrate `diagram-retheme.ts` onto the swap
primitive + cache invalidation by `themeKey()`.

**Phase 5 — Breadth + cleanup:** worker-ize graphviz/nomnoml/wavedrom; WYSIWYG capture/re-home patch
(`wysiwyg/input.ts`) + WYSIWYG-aware `nodeLang`/root; patch the remaining processCodeRender entry
points (undo/redo, renderDomByMd, paste, hint); DELETE the old overlay machinery + the
`stableRenderNode` fallback once proven in the user's real editor.

## Test plan (per the mandate — unit + chromium harness + real-VS-Code, coverage verified)

**Unit (vitest, jsdom):**
- `render-preserve.test.ts` — capture holds live svg refs keyed lang#ord; re-home re-inserts into
  `data-render="2"` previews as a `data-render="1"` overlay with `data-lang` + min-height, source
  stays `firstElementChild`; canvas→`<img>`; ordinal-shift → graceful no-rehome (no throw);
  back-to-back capture grabs the prior overlay node; `swapIn` NEVER mutates a node under
  `.vditor-ir__marker--pre`.
- `render-cache.test.ts` — `hashRender` determinism + sensitivity (source/theme/lang change ⇒
  different hash), LRU eviction.
- `diagram-worker-host.test.ts` (mock Worker) — id correlation, ready-gating, timeout→fallback,
  error kinds, idle-gated keep-latest drops superseded, drop-if-stale discards a result whose source
  changed.
- `worker-pure.test.ts` — `renderD2InWorker` with injected measure stub on existing d2 fixtures
  (vm-context WASM).
- **Serialize fidelity** — boot compile-only Lute in a vm-context (vmarkd-testing recipe); assert
  `getValue()` byte-identical with the front buffer present vs absent, including under a transient
  `data-render="2"` preview.

**Chromium harness e2e (`media-src/e2e`, headless):**
- `double-buffer-no-empty.spec` — type a burst into a mermaid/graphviz source, poll
  `wrapper.querySelectorAll('svg').length` every frame across burst→settle, assert NEVER 0, then the
  new svg differs; cover the Enter/INSERT path. **d2 stays `test.fixme` here** (harness DOM lacks
  `.language-d2`).
- `content-cache.spec` — type then undo, spy a render counter, assert zero engine invocations and
  identical svg (cache hit).

**Real-VS-Code e2e (`test/vscode-e2e`, `xvfb-run -a`, `node build.mjs` FIRST):**
- `d2-insert-no-empty.spec` — THE regression: place caret in d2 source, type a new node line, sample
  the `.language-d2` wrapper every rAF across the spin/settle gap, assert it ALWAYS holds an svg
  (overlay or real) and NEVER raw highlighted code/empty.
- `d2-worker-render.spec` — d2 renders with `data-d2-engine` + a host marker proving the worker (not
  fallback) produced the SVG; rAF-tick counter keeps ticking during the render (off-thread); worker
  vs main text x-positions match (font fidelity).
- `d2-stale-drop.spec` — rapid-type then settle; final svg matches the FINAL source; `getValue()`
  round-trips byte-identical; a stale result was banked, not swapped.
- `d2-worker-fallback.spec` — `offThreadDiagrams=false` ⇒ main path renders identically; forced boot
  failure ⇒ fallback renders.
- `theme-and-mode.spec` — flip theme and switch IR↔WYSIWYG↔Preview; diagram stays visible the whole
  time (re-mount from cache), ends re-themed, serialize unchanged.

Verify coverage with the repo coverage command; confirm `render-preserve.ts`, `render-cache.ts`,
`diagram-worker-host.ts` and the worker branch of `renderD2` are exercised. Run `npm run lint:ci` +
the full unit suite as the gate.

## Risks + rollback
- ~~**WASM-in-worker under CSP**~~ — ✅ RESOLVED (Phase 0.1): d2-compile WASM boots + compiles in a
  worker under the real CSP; `'unsafe-eval'` suffices, no `'wasm-unsafe-eval'` needed. (Moot anyway:
  Tier 1 keeps compile on main.)
- ~~**Font drift**~~ → **REPLACED by a hard finding** (Phase 0.2): OffscreenCanvas `measureText` in a
  worker ignores the bundled font entirely (32 px drift, `fonts.check()` lies). Mitigation is now
  ARCHITECTURAL, not a tweak: **measure on the main thread, pass a `text|fontSize → {w,h}` size map
  into the worker**; the worker never measures text. A real-VS-Code spec must assert worker-laid-out
  d2 node x-positions match the main-thread render.
- **Coverage outrunning deletion** — capture/re-home is patched only into `ir/input.ts`; the old
  overlay is retained as fallback for the other processCodeRender entry points (undo/redo,
  renderDomByMd, paste, hint) and WYSIWYG until Phase 5; `stableRenderNode` is the runtime kill-switch.
- **Head-of-line worker blocking** (a single keep-warm worker can't interrupt a running sync
  WASM/GWT job → a fresh render could queue behind a stale ~365 ms job) — idle-gated keep-latest
  dispatch; pool expandable to 2.
- ~~**Moved-live-node side effects**~~ → AVOIDED by design (Phase 1): capture/re-home re-uses
  `visualSnapshot` (svg `outerHTML` / canvas→`<img>` STRING), NOT a moved/cloned live node — so the
  prior reverted-`cloneNode` hazard (interactive svg state, focus/blur, observer re-grab) does not
  apply. The no-flash guarantee comes solely from the same-synchronous-task timing (spike 0.3).
- **Ordinal drift** — a structural add/remove of a same-lang block shifts `lang#ord` keys; the
  content-hash cache is the ordinal-independent correctness layer (worst case: one frame of a
  stale-but-valid render before the next pass self-corrects).
- **Rollback:** `vmarkd.advanced.stableRenderNode=false` reverts to the task-161 overlay;
  `vmarkd.advanced.offThreadDiagrams=false` reverts d2 to main-thread. Each phase ships behind a
  default-on opt-out, independently revertable.

## Acceptance criteria
- [x] On the d2 INSERT path in the real webview, the preview NEVER goes empty for any frame across
      the spin/settle gap (the original regression). — `stable-render.spec.ts` d2 `emptyFrames=0/157`.
- [~] Same no-empty guarantee for mermaid/graphviz/echarts on insert AND delete. — mermaid INSERT
      done (`stable-render.spec.ts` `emptyFrames=0/157`); graphviz/echarts no-shrink/collapse covered by
      `diagram-edit-monitor.spec.ts` + `t161-visual.spec.ts`. **DELETE-path assertion still TODO.**
- [x] `getValue()`/`serializeForHost()` byte-identical with the managed render present vs absent. — the
      overlay carries `data-render="1"` (asserted); byte-correct round-trip through the skip path in
      `diagram-fast-edit-safety.spec.ts`. (Post IR↔WYSIWYG↔Preview switch = with the WYSIWYG phase.)
- [ ] d2 renders off-thread (worker) + fallback — **Phase 2 (not built).**
- [ ] A worker result for a now-stale source is dropped + banked — **Phase 2/3 (not built).**
- [ ] Undo/redo, theme-flip-back, mode-switch, duplicate diagrams are instant cache hits — **Phase 3
      content-hash cache (not built; deferred by the 2026-07-01 scope decision).**
- [ ] Theme flip keeps every diagram visible the whole time (no flash) — **Phase 4 (not built).**
- [x] Coverage shows the new code exercised; `npm run lint:ci` (exit 0, only pre-existing warnings) +
      unit (1109 pass, incl. capture/re-home + patch drift-guard) + real-VS-Code suites green, run
      headless by the implementer. (Uncovered lines in the new code are defensive guard clauses + the
      `fenceRespinning` return, which `stable-render.spec.ts` exercises at the integration level.)

## Provenance
Designed via a 25-agent design workflow (`wf_329d5e56-76a`, 2026-06-30): 4 parallel architecture maps
of the real code, 4 independent design approaches (A evolve-overlay / B render-service /
C stable-preview-node / D worker-first-cache), each adversarially reviewed on 4 lenses
(caret+Lute correctness, performance+worker, robustness/edge-cases, maintainability/testability).
Scores: C 7.5 (only approach with zero constraint-violation flags), A 7.3, B 7.3, D 6.8; no fatal
flaws in any. Winner = hybrid on C's capture/re-home spine + D's content-hash cache + D's tiered
worker + A's rollback-flag discipline. Rejected: A (keeps the band-aid framing + 220 ms quiet window
before the worker, re-enters the reverted isTyping()/fenceRespinning coordination), B (largest
rewrite; unproven offscreen-string theme-baking; deletes the REVEAL_TIMEOUT_MS backstop), D
(mislabels mermaid as off-DOM; its coordinator-owns-wrapper abstraction leaks for d2's lazily-created
wrapper — its cache + tiered worker grafted into the winner instead).
