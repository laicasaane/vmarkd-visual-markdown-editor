# Task 412 — Generalize task 166's viewport-gating beyond mermaid

**Status:** planned — perf, systemic generalization · **Impact:** 🔴 high (offscreen diagrams pay full render cost on every theme flip) · **Origin:** Fable performance audit (2026-07-27), finding #1

## Problem

Task 166 (shipped 2026-07-05) fixed mermaid's theme-flip cost with an IntersectionObserver:
only the diagram(s) actually visible in the viewport re-render immediately on a flip; offscreen
ones defer until they scroll into view. Task 166's own measurement: a flip that would otherwise
have re-rendered 12 diagrams with only 1 visible cut ~90% of the wasted work.

That mechanism was never generalized. Verified by reading current code (2026-07-27):

- `reThemeMono` (`plantuml-retheme.ts:11-25`) — covers **plantuml, graphviz, abc, wavedrom,
  nomnoml** — does `editorEl.querySelectorAll('.vditor-ir__preview, .vditor-wysiwyg__preview')`
  and re-renders EVERY matching block unconditionally, no viewport check.
- `reRenderEcharts` (`echarts-retheme.ts:30-37`) disposes + reinits every ECharts instance,
  visible or not.
- `reRenderD2` (`custom-diagrams.ts:586-602`) clears + re-renders every D2 block. (Also has its
  own double-fire/cache-bypass bug — see [task 411](411-d2-geo-retheme-double-fire-and-cache-bypass.md),
  which should land first since it touches the same function.)

Task 166's own file never mentions echarts/plantuml/graphviz/d2 — confirming this was scoped to
mermaid only, not generalized.

Impact is highest for the mono group: PlantUML C4 diagrams measured ~2.2s/render (tasks 349/352,
the engine re-preprocesses ~2000 lines of stdlib every call — an accepted "irreducible floor"
for a single VISIBLE render). A doc with several offscreen PlantUML/Graphviz/D2 blocks (common
in an architecture-heavy doc) pays that full cost, per block, on every theme flip, even though
nothing is visible — potentially several seconds of main-thread block, worse than the mermaid
case task 166 fixed (a dagre relayout is far cheaper than a TeaVM/WASM compile).

## Scope

- [ ] Extract task 166's IntersectionObserver-gate mechanism (`mermaid-retheme.ts`) into a
      shared, engine-agnostic helper: given a set of target elements and a re-render callback,
      render the currently-intersecting ones immediately and defer the rest behind one shared
      observer that fires the callback (re-reading the CURRENT theme at fire time, not the
      theme at flip time — an offscreen diagram may scroll into view well after the flip) when
      each element scrolls into view.
- [ ] Wire `reThemeMono` (plantuml/graphviz/abc/wavedrom/nomnoml) through it.
- [ ] Wire `reRenderEcharts` through it.
- [ ] Wire `reRenderD2` through it — sequence AFTER [task 411](411-d2-geo-retheme-double-fire-and-cache-bypass.md)
      lands, so this doesn't have to also fix the double-fire/cache-bypass bug in the same pass.
- [ ] Decide whether geojson/topojson (Leaflet maps) belong in this generalization or are a
      deliberate exception (a Leaflet map's layout cost on becoming visible may differ enough
      from a redraw to warrant its own call — check before assuming symmetry with D2).

## Out of scope

- STL (`retheme: 'none'`, theme-independent material) and markmap (`retheme: 'none'`) —
  correctly never re-theme at all, nothing to gate.
- smiles — fires 3× on a flip but each call is an idempotent cheap CSS-luminance check, not a
  real re-render; not a viewport-gating candidate.
- The off-thread D2 worker (task 182) — orthogonal, about per-call cost not call frequency.

## Verification

- [ ] Unit test for the shared viewport-gate helper: given N target elements with M visible,
      assert exactly M immediate callback invocations and the remaining N-M deferred until each
      individually intersects.
- [ ] Real-VS-Code e2e (webview-affecting change, per AGENTS.md), extending
      `test/vscode-e2e/retheme-flip-matrix.spec.ts`: a doc with several PlantUML/Graphviz/D2/
      ECharts blocks below the fold, flip the theme, assert only the visible ones re-render
      immediately and the offscreen ones re-render on scroll-into-view (not before).
- [ ] No regression: every engine covered by this task still re-themes correctly once visible —
      re-run the full retheme e2e suite.
