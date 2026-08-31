# Task 531 — Unified on-screen diagram viewport controls

> **Status:** ✅ DONE 2026-08-31 · **Impact:** 🟡 medium · **Origin:** Project Owner interaction design,
> 2026-08-31 · **Depends on:** [Task 158](done/158-diagram-inline-zoom-pan.md) and
> [Task 459](done/459-a11y-diagram-zoom-and-callout.md) · **Blocks:**
> [Task 157](157-diagram-fullscreen-preview.md)

## 1. Goal

Add one visible, front-end-only control bar to every currently zoom-capable rendered diagram. The
bar must be independent of the renderer behind it while routing each action through that renderer's
existing viewport authority, never through a second competing transform.

Task 531 ships the reusable control bar and its inline mounting. Task 157 consumes the same control
bar, controller, and live state inside the future fullscreen preview; it must not build a second
fullscreen-only toolbar.

## 2. Current behavior and problem

VMDE already has the interaction mechanisms but no discoverable on-screen control surface:

- `media-src/src/diagrams/diagram-zoom.ts` owns CSS-transform zoom/pan/reset for the six
  `zoom: 'static'` engines: Mermaid, Flowchart, Graphviz, ABC, SMILES, and D2.
- `media-src/src/diagrams/diagram-zoom-gate.ts` gates the four `zoom: 'gated'` engines behind
  Ctrl/Cmd: Markmap, ECharts mindmap, GeoJSON, and TopoJSON.
- `media-src/src/diagrams/diagram-zoom-keys-gated.ts` routes `+`/`-`/`0` to Markmap and Leaflet's
  own APIs and uses ECharts mindmap's existing wheel pipeline for `+`/`-`. Mindmap reset is currently
  a documented no-op.
- Task 158 left a native-fullscreen button implementation behind `FULLSCREEN_BUTTON = false`. It is
  not a usable control bar and Task 157 must replace that dead-end entry point.
- Leaflet supplies a separate native `+`/`-` control. Keeping it beside the new shared bar would
  create two competing control surfaces for the same map.

The user-visible result is modifier-only interaction with inconsistent affordances across engines.
Users cannot discover zoom, deliberately enter a plain-left-drag pan mode, or reliably reset every
zoomable renderer from one consistent surface.

## 3. Product contract

### 3.1. One control bar

- Mount one `.vmde-diagram-controls` bar at the top-right of every rendered diagram whose
  `engine-registry.ts` descriptor has `zoom !== 'none'`. Derive this inventory from the registry;
  do not add a second handwritten language list.
- The bar is visible whenever the rendered diagram is visible. Do not make essential controls
  hover-only. It may increase contrast on hover, focus, or active state.
- Task 531's inline row is ordered: **Pan**, **Zoom out**, **Zoom in**, **Reset**.
- The reusable builder accepts an optional fullscreen action. When Task 157 supplies it, the one
  final row is ordered: **Pan**, **Zoom out**, **Zoom in**, **Fullscreen/Exit fullscreen**,
  **Reset**. Reset remains the final control.
- Do not render an inert, disabled, or placeholder fullscreen button before Task 157 provides a
  working action.
- Every action is a semantic `<button type="button">` with an exact accessible name and tooltip.
  Decorative SVG/icon content is hidden from assistive technology. Provide visible
  `:focus-visible`, hover, pressed, disabled, and high-contrast-safe states using VS Code theme
  variables.
- Use the existing Vditor icon sprite where it has a suitable glyph. A missing pan/reset glyph may
  use a small repository-owned inline SVG; do not add a dependency, bitmap, font, or generated
  asset.

### 3.2. Pan mode

- Pan is an independent per-diagram toggle exposed with `aria-pressed="false|true"` and a persistent
  active visual state.
- **Pan off:** preserve today's contract. Plain left-drag follows the surface's ordinary behavior;
  Ctrl/Cmd+left-drag pans. Plain wheel scrolls the document; Ctrl/Cmd+wheel zooms.
- **Pan on:** plain left-drag pans that diagram without Ctrl/Cmd. Ctrl/Cmd+left-drag remains valid.
  Wheel behavior does not change: the toggle removes only the keyboard companion from panning.
- While a pan gesture is active, show `grab`/`grabbing`, suppress text selection, and prevent the
  gesture/click from expanding an IR/WYSIWYG source block. Turning Pan off restores the ordinary
  click-to-edit path.
- The toggle remains on until explicitly changed, the diagram wrapper is destroyed, or the editor
  instance is replaced. Reset changes the viewport, not the selected interaction tool. A renderer
  replacing only its inner SVG/canvas must not silently clear the mode.

### 3.3. Zoom and reset

- Zoom out and Zoom in act immediately without a modifier and zoom around the diagram viewport
  centre. Preserve each engine's current step/clamp behavior unless a single shared constant already
  represents it.
- Reset restores the renderer's initial fit/view and zero pan offset without changing the Pan toggle.
  It is an actual operation for every toolbar-bearing renderer; ECharts mindmap may no longer treat
  it as a no-op.
- Keep the existing Ctrl/Cmd+wheel, Ctrl/Cmd+drag, double-click reset, and focused `+`/`-`/`0`
  interaction paths. They call the same controller operations as the bar rather than retaining a
  parallel implementation.
- Toolbar interaction, zoom, pan, and reset must not change Markdown bytes, selection/caret, undo
  history, scroll outside the diagram, or host document state.

### 3.4. Fullscreen dependency seam

- The bar builder exposes one optional fullscreen action and active label/state; it contains no
  native Fullscreen API or overlay policy of its own.
- Task 157 supplies the fullscreen action, mounts or moves this same bar with the same
  `DiagramViewportController`, and changes the action between `Fullscreen diagram` and
  `Exit fullscreen`.
- Zoom level, pan offset, and Pan toggle state must survive the inline-to-fullscreen transition and
  return. Task 157 owns the overlay/native-surface decision, Escape/close behavior, backdrop, and
  fullscreen lifecycle.

## 4. Front-end architecture

### 4.1. Renderer-independent controller

Create one public UI boundary with this behavioral shape (exact names may follow repository naming,
but the capability split must remain):

```ts
interface DiagramViewportController {
  zoomIn(): void
  zoomOut(): void
  reset(): void
  setPanEnabled(enabled: boolean): void
  isPanEnabled(): boolean
}

interface DiagramFullscreenAction {
  isActive(): boolean
  toggle(): void
}
```

The control-bar module receives only a wrapper, `DiagramViewportController`, and optional
`DiagramFullscreenAction`. It must not branch on language classes, import renderer libraries, post a
webview message, read editor configuration, or own renderer state.

Add a front-end adapter registry keyed by `engine-registry.ts` language. A completeness assertion and
unit test must prove that every and only `zoom !== 'none'` engine resolves a controller. Keep the
pure engine descriptor registry free of function imports.

### 4.2. Existing viewport authorities

- **Static SVG:** refactor Task 158's wrapper `WeakMap`, `zoomBy`, reset, current-SVG lookup, and
  pointer handlers behind the controller. Preserve state across an inner SVG replacement.
- **Markmap:** call the retained Markmap instance's `rescale()` and `fit()`. Extend the existing
  source patch/filter so plain drag reaches d3-zoom only while this wrapper's Pan mode is active;
  do not apply a CSS transform around Markmap.
- **Leaflet (GeoJSON/TopoJSON):** call the stashed map's `zoomIn()`, `zoomOut()`, and initial
  `setView()`. Let plain drag reach Leaflet only while Pan mode is active. Configure Leaflet without
  its native zoom buttons once the unified bar is present; keep attribution and other required map
  chrome.
- **ECharts mindmap:** keep zoom on ECharts' own roam input pipeline. For Reset, factor the existing
  `reconstructMindmaps()` path into a wrapper-scoped reconstruction using the live `data-code`,
  current resolved theme, and initial tree option; dispose/recreate the ECharts instance instead of
  inventing an outer CSS transform or relying on the undocumented `treeRoam` action. Let plain drag
  reach ECharts only while Pan mode is active.

The shared gate reads the controller/pan state for the resolved wrapper. Do not duplicate the
Ctrl/plain-gesture policy in per-engine selectors.

### 4.3. DOM lifecycle and styling

- The existing `#app` mutation lifecycle decorates new/rebuilt diagrams idempotently. A wrapper gets
  one controller and one bar; repeated observer passes must not add handlers or buttons.
- Renderer-owned `innerHTML`/canvas/SVG replacement must leave or restore the one bar without leaking
  it into source serialization. Every injected control uses `data-render="1"` as defense in depth.
- Control events stop before Vditor's click-to-edit handler. Diagram gestures outside the bar keep
  the Pan-off/Pan-on behavior above.
- Replace the dead `.vmde-diagram-fs`/`FULLSCREEN_BUTTON` branch with the shared builder and remove
  obsolete CSS. Keep the control bar above SVG/canvas/map content without recreating Task 423's
  Leaflet z-index conflict.
- Follow `.agents/rules/ts.md` and `.agents/rules/css.md` for new TypeScript and CSS comments. Add
  any new modules to `scripts/module-manifest.mjs`; preserve the existing host/webview boundary.

Expected implementation surface:

- create `media-src/src/diagrams/diagram-controls.ts` and `.test.ts` for semantic bar construction,
  action dispatch, optional fullscreen insertion, and idempotent mounting;
- create `media-src/src/diagrams/diagram-viewport-controller.ts` and `.test.ts` for adapter lookup,
  capability completeness, and shared Pan state;
- refactor `media-src/src/diagrams/diagram-zoom.ts`, `diagram-zoom-gate.ts`, and
  `diagram-zoom-keys-gated.ts` plus their tests to consume the controllers;
- update `media-src/src/diagrams/engines/geojson-topojson.ts`,
  `media-src/src/diagrams/echarts-retheme.ts`, and focused tests for unified Leaflet chrome and real
  mindmap reset;
- update `media-src/esbuild-shared.mjs` and `test/backend/vditor-source-patches.test.ts` only for the
  Markmap Pan-mode filter seam required above;
- update `media-src/src/main.css`, `scripts/module-manifest.mjs`, and boundary/manifest tests as
  required by the new source modules;
- update `test/vscode-e2e/geojson-pan-gate.spec.ts`, `leaflet-chrome-theme.spec.ts`, and
  `geojson-zindex.spec.ts` so their Leaflet expectations move from the removed native zoom buttons
  to the shared bar without weakening pan-gate, theme, or stacking coverage; and
- strengthen the existing Chromium and real-VS-Code diagram interaction coverage rather than adding
  redundant VS Code boots.

## 5. Test-first acceptance

> **For implementation agents:** use `superpowers:test-driven-development` before production
> changes, `superpowers:systematic-debugging` for unexpected behavior, and
> `superpowers:verification-before-completion` before commits or completion claims. Apply the
> repository's `vmde-testing` and `vmde-visual-debugging` skills.

### 5.1. Unit and source-patch coverage

Write RED tests before production edits. Cover:

- semantic buttons, exact labels/tooltips, fixed order, decorative icon hiding, `data-render="1"`,
  and Reset always last with and without the optional fullscreen action;
- Pan `aria-pressed`/visual state, per-wrapper isolation, idempotent decoration, Reset preserving the
  toggle, inner render replacement, wrapper disposal, and event propagation into Vditor;
- adapter-registry completeness against every `zoom !== 'none'` descriptor and rejection of unknown
  or inert engines;
- static-SVG zoom/clamp/centre math, Pan-off Ctrl/Cmd gating, Pan-on plain drag, reset, click-to-edit,
  and state survival across SVG replacement;
- Markmap `rescale()`/`fit()` and the patched filter's Pan-off/Pan-on matrix;
- Leaflet `zoomIn()`/`zoomOut()`/initial `setView()`, Pan gate, and absence of duplicate native zoom
  chrome while attribution remains;
- ECharts mindmap zoom events, wrapper-scoped source/theme reconstruction on Reset, Pan gate, and a
  proven non-no-op reset after zoom/pan; and
- keyboard `+`/`-`/`0`, Ctrl/Cmd gestures, double-click reset, theme re-render, resize, mode rebuild,
  and teardown continue to use the same controllers.

Inspect changed-line coverage for every action, adapter, fallback, Pan state, reconstruction, and
cleanup branch.

### 5.2. Chromium acceptance

Add or extend a focused browser spec with realistic rendered wrappers for one static SVG, Markmap,
ECharts mindmap, and Leaflet map. Prove:

- one visible bar per zoomable wrapper and none on `zoom: 'none'` renderers;
- the four-button inline order, theme-derived computed colours, visible focus, and active Pan state;
- button zoom changes the real renderer viewport without a modifier;
- Pan off rejects a plain drag and accepts Ctrl/Cmd+drag; Pan on accepts a plain left-drag;
- Reset restores each renderer, preserves the Pan toggle, and is not a no-op for mindmap;
- an inner SVG/canvas/map rebuild yields one working bar with no duplicate handlers; and
- source serialization and surrounding page scroll remain unchanged.

Run e2e coverage and confirm the bar/controller interaction branches are exercised.

### 5.3. Real-VS-Code acceptance

Extend `test/vscode-e2e/diagram-render-sweep.spec.ts` so the existing shared boot covers the unified
bar. Use the tracked `all-renderers.md` and `diagram-zoom-keys.md` fixtures; do not inject synthetic
diagram markup as the acceptance path.

The focused no-retry candidate must prove in the actual VS Code webview:

1. every rendered `zoom !== 'none'` engine gets exactly one visible bar and inert engines get none;
2. D2 button zoom, Pan-on plain drag, Pan-off plain-drag rejection, Ctrl/Cmd fallback, and Reset all
   mutate/restore the existing transform while plain click-to-edit still works when Pan is off;
3. Markmap, mindmap, and GeoJSON buttons route through their live engine behavior; all three pan
   with plain left-drag only while Pan is active;
4. Markmap, mindmap, and GeoJSON Reset return to their initial view, including a measured non-no-op
   ECharts mindmap reset;
5. Leaflet has the shared bar but no duplicate native zoom buttons, and its attribution remains;
6. IR, WYSIWYG, and full Preview rebuilds retain one working bar per diagram without duplicate DOM or
   listeners; and
7. `getValue()`, saved bytes, caret/focus, surrounding scroll, and undo state are unchanged by every
   control and gesture.

Task 157 later extends this same acceptance path with the optional fullscreen action and state
continuity; Task 531 does not smoke-test an unavailable fullscreen placeholder.

## 6. Completion and verification

Use current `DEVELOPMENT.md` as command authority. Run focused RED/GREEN checks while implementing,
then one final aggregate quality gate; do not duplicate unchanged broad suites around it.

```bash
npx vitest run --config test/vitest.config.ts \
  media-src/src/diagrams/diagram-controls.test.ts \
  media-src/src/diagrams/diagram-viewport-controller.test.ts \
  media-src/src/diagrams/diagram-zoom.test.ts \
  media-src/src/diagrams/diagram-zoom-gate.test.ts \
  media-src/src/diagrams/diagram-zoom-keys-gated.test.ts \
  media-src/src/diagrams/engines/geojson-topojson.test.ts \
  media-src/src/diagrams/echarts-retheme.test.ts \
  test/backend/vditor-source-patches.test.ts
node build.mjs
npm run check:bundle-size
npm run check:startup-cost
npm run typecheck
npm run typecheck:strict
npm run typecheck:vscode-e2e
xvfb-run -a npm --prefix media-src run test:e2e -- diagram-controls.spec.ts
env -u ELECTRON_RUN_AS_NODE xvfb-run -a \
  npm --prefix test/vscode-e2e test -- diagram-render-sweep.spec.ts --retries=0
npm --prefix media-src run test:e2e:coverage
npm run quality
git diff --check
```

- [x] One visible, semantic, theme-aware bar is mounted on every and only zoom-capable diagram.
- [x] Pan mode removes the Ctrl/Cmd requirement from left-drag only while pressed.
- [x] Zoom out/in and Reset route through each engine's real viewport authority.
- [x] Reset is last, preserves Pan mode, and works for static SVG, Markmap, Leaflet, and ECharts
      mindmap.
- [x] Legacy modifier, double-click, and keyboard interactions remain green through the shared
      controllers.
- [x] Chromium and focused no-retry real-VS-Code acceptance pass with unchanged Markdown bytes.
- [x] Changed-line coverage, typechecks, build, budgets, quality, and diff checks pass with retries
      and residuals recorded honestly.
- [x] Task 157 names completed Task 531 as its dependency and reuses this bar/controller rather than
      adding a second fullscreen control surface.
- [x] The final diff excludes generated artifacts, `LOCAL_AGENT_TASK.md`, and unrelated user work.
- [x] Only after every acceptance item is complete: mark this task done, move it to `tasks/done/`,
      add its completed entry to `tasks/README.md`, and create focused local implementation commits.
      Do not push.

## 6.1. Implementation outcome

- `diagram-controls.ts` builds one semantic, always-visible four-button toolbar and exposes the
  optional fullscreen action seam Task 157 consumes. A `WeakSet` distinguishes live bars from inert
  renderer/cache clones, so rebuilds restore listeners without duplicates or source leakage.
- `diagram-viewport-controller.ts` derives its language inventory from `engine-registry.ts` and owns
  persistent per-wrapper Pan state. Static SVG uses Task 158's transform state; Markmap calls
  `rescale`/`fit`; Leaflet calls `zoomIn`/`zoomOut` and a forced non-animated initial `setView`; and
  mindmap zoom uses ECharts roam while Reset reconstructs its live tree/canvas.
- The shared capture gate now reads controller Pan state: plain wheel remains document scroll,
  Ctrl/Cmd gestures remain valid, and plain left-drag/click suppression changes only while Pan is
  pressed. Plain Pan drag preserves editor focus/caret; modified drag retains the keyboard-zoom
  focus entry.
- Markmap's source-patched d3 filter consults the same Pan-state seam. Leaflet's native zoom control
  is disabled (attribution retained), and mindmap reconstruction detaches/restores the same shared
  bar. The obsolete native-fullscreen button/CSS was removed.

## 6.2. Verification evidence

- Focused Vitest/source-patch set: 10 files / 273 tests passed; strict webview and real-VS-Code type
  checks passed. Markmap filter, adapter completeness, semantic order, cloned-bar repair, Pan
  isolation, Leaflet options/reset, mindmap reconstruction, and lifecycle wiring are covered.
- Focused Chromium coverage `diagram-controls.spec.ts --retries=0`: 1/1 passed; control/controller
  modules reached 81.31% and 93.49% line coverage respectively, with 88.97% across the focused
  instrumented bundle. It covers computed VS Code colors/focus, exact inventory, Pan off/on, all
  viewport actions, reset preservation, mindmap reconstruction, and unchanged source.
- Final real VS Code `diagram-render-sweep.spec.ts --retries=0`: 1/1 passed (23.2 s). The existing
  shared boot now covers exact zoomable/inert inventory, D2/Markmap/mindmap/GeoJSON controls and Pan,
  non-no-op resets, cloned/rebuilt bars, IR→WYSIWYG→full Preview, unchanged Markdown, and unchanged
  focus/caret/scroll/undo during shared-control interaction. Focused GeoJSON Pan, theme, and z-index
  specs passed 3/3 after replacing native zoom chrome.
- Visual goldens passed 6/6. `node build.mjs` passed; budgets passed at 549/552 KB, 281/281 eager
  modules, and 29.4/34 KB largest module, with lazy-engine ceilings unchanged.
- Full coverage passed 239 files / 3,448 tests (75.01% statements / 67.78% branches / 77.67%
  functions / 76.87% lines); zero-coverage ratchet remained 15/15. Aggregate brand, jscpd,
  dependency, audit, coverage, and ratchet stages passed. Final lint passed after formatting cleanup;
  knip retains only the unrelated `yazl` baseline. Early real candidates exposed pre-render JSON
  contamination, cloned inert bars, a source-vs-render mindmap selector, and Leaflet animated-reset
  races; final no-retry evidence includes all fixes.

## 7. Out of scope

- Implementing Task 157's fullscreen surface, backdrop, close/Escape lifecycle, or Fullscreen API
  fallback.
- Adding zoom to engines currently declared `zoom: 'none'`, including ordinary ECharts charts,
  PlantUML, WaveDrom, Nomnoml, Vega/Vega-Lite, and STL.
- A zoom-percentage indicator, fit-width/fit-selection variants, minimap, arrow-key panning, touch
  gestures, or persisted zoom/Pan state across document reopen.
- New settings, commands, host messages, dependencies, renderer forks, Markdown syntax, or source
  normalization.
- Redesigning the main Vditor toolbar or unrelated diagram rendering/theme/cache behavior.
