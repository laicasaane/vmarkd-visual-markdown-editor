# Task: Off-thread diagram render (Web Worker) for responsive editing — d2 first

> **Status:** 🅿️ PARKED (2026-07-05, user decision) — spiked + de-risked but NOT worth building now.
> Kept for a cold resume if a heavy-d2/graphviz workflow ever proves painful.
>
> **Why parked (the value shrank as the siblings landed):**
> 1. **Only 4 of 17 engines can go off-thread** (d2, graphviz, nomnoml, wavedrom). The most common
>    heavy engine — **mermaid — CANNOT** (live-DOM `getBBox`×119 sizing; task 183 Phase 0.2 PROVED
>    worker `OffscreenCanvas.measureText` is unfaithful to the bundled font → a fork is impossible).
>    Same for echarts/flowchart/markmap/stl/geojson/mindmap/abc/topojson.
> 2. **The no-trade-off win already shipped as [184] (source+theme→SVG cache)** — undo/redo / re-open /
>    mode-switch are instant for ALL engines without a worker. That was the biggest practical lever.
> 3. **[183] (the decoupled scheduler / no-flash swap) is ABANDONED**, so the mermaid-side responsiveness
>    path is closed too.
> 4. The headline "mermaid ≈284 ms blocks the main thread" is misleading: the isolated `render()` is only
>    **~55 ms**; the rest is `QUIET_MS`(220 ms) + the spin/DOM-insert pipeline — not the render.
> 5. **Typing is already non-blocking ([175])**; for the worker-viable engines the diagram UPDATE is
>    already debounced ([161]) and cached on repeat ([184]).
> ⇒ Significant new plumbing (worker bundle, in-worker font, fallback, setting, plantuml/smiles
> emit-string refactors) for a win limited to 4 non-dominant engines. Not worth it now.
>
> _Original spike record below (all still valid if resumed)._
> **Goal:** make heavy diagram re-render NOT freeze the main thread, so the diagram stays
> responsive during/after editing (user: "diagramy renderują się ze zbyt dużym opóźnieniem …
> żeby było bardziej responsywne").
> **Value / Risk:** 🟢 high (responsiveness on heavy diagrams) / 🟡 medium (new worker plumbing,
> but fully behind a fallback to today's main-thread render).
> **See also:** task 161 (diagram-edit debounce + swap-when-ready overlay — reused for the swap),
> 172/175 (instant typing), `[[d2-elk-main-thread]]`, `[[d2-wasm-tinygo-spike]]`.

## Why this exists (the measured problem)

Typing is already non-blocking (task 175). The remaining issue is the diagram UPDATE lagging
after a change. Measured in the real webview:

- It is NOT render-all: editing one diagram re-renders ONLY that diagram (the unchanged ones keep
  their svg). `survivors=2/3` → Vditor already skips unchanged. (`diagram-resettle-spike.spec.ts`)
- Perceived delay = `QUIET_MS (220ms) + single-diagram engine render`. Engine render measured:
  **mermaid (heavy) ≈284ms, d2 (WASM+ELK) ≈365ms** — synchronous MAIN-THREAD work.
  (`render-cost-spike.spec.ts`)
- The 220ms quiet window can be trimmed but it's a trade-off (shorter → more freezes on micro-
  pauses). The real wall is the engine render freezing the main thread. The only way past it is
  OFF-THREAD.

## What the spikes proved (all in the real VS Code custom-editor webview)

1. **Web Workers run in the webview.** A self-contained blob worker burned 250ms CPU off-thread
   while the main thread kept ticking rAF (7 ticks). CSP already allows it
   (`worker-src ${cspSource} blob:`, `src/html-builder.ts`). The old "elk worker rejects" was
   elkjs's OWN blob worker (cross-origin `importScripts`), NOT a platform ban.
   (`worker-feasibility-spike.spec.ts`)
2. **elkjs layout runs in a worker.** Bundled self-contained (no importScripts) + a one-line
   `document={}` banner shim (elkjs's GWT engine branches on `typeof document` but never touches
   the DOM): real layout in **95ms**, correct layered positions `xs=[12,106,206]` + edge routing.
   (`elk-worker-spike.spec.ts`)
3. **OffscreenCanvas.measureText works in the worker** → `measureText('Web Server')=74px`. d2's
   text measurement (`canvasMeasure`, `d2-render.ts:2064`, uses `canvas.getContext('2d').measureText`)
   is portable by swapping `document.createElement('canvas')` → `new OffscreenCanvas()`.
4. Main thread stayed responsive (14 rAF ticks) while the worker laid out — proves no freeze.

## Full engine classification — what CAN and CANNOT go off-thread

The criterion: **worker-viable ⇔ the render is pure compute that emits an SVG STRING (or data)**, with
text measurement either none or via **canvas `measureText`** (portable to `OffscreenCanvas`). It
**must stay main-thread** if it measures via **DOM** (`getBBox`/`getComputedTextLength`/
`getBoundingClientRect` on live elements), renders to a live **`<canvas>`/WebGL**, reads
`getComputedStyle`, builds the result as **DOM nodes** (needs `document`), or is **interactive**
(zoom/pan/orbit/tooltips). Verified by reading the render code + counting markers in each vendored
bundle (2026-06-30, Explore sweep). All 17 diagram tags:

| engine | library | output | text measure | DOM/WebGL/interactive | verdict |
|---|---|---|---|---|---|
| **d2** | d2-wasm + ELK(`elk-main.js`, pure JS)/dagre + `d2-render.ts` | SVG **string** | canvas `measureText` (`d2-render.ts:2064`) | none for compute | ✅ **worker** (proven) |
| **graphviz** | HPCC Graphviz WASM (`viz/viz-global.js`) | SVG **string** | **none** — internal metrics (bundle: 0 getBBox/measureText/getContext/createElementNS) | none | ✅ **worker** (cleanest) |
| **nomnoml** | `nomnoml.min.js` | SVG **string** (`renderSvg`, `custom-diagrams.ts:303`) | canvas `measureText` | none for compute | ✅ **worker** |
| **wavedrom** | `wavedrom.min.js` | SVG **string** | **char-count estimate** (no measureText); lone `getContext` = PNG export only | none for compute | ✅ **worker** |
| **vega / vega-lite** | `vega-embed.min.js` | `renderer:'svg'` string | canvas `measureText` | reads `getComputedStyle().color` for theme (`custom-diagrams.ts:663`) + interactive tooltips | 🟡 **borderline → worker** (pass fg color as data, skip interactivity) |
| **plantuml** | TeaVM (`plantuml.js`) | SVG via `createElementNS`×29 into element | canvas `measureText` (portable) | builds SVG as **DOM nodes** (needs `document`) | 🟡 **borderline → main** (refactor to emit a string → worker) |
| **smiles** | SmilesDrawer (`smiles-drawer.min.js`) | SVG via `createElementNS`×49 | canvas `measureText` (portable) | DOM-node build + `getComputedStyle` for bg (`smiles-render.ts:59`) | 🟡 **borderline → main** (string + color-as-data → worker) |
| **mermaid** | `mermaid.min.js` 11.15.0 | SVG string (`render()`) | `getComputedTextLength`×10 + **`getBBox`×119** + `htmlLabels` `foreignObject`×11 + `getComputedStyle`×10 | measures by attaching SVG to live DOM | ❌ **main** (DOM text sizing; off-thread = fork) |
| **flowchart** | flowchart.js + Raphael | SVG into live element | **`getBBox`×57** on live SVG text | builds + measures in live DOM | ❌ **main** |
| **abc** | abcjs (`abcjs_basic.min.js`) | SVG into element | **`getBBox`×10** on rendered glyphs | `getBoundingClientRect`×2 interactive pointer | ❌ **main** |
| **markmap** | markmap (d3) | live SVG + `mm.fit()` | **`getBoundingClientRect`×6** on live SVG | d3-zoom pan/zoom + `getComputedStyle` | ❌ **main** |
| **echarts** | echarts (`echarts.min.js`) | live **`<canvas>`** | canvas measureText | **CanvasRenderer only** (no SVGRenderer bundled), interactive | ❌ **main** |
| **mindmap** | echarts (tree) | live **`<canvas>`** | canvas | canvas + `roam:true` pan/zoom | ❌ **main** |
| **geojson** | Leaflet | live **`L.map()`** | n/a | interactive map, tiles, `getComputedStyle` | ❌ **main** |
| **topojson** | Leaflet + topojson-client | live **`L.map()`** | n/a | same as geojson | ❌ **main** |
| **stl** | three.js (`three-stl.min.js`) | live **`<canvas>` WebGL** | n/a | `WebGLRenderingContext`×2 + OrbitControls + rAF loop | ❌ **main** |

**Phasing implied by the table:**
1. **d2** (proven) — build the worker harness for it.
2. **graphviz, nomnoml, wavedrom** — clean (string output + canvas/no measure) → ride the SAME worker, just add per-lang compute.
3. **vega/vega-lite, plantuml, smiles** — borderline; bring in with small refactors: emit an SVG STRING instead of building DOM nodes, and pass theme color in as data (don't read `getComputedStyle` in the worker). vega is softest (already string + canvas measure); plantuml/smiles need the DOM-node→string change.
4. **mermaid, flowchart, abc, markmap, echarts, mindmap, geojson, topojson, stl** — CANNOT go to a worker. DOM text measurement (`getBBox`/`getBoundingClientRect`), live canvas/WebGL, or interactivity. See the next section for their on-thread levers.

## Main-thread engines — what to do instead (they can't worker)

For the 9 main-thread engines, responsiveness has to come from cheaper/rarer renders, not off-thread:

- **Source+theme → SVG cache (LRU), engine-agnostic.** Key = `hash(source) + theme`; on a hit, reuse
  the cached SVG and skip the engine entirely. Does NOT help forward typing (source changes each
  keystroke) but makes **undo/redo, re-open, and mode switches** instant. Cheap, no trade-off. Applies
  to ALL engines (worker ones too).
- **mermaid `flowchart.htmlLabels: false`** — **SPIKED 2026-07-01 → ✗ DISPROVEN.**
  `test/vscode-e2e/mermaid-htmllabels-spike.spec.ts` measured `mermaid.render()` with htmlLabels
  true vs false directly on the heavy fixture: **no meaningful render cut.** The `getBBox`×119
  node/edge measurement dominates, not the `foreignObject` labels — so flipping it removes a minor
  cost while losing HTML/markdown labels (`<br>`, formatting). **Do NOT pursue.**
- **Render-cost reality (pipeline-breakdown spike, 2026-07-01):** isolated `mermaid.render()` is only
  **~55 ms**; the ~284 ms in-editor figure and the ~450–500 ms edit→appear are dominated by
  `QUIET_MS`(220 ms) + the spin re-dispatch / DOM-insert / reveal pipeline, **not** the render itself.
  ⇒ the mermaid lever is NOT render optimization; it's **(a) the source+theme→SVG cache** (skip the
  render on repeats) **and (b) decoupling the render schedule from `QUIET_MS`** + keeping the old svg
  visible (no-flash). Both are engine-agnostic and are now **Pillars 3 + the decoupled scheduler of
  task 183** (which also gives mermaid the axis-A no-disappear via capture/re-home).
- **NOT worth it:** forking mermaid's measurement to OffscreenCanvas — and **task 183 Phase 0.2 now
  PROVES this is impossible**: worker OffscreenCanvas `measureText` is unfaithful to the bundled font
  even when loaded (32 px drift, `fonts.check()` lies), so mermaid's far heavier live-SVG `getBBox`
  layout can never go off-thread. `layout:'elk'` (slower than dagre) / `look:'handDrawn'` (slower).

## Confirmed architecture (d2)

- **Worker** (bundled servable resource, esbuild target in `build.mjs`; `document={}` banner shim):
  d2-compile WASM (parse → graph) → elkjs layout → `OffscreenCanvas` measure → `toSVG` → **SVG string**.
  All compute/string, no DOM.
- **Main thread:** post source text → receive SVG string → swap into the preview via the existing
  task-161 swap-when-ready overlay (keep last render until the new one lands → no flash).
- **Font:** load the bundled measurement font in the worker via `FontFace`/`self.fonts.add` so
  `measureText` matches the rendered font (the `canvasMeasure` comment warns of drift otherwise).
- **Fallback:** any worker failure (boot, timeout, error) → today's main-thread d2 render. Never
  break rendering. Gate behind a setting (e.g. `vmde.advanced.offThreadDiagrams`, default ON).

## Implementation steps (not started)

1. **Worker entry** `media-src/src/diagram-worker.ts`: message `{id, lang:'d2', source, theme}` →
   compile + layout + measure (OffscreenCanvas) + toSVG → `{id, svg}` or `{id, error}`. Reuse
   `renderD2Graph`/`canvasMeasure`/elk wiring from `d2-render.ts` + `elk-layout.ts` (swap the
   canvas + ELK fake-worker for worker-native equivalents).
2. **Build**: esbuild target → `media/vditor/dist/js/diagram-worker.js` (servable; `document={}`
   banner). Add to `build.mjs`; pin/copy like the elk bundle.
3. **Main-thread loader** `media-src/src/diagram-worker-host.ts`: create `new Worker(<resource URL>)`,
   promise-per-request by id, terminate/idle policy, error→fallback.
4. **Wire d2** in `custom-diagrams.ts` (observeCustomDiagrams d2 path): if worker available, render
   via worker → swap; else current path. Keep `isTyping()`/settle gating (or render live, since it
   no longer blocks — measure).
5. **Font** in the worker via `FontFace` from the bundled `media/fonts/`.
6. **Setting** `vmde.advanced.offThreadDiagrams` (default ON, opt-out) — protocol + extension.ts +
   package.json (mirror `fastDiagramEdit`).
7. **Tests:** unit (worker message contract; OffscreenCanvas measure parity with canvasMeasure);
   real-VS-Code e2e (d2 renders via worker, SVG correct, main thread responsive during render,
   fallback when worker disabled). Coverage.
8. **Phase 2 (same worker):** add graphviz, nomnoml, wavedrom compute to the worker — they already
   emit SVG strings with canvas/no measurement, so it's per-lang compute behind the same harness.
9. **Phase 3 (borderline, small refactors):** vega/vega-lite (pass fg color as data, drop the
   `getComputedStyle` read + interactivity), then plantuml + smiles (refactor the TeaVM/SmilesDrawer
   draw to EMIT a string instead of `createElementNS` into a live element; pass theme as data).
10. **Independent of workers — source+theme→SVG LRU cache** (helps the 9 main-thread engines AND the
    worker ones on repeat renders): key `hash(source)+theme`, hit → reuse SVG, skip the engine. Makes
    undo/redo / re-open / mode-switch instant. No trade-off. → **Now Pillar 3 of task 183** (the
    content-hash cache); implemented there, not separately here.
11. ~~**mermaid only — `flowchart.htmlLabels:false` experiment**~~ → **SPIKED + DISPROVEN 2026-07-01**
    (`mermaid-htmllabels-spike`): no meaningful render cut (getBBox×119 dominates). Dropped — see the
    on-thread-levers section above.

## Open (low-risk) unknowns for implementation
- ~~d2 **WASM** in a worker~~ — ✅ RESOLVED (task 183 Phase 0.1, 2026-07-01): boots + compiles in a
  webview worker under the real CSP (`'unsafe-eval'` suffices, no `'wasm-unsafe-eval'`). Method: inline
  `wasm_exec.js` + transfer the `.wasm` ArrayBuffer (NO runtime `importScripts`/`fetch` — those hang
  cross-origin in a blob worker). NOTE: moot for the recommended Tier 1, which keeps compile on main.
- Worker boot cost / keep-warm (don't respawn per keystroke — pool one worker).
- Theme re-render (palette) through the worker path (pass theme in the message).

## Artifacts in the tree (spikes — diagnostic, can be removed once implemented)
- `test/vscode-e2e/diagram-resettle-spike.spec.ts` (+ fixture `diagram-resettle-spike.md`) — render-all? → no.
- `test/vscode-e2e/render-cost-spike.spec.ts` (+ fixture `render-cost-spike.md`) — per-engine render cost.
- `test/vscode-e2e/worker-feasibility-spike.spec.ts` — workers run in the webview.
- `test/vscode-e2e/elk-worker-spike.spec.ts` (+ `tmp/elk-spike/` bundle) — elkjs + OffscreenCanvas in a worker.
