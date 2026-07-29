# Task 410 Loud Script-Load Failure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the shared themed error box whenever any lazy dependency for GeoJSON, TopoJSON, nomnoml, STL, WaveDrom, Vega, or Vega-Lite fails to initialize.

**Architecture:** Keep `loadScript` unchanged and classify failure at each engine's existing post-load global check. A shared `renderDiagramLoadError` presentation helper renders a deterministic terminal box for every affected wrapper, while engine modules remain responsible for naming their required dependency.

**Tech Stack:** TypeScript, Vitest/jsdom, Playwright Chromium harness, `vscode-test-playwright`, VS Code webview, Biome.

## Global Constraints

- Preserve `loadScript(src, id): Promise<void>` and its resolve-on-error behavior.
- Do not add retry behavior or new dependencies.
- Cover GeoJSON, TopoJSON, nomnoml, STL, WaveDrom, Vega, and Vega-Lite.
- Every new webview behavior requires unit, browser e2e, and real-VS-Code e2e coverage.
- Run browser and VS Code tests headlessly with `xvfb-run -a`.
- Preserve unrelated user changes in `media-src/src/render-cache-client.ts`, `package.json`, and `test/vscode-e2e/d2-content-theme-flip.spec.ts`.

---

### Task 1: Shared terminal load-error boundary

**Files:**
- Modify: `media-src/src/diagram-error.ts`
- Modify: `media-src/src/diagram-error.test.ts`

**Interfaces:**
- Consumes: `renderDiagramError(el: HTMLElement, engine: string, message: unknown): void`
- Produces: `renderDiagramLoadError(blocks: readonly { wrapper: HTMLElement }[], engine: string, dependency: string): void`

- [ ] **Step 1: Write the failing helper unit test**

Add a test that creates two wrappers with stale SVG content, calls:

```ts
renderDiagramLoadError(
  [{ wrapper: first }, { wrapper: second }],
  'geojson',
  'Leaflet',
)
```

Assert on both wrappers:

```ts
expect(wrapper.querySelector('.vmarkd-diagram-error')).not.toBeNull()
expect(wrapper.textContent).toContain('Leaflet')
expect(wrapper.textContent).toContain('failed to load')
expect(wrapper.dataset.geojsonError).toBe('load')
expect(wrapper.dataset.processed).toBe('true')
expect(wrapper.querySelector('svg')).toBeNull()
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
npx vitest run --config test/vitest.config.ts media-src/src/diagram-error.test.ts
```

Expected: failure because `renderDiagramLoadError` is not exported.

- [ ] **Step 3: Implement the minimal helper**

Add:

```ts
export function renderDiagramLoadError(
  blocks: readonly { wrapper: HTMLElement }[],
  engine: string,
  dependency: string,
): void {
  for (const { wrapper } of blocks) {
    renderDiagramError(
      wrapper,
      engine,
      `${dependency} renderer dependency failed to load.`,
    )
    wrapper.setAttribute(`data-${engine}-error`, 'load')
    wrapper.setAttribute('data-processed', 'true')
  }
}
```

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run the command from Step 2. Expected: all `diagram-error.test.ts` tests pass.

- [ ] **Step 5: Commit the helper**

```bash
git add -- media-src/src/diagram-error.ts media-src/src/diagram-error.test.ts
git commit -m "feat(diagrams): add script load error boundary (410)"
```

---

### Task 2: Connect every missing-global branch

**Files:**
- Modify: `media-src/src/diagram-engines/geojson-topojson.ts`
- Modify: `media-src/src/diagram-engines/geojson-topojson.test.ts`
- Modify: `media-src/src/diagram-engines/nomnoml.ts`
- Modify: `media-src/src/diagram-engines/nomnoml.test.ts`
- Modify: `media-src/src/diagram-engines/stl.ts`
- Modify: `media-src/src/diagram-engines/stl.test.ts`
- Modify: `media-src/src/diagram-engines/wavedrom.ts`
- Modify: `media-src/src/diagram-engines/wavedrom.test.ts`
- Modify: `media-src/src/diagram-engines/vega.ts`
- Modify: `media-src/src/diagram-engines/vega.test.ts`

**Interfaces:**
- Consumes: `renderDiagramLoadError(blocks, engine, dependency): void`
- Produces: loud post-load failure paths for all seven public language renderers.

- [ ] **Step 1: Add missing-global unit tests**

For each module, create a matching language wrapper with valid `data-code`, call its
public renderer, dispatch `error` on the injected script tag without installing the
expected window global, wait one macrotask, and assert the wrapper contains the error
box and terminal attributes.

Use these exact identities:

```ts
[
  ['geojson', renderGeojson, 'vditorLeafletScript', 'Leaflet'],
  ['topojson', renderTopojson, ['vditorLeafletScript', 'vditorTopojsonScript'], 'Leaflet and TopoJSON'],
  ['nomnoml', renderNomnoml, 'vditorNomnomlScript', 'nomnoml'],
  ['stl', renderStl, 'vditorThreeStlScript', 'Three.js STL'],
  ['wavedrom', renderWavedrom, 'vditorWavedromScript', 'WaveDrom'],
]
```

In `vega.test.ts`, test `renderVega` and `renderVegaLite` separately; both settle
`vditorVegaScript`, expect a `Vega` box, and expect `data-vega-error="load"`.
Reset `document.head`, `document.body`, and the corresponding globals between tests so
the loader's script-element marker cannot leak between cases.

- [ ] **Step 2: Run engine tests and confirm RED**

Run:

```bash
npx vitest run --config test/vitest.config.ts \
  media-src/src/diagram-engines/geojson-topojson.test.ts \
  media-src/src/diagram-engines/nomnoml.test.ts \
  media-src/src/diagram-engines/stl.test.ts \
  media-src/src/diagram-engines/wavedrom.test.ts \
  media-src/src/diagram-engines/vega.test.ts
```

Expected: the new tests fail because wrappers remain source-only or blank.

- [ ] **Step 3: Replace silent returns with the shared boundary**

Import `renderDiagramLoadError` in each module and use these branches:

```ts
if (!window.L) {
  renderDiagramLoadError(blocks, 'geojson', 'Leaflet')
  return
}
```

```ts
if (!window.L || !window.topojson) {
  renderDiagramLoadError(blocks, 'topojson', 'Leaflet and TopoJSON')
  return
}
```

```ts
if (!nn?.renderSvg) {
  renderDiagramLoadError(blocks, 'nomnoml', 'nomnoml')
  return
}
```

```ts
if (!window.__threeSTL) {
  renderDiagramLoadError(blocks, 'stl', 'Three.js STL')
  return
}
```

```ts
if (!wd?.renderWaveForm) {
  renderDiagramLoadError(blocks, 'wavedrom', 'WaveDrom')
  return
}
```

Move Vega's check to its shared block function:

```ts
if (!ve) {
  renderDiagramLoadError(blocks, 'vega', 'Vega')
  return
}
```

- [ ] **Step 4: Run focused engine tests and confirm GREEN**

Run the command from Step 2. Expected: all focused tests pass.

- [ ] **Step 5: Commit engine integration**

```bash
git add -- media-src/src/diagram-engines
git commit -m "fix(diagrams): show failed script loads (410)"
```

---

### Task 3: Browser and real-VS-Code acceptance coverage

**Files:**
- Modify: `media-src/e2e/custom-diagrams-harness.ts`
- Create: `media-src/e2e/custom-diagrams-load-failure.spec.ts`
- Create: `test/vscode-e2e/fixtures/script-load-failures.md`
- Create: `test/vscode-e2e/script-load-failures.spec.ts`

**Interfaces:**
- Consumes: the seven public language render paths and `.vmarkd-diagram-error`.
- Produces: end-to-end proof that aborted dependency requests never leave blank previews.

- [ ] **Step 1: Extend the browser fixture to include raw Vega**

Add a valid `vega` block next to the existing `vega-lite` block so both public paths can
be asserted.

- [ ] **Step 2: Add the browser request-failure test**

Create `custom-diagrams-load-failure.spec.ts` without importing the successful-render
spec's `beforeEach`. Before navigation, register routes that abort only:

```text
**/dist/js/leaflet/leaflet.js
**/dist/js/topojson/topojson-client.min.js
**/dist/js/nomnoml/nomnoml.min.js
**/dist/js/threejs/three-stl.min.js
**/dist/js/wavedrom/wavedrom.min.js
**/dist/js/vega/vega-embed.min.js
```

Open `/custom-diagrams.html`, wait for the seven language wrappers to contain
`.vmarkd-diagram-error`, then assert all wrappers are non-empty and processed.

- [ ] **Step 3: Add the real-VS-Code fixture and spec**

The fixture contains one valid block for each of the seven languages. Before opening it,
register `workbox.route` aborts for the six exact asset suffixes above. Open it with
`vmarkd.editor`, wait until all seven preview wrappers contain error boxes, and assert:

```ts
{
  errorCount: 7,
  emptyCount: 0,
  sourceErrorCount: 0,
  processedCount: 7,
  titles: ['GeoJSON', 'TopoJSON', 'nomnoml', 'STL', 'WaveDrom', 'Vega', 'Vega'],
}
```

Also read `window.vditor.getValue()` and verify it still includes every original fenced
language marker.

- [ ] **Step 4: Run acceptance tests**

Run:

```bash
xvfb-run -a npm --prefix media-src run test:e2e -- custom-diagrams-load-failure.spec.ts
node build.mjs
xvfb-run -a npm --prefix test/vscode-e2e test -- script-load-failures.spec.ts
```

Expected: both specs pass headlessly.

- [ ] **Step 5: Commit acceptance coverage**

```bash
git add -- media-src/e2e/custom-diagrams-harness.ts media-src/e2e/custom-diagrams-load-failure.spec.ts \
  test/vscode-e2e/fixtures/script-load-failures.md test/vscode-e2e/script-load-failures.spec.ts
git commit -m "test(diagrams): cover failed renderer loads (410)"
```

---

### Task 4: Coverage, regression gates, and task status

**Files:**
- Modify: `tasks/410-loud-failure-on-script-load-failure.md`
- Modify: `tasks/README.md` only if Task 410 has a matching index entry.

**Interfaces:**
- Consumes: completed implementation and test evidence.
- Produces: repository status that accurately records completion.

- [ ] **Step 1: Run the complete verification matrix**

```bash
npm run test:coverage
xvfb-run -a npm --prefix media-src run test:e2e:coverage
node build.mjs
npm run typecheck
npm run lint:ci
xvfb-run -a npm run test:vscode:fast
xvfb-run -a npm --prefix test/vscode-e2e test -- script-load-failures.spec.ts
```

Confirm the text/HTML coverage reports exercise `renderDiagramLoadError` and every
missing-global branch. Do not lower coverage thresholds.

- [ ] **Step 2: Update task tracking**

Check every implemented Scope and Verification item, replace the task status with
`✅ DONE`, and explicitly record that WaveDrom and Vega/Vega-Lite shared the gap and are
covered. Update `tasks/README.md` only if its existing Task 410 row needs the done marker.

- [ ] **Step 3: Re-run formatting checks for tracking changes**

```bash
git diff --check
npm run lint:ci
git status --short
```

Verify unrelated pre-existing changes remain unstaged and unmodified.

- [ ] **Step 4: Commit task completion**

```bash
git add -- tasks/410-loud-failure-on-script-load-failure.md tasks/README.md
git commit -m "docs(tasks): complete loud script failures (410)"
```
