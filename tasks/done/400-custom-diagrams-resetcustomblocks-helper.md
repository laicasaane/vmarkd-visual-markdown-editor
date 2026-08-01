# Task 400 — Extract a shared `resetCustomBlocks()` helper in `custom-diagrams.ts`

**Status:** ✅ DONE (2026-07-27) · **Impact:** 🟢 low/mechanical · **Origin:** Fable architecture review (2026-07-27)

## Outcome

Fixed via strict TDD. Wrote 7 failing unit tests first (`resetCustomBlocks (task 400)` in
`custom-diagrams.test.ts`) against the not-yet-existing `resetCustomBlocks` export — verified
RED (`TypeError: resetCustomBlocks is not a function`). Implemented
`resetCustomBlocks(container, lang, errorAttr?)`, `lang` accepting `string | string[]` for the
vega/vega-lite wrinkle.

Two genuine per-engine wrinkles found by reading the 6 bodies side-by-side (matching the
task's "audit for a genuine wrinkle" instruction):
- **wavedrom** and **vega** each clear an error attribute (`data-wavedrom-error`,
  `data-vega-error`) that `faithfulRender` sets on failure; nomnoml/geojson/topojson/stl use
  plain `renderDiagramError` (no swap-on-success, no attribute) so they pass no `errorAttr`.
- **vega + vega-lite share ONE reset pass**: `renderVegaBlock` (used by both `renderVega` and
  `renderVegaLite`) always calls `faithfulRender(wrapper, 'vega', …)` — the literal `'vega'`,
  not the block's actual lang — so vega-lite blocks carry `data-vega-error` too, never
  `data-vega-lite-error`. Passing `['vega', 'vega-lite']` + `'data-vega-error'` preserves this
  exactly; getting this wrong would have been the "5 of 6 copies" bug the task exists to kill.

`reRenderD2` (WASM/worker-backed, out of scope) was left untouched — confirmed unchanged.

Verified GREEN: 31/31 tests in `custom-diagrams.test.ts` (24 pre-existing + 7 new), full unit
suite 1781/1781, typecheck clean, `lint:ci` clean (497 files), coverage ratchet OK (30 modules
at 0%, baseline 30 — no regression from either this task or 407). File: 1182→1131 lines (measurable
shrink despite the new exported function and its doc comment, since 6 call sites collapsed
from ~15 lines to ~3 each). Real-VS-Code e2e: ran (not just inspected)
`xvfb-run -a npm --prefix test/vscode-e2e test -- retheme-flip-matrix.spec.ts` after
`node build.mjs` — **1 passed** (27.7s), confirming wavedrom (8→8 els, 4→4 svgs), nomnoml
(4→4/2→2), geojson (2→2/1→1) and vega-lite (4→4/2→2) all re-render correctly on a live theme
flip with no duplication or drop, across all 4 touched engines plus the 2 untouched ones
sharing the reset call (topojson has no dedicated theme-flip lane in this spec; its unit
coverage above stands in for it).

## Problem

`media-src/src/custom-diagrams.ts` (1182 lines) has a near-identical
`reRenderX`-shaped function repeated for each bespoke custom-diagram engine —
wavedrom, nomnoml, geojson, topojson, vega, vega-lite, stl (roughly six copies of the
same 10–15 lines: clear `data-processed`/error attributes, blank `innerHTML`,
re-invoke that engine's render). `media-src/src/engine-registry.ts` already carries the
per-engine metadata (`lang`, `family`) that could drive this from one place — it closes
exactly the "fixed it in 5 of 6 copies" bug class that `engine-registry.ts` was
introduced to prevent for the *other* per-engine lists (see its own file comment / task
history).

## Scope

- [x] Add `resetCustomBlocks(container, lang, extraAttrs?)` — shipped as
      `resetCustomBlocks(container, lang: string | string[], errorAttr?: string)`.
- [x] Replace the six existing `reRenderX` bodies (wavedrom, nomnoml, geojson, topojson,
      vega, vega-lite, stl) with calls to the shared helper. Confirmed the list was
      unchanged since the review (still exactly these 6 + the out-of-scope D2).
- [x] Audit for any engine whose reset sequence has a genuine per-engine wrinkle. Found two
      (not STL — see Outcome): wavedrom/vega's error-attribute clear, and vega-lite's shared
      `data-vega-error` (not `data-vega-lite-error`). Both preserved via the `errorAttr` param.

## Out of scope

- Restructuring how these engines are invoked or adding new engines.
- Touching the WASM/worker-backed engine families (mermaid/D2/PlantUML/Graphviz) — this
  is specifically about the bespoke custom-diagram re-render duplication.

## Verification

- [x] Existing per-engine unit tests (wavedrom, nomnoml, geojson, topojson, vega,
      vega-lite, stl) continue to pass unmodified (31/31 in `custom-diagrams.test.ts`,
      1781/1781 full suite).
- [x] Real-VS-Code e2e coverage re-run: `retheme-flip-matrix.spec.ts`, 1 passed — wavedrom,
      nomnoml, geojson, vega-lite (4 of 6 touched engines) all re-render correctly with no
      duplication/drop on a live theme flip. (topojson/vega/stl have no dedicated lane in this
      spec; their unit-level coverage above stands in.)
- [x] File shrinks measurably: `custom-diagrams.ts` 1182→1131 lines; no new
      `engine-registry.ts` entries needed.
