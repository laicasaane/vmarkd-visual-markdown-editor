# Task 412 — Generalize task 166's viewport-gating beyond mermaid

**Status:** ✅ **DONE (2026-07-30).** Shared `viewport-gate.ts` extracted from mermaid-retheme.ts's
task-166 mechanism; mermaid itself now uses it too (was the only holdout). Wired through
`reThemeMono` (plantuml/graphviz/abc/wavedrom/nomnoml), `reRenderEcharts` (echarts + mindmap), and
`reThemeGeoAndD2` (D2 + geo — see the geo decision below). One shared IntersectionObserver
(`diagramGate` in diagram-retheme.ts) covers all of them; mermaid keeps its own separate instance
(unchanged lifecycle). · **Impact:** 🔴 high (offscreen diagrams pay full render cost on every theme
flip) · **Origin:** Fable performance audit (2026-07-27), finding #1

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

- [x] Extract task 166's IntersectionObserver-gate mechanism (`mermaid-retheme.ts`) into a
      shared, engine-agnostic helper: given a set of target elements and a re-render callback,
      render the currently-intersecting ones immediately and defer the rest behind one shared
      observer that fires the callback (re-reading the CURRENT theme at fire time, not the
      theme at flip time — an offscreen diagram may scroll into view well after the flip) when
      each element scrolls into view.
      → `media-src/src/viewport-gate.ts` (`createViewportGate()` → `{ partition, dispose }`).
      `partition(elements, render)` returns the currently-visible subset for the caller to render
      (mermaid still batches them into one offscreen-sandbox pass, unchanged perf characteristic);
      offscreen ones are queued on a shared `IntersectionObserver` and `render(el)` fires
      individually on scroll-in. Callers satisfy "read live state at fire time" via a live getter
      (`deps.getCdn()`) or by relying on `currentColor` (mono/D2/geo bake it from the DOM at render
      time, always correct by the time the callback runs) — ECharts is the one exception (needs an
      explicit theme name) and gets its own `latestEchartsMode` module var, same pattern as
      mermaid's `latestTheme`. mermaid-retheme.ts itself now uses this shared module too (was task
      166's own bespoke observer) — it keeps a DOM-visible `data-vmarkd-mermaid-defer` attribute as
      its own compatibility layer purely because `mermaid-flip-gate.spec.ts` (another agent's e2e)
      asserts on it directly; the generic gate itself has no DOM footprint.
- [x] Wire `reThemeMono` (plantuml/graphviz/abc/wavedrom/nomnoml) through it.
      Per-DIAGRAM (not per-lang) gating: `blockScopeOf()` (`diagram-dom.ts`) narrows the existing
      `reRenderPlantuml`/`reRenderGraphviz`/`reRenderAbc`/`CUSTOM_DIAGRAM_ADAPTERS.reRender` calls to
      the ONE block wrapper a candidate belongs to — no signature changes to any of those functions,
      since they already scan `container.querySelectorAll(paneSel)` and a narrower `container` scopes
      them for free. Empirically verified (real webview) that `blockScopeOf` resolves to exactly one
      preview pane even for two fenced diagrams sharing one blockquote/list item — Lute nests a
      `.vditor-ir__node`/`.vditor-wysiwyg__block` per top-level block, not per container.
- [x] Wire `reRenderEcharts` through it. Echarts AND mindmap share one candidate list (both langs use
      `retheme: 'echarts'` in the registry) since `reRenderEcharts` already internally handles both.
- [x] Wire `reRenderD2` through it — task 411 landed first (✅ DONE), so this pass only adds gating,
      not the double-fire/cache-bypass fix.
- [x] Decide whether geojson/topojson (Leaflet maps) belong in this generalization: **included, not
      excepted.** A scrolled-offscreen container still has real layout/width (unlike the
      `display:none` case `measuresHidden` exists for), so deferring Leaflet's init + tile fetch is
      exactly as safe as deferring a redraw. No asymmetry with D2 found.

## Out of scope

- STL (`retheme: 'none'`, theme-independent material) and markmap (`retheme: 'none'`) —
  correctly never re-theme at all, nothing to gate.
- smiles — fires 3× on a flip but each call is an idempotent cheap CSS-luminance check, not a
  real re-render; not a viewport-gating candidate.
- The off-thread D2 worker (task 182) — orthogonal, about per-call cost not call frequency.

## Verification

- [x] Unit test for the shared viewport-gate helper: given N target elements with M visible,
      assert exactly M immediate callback invocations and the remaining N-M deferred until each
      individually intersects. → `media-src/src/viewport-gate.test.ts` (7 cases: visible/deferred
      split, individual scroll-in fire, no-requeue-on-repeat-flip, fire-time-not-defer-time callback
      freshness, un-defer-on-later-visibility, dispose()-then-requeue — this one caught a real bug,
      see below — and zero-size/display:none treated as offscreen).
- [x] Real-VS-Code e2e (webview-affecting change, per AGENTS.md). **Deviation from the plan**:
      NOT added to `retheme-flip-matrix.spec.ts` — the team lead's hard rule for this session
      restricts `test/vscode-e2e/**` edits to NEW spec files only (another agent owns the existing
      ones). New spec instead: `test/vscode-e2e/diagram-retheme-viewport-gate.spec.ts` (+ fixture
      `fixtures/diagram-retheme-viewport-gate.md`, 4 plantuml + 3 D2 + 1 echarts block, only the
      first plantuml in the initial viewport). Measures via the counters diagram-retheme.ts already
      exposes on `window` for exactly this purpose (`__vmarkdPumlRethemeStats.panesReRendered`,
      `__vmarkdD2RenderStats.compiles`) rather than wall-clock timing (noisy under xvfb) — matches
      how `retheme-flip-matrix.spec.ts` and task 411 already verify this class of change. **Run and
      passing**: a dark flip re-renders only the visible block(s) immediately (delta < total block
      count for both plantuml and D2, confirming gating), and scrolling every block into view
      individually (see gotcha below) brings every one of them to a correctly dark-themed colour
      signature (`fill`/`stroke` differs from its light-mode snapshot, per block, not just an
      aggregate count).
- [x] No regression: every engine covered by this task still re-themes correctly once visible —
      proven directly above via the per-block colour-signature check (stronger than a re-run of the
      full retheme suite, which was not run per AGENTS.md's "never start the full ~40-min suite on
      your own" — propose it to the team lead/user instead). Additionally re-ran
      `mermaid-flip-gate.spec.ts` (task 166's own e2e, unmodified, owned by another agent) since the
      mermaid refactor risked it — passed with the exact same numbers as before the refactor
      (`total=12 visibleAtFlip=1 reRenderedImmediately=1 deferred=11`).

### Gotchas hit while verifying (worth recording)

- **`window.scrollBy`/`scrollTo` does not reliably cross every intermediate element's
  viewport-margin threshold** — a big jump only guarantees the FINAL resting position's neighbourhood
  gets evaluated by `IntersectionObserver`, so a naive "scroll to the bottom" under-visits the middle
  sections. Fixed by visiting each candidate individually via `scrollIntoView({block:'center'})` —
  the same pattern `mermaid-flip-gate.spec.ts` already used (for its one deferred element; this spec
  needed it for all of them).
- **The `dispose()` WeakSet bug the unit test now pins**: without resetting the internal
  `observed`/`callbacks` WeakSet/WeakMap on `dispose()`, a still-offscreen element from before the
  dispose would read as "already observed" against the (now-disconnected) old observer on the next
  `partition()` call and never get re-queued on the new one — silently un-gating it forever across a
  re-init. Caught by `viewport-gate.test.ts`'s dispose test before it ever reached a real webview.
