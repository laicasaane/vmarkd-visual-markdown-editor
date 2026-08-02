# Task 412 Diagram Viewport Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize Mermaid's viewport-gated theme re-render so expensive Mono, ECharts/mindmap, D2, GeoJSON, and TopoJSON diagrams redraw only when near the viewport.

**Architecture:** Add one typed, engine-independent job gate backed by one shared `IntersectionObserver`. Existing re-theme scheduling and renderer functions remain authoritative; they submit target/root jobs after their current signature, foreground, or 400 ms gates, and deferred callbacks resolve current theme/config/cache state when the target intersects.

**Tech Stack:** TypeScript, Vitest/jsdom, Playwright/Chromium, `vscode-test-playwright`, Vditor, ECharts, Leaflet, Biome.

## Global Constraints

- Preserve render output, theme selection, task-436 cache routing, and existing scheduling delays.
- Use exactly one shared `IntersectionObserver` for all engine families.
- Pending work is one latest job per target; repeat flips replace it without duplicate observation.
- Dispose the shared observer through task 404's `Disposables`.
- Include GeoJSON/TopoJSON; do not change STL, Markmap, or SMILES.
- Every production change follows RED → GREEN.
- Ship unit, Chromium, real-VS-Code, and coverage verification.

---

### Task 1: Add the shared typed viewport gate

**Files:**
- Create: `media-src/src/diagram-viewport-gate.ts`
- Create: `media-src/src/diagram-viewport-gate.test.ts`

**Interfaces:**
- Produces:

```ts
export const RETHEME_DEFER_ATTR = 'data-vmarkd-retheme-defer'

export interface ViewportJob<T> {
  readonly target: HTMLElement
  readonly value: T
}

export function runViewportGated<T>(
  jobs: readonly ViewportJob<T>[],
  run: (values: readonly T[]) => void,
): void

export function diagramBlockFor(target: HTMLElement): HTMLElement
export function disposeDiagramViewportGate(): void
```

- [x] **Step 1: Read the good-test rules**

Read `superpowers:test-driven-development/writing-good-tests.md` completely before creating tests.

- [x] **Step 2: Write the core failing unit tests**

Use a controllable `IntersectionObserver` fake and explicit rectangles. Pin:

```ts
runViewportGated(
  [
    { target: visibleA, value: 'a' },
    { target: visibleB, value: 'b' },
    { target: offscreenC, value: 'c' },
  ],
  run,
)
expect(run).toHaveBeenCalledWith(['a', 'b'])
expect(offscreenC.getAttribute(RETHEME_DEFER_ATTR)).toBe('1')

intersect(offscreenC)
expect(run).toHaveBeenLastCalledWith(['c'])
expect(offscreenC.hasAttribute(RETHEME_DEFER_ATTR)).toBe(false)
```

Add separate tests for a zero-size node, repeat scheduling replacing the stored value without a second `observe`, promotion from pending to visible, owning-block lookup, and disposal/reinstall.

- [x] **Step 3: Run the test and verify RED**

```bash
npx vitest run --config test/vitest.config.ts media-src/src/diagram-viewport-gate.test.ts
```

Expected: import failure because `diagram-viewport-gate.ts` does not exist.

- [x] **Step 4: Implement the minimal helper**

Use a module-level `Map<HTMLElement, () => void>` and one lazy observer. The observer removes the pending entry/marker and unobserves before invoking the callback. `runViewportGated` batches immediate values, replaces the pending closure for already-observed nodes, and uses a 200 px root margin. Disposal disconnects, clears all markers and pending entries, and nulls the observer.

- [x] **Step 5: Verify GREEN and commit**

```bash
npx vitest run --config test/vitest.config.ts media-src/src/diagram-viewport-gate.test.ts
git add media-src/src/diagram-viewport-gate.ts media-src/src/diagram-viewport-gate.test.ts
git commit -m "feat(retheme): add shared viewport gate (412)"
```

---

### Task 2: Migrate Mermaid and runtime disposal

**Files:**
- Modify: `media-src/src/mermaid-retheme.ts`
- Create: `media-src/src/mermaid-retheme.test.ts`
- Modify: `media-src/src/diagram-runtime.ts`
- Modify: `media-src/src/diagram-runtime.test.ts`
- Modify: `test/vscode-e2e/mermaid-flip-gate.spec.ts`

**Interfaces:**
- Consumes: `runViewportGated<NativeJob>()`
- Replaces: `disposeMermaidDeferObserver` with `disposeDiagramViewportGate`
- Preserves: latest theme/CDN at observer fire and visible `renderNativeJobs` batching

- [x] **Step 1: Write failing Mermaid integration tests**

Mock `renderNativeJobs`, set one visible and one offscreen Mermaid live node with different sources, then call:

```ts
reRenderMermaid(editor, 'cdn-a', 'dark')
expect(renderNativeJobs).toHaveBeenCalledWith(
  'mermaid',
  [expect.objectContaining({ live: visible })],
  'cdn-a',
  'dark',
)
```

Call again with `cdn-b`/`light` before intersecting the offscreen target, fire its observer entry, and assert the deferred render uses `cdn-b`/`light` and the latest source.

- [x] **Step 2: Verify RED**

Run the new Mermaid test. Expected: it cannot observe the generic marker/helper because the private Mermaid gate still owns deferral.

- [x] **Step 3: Migrate Mermaid**

Delete Mermaid's private observer, visibility helper, weak map, root-margin constant, marker, and disposer. Build `ViewportJob<NativeJob>` values and call `runViewportGated`; the batch callback clears render keys and calls `renderNativeJobs('mermaid', jobs, latestCdn, latestTheme)`.

- [x] **Step 4: Repoint runtime disposal**

In `diagram-runtime.ts`, import `disposeDiagramViewportGate` and use it for the existing Mermaid `dispose` capability slot. Update the runtime test to assert the shared disposer is registered.

- [x] **Step 5: Update the existing Mermaid real-webview selector**

Replace `data-vmarkd-mermaid-defer` with `data-vmarkd-retheme-defer` in `mermaid-flip-gate.spec.ts`; keep its visible-only and scroll-in assertions unchanged.

- [x] **Step 6: Verify GREEN and commit**

```bash
npx vitest run --config test/vitest.config.ts \
  media-src/src/diagram-viewport-gate.test.ts \
  media-src/src/mermaid-retheme.test.ts \
  media-src/src/diagram-runtime.test.ts
git add media-src/src/mermaid-retheme.ts media-src/src/mermaid-retheme.test.ts \
  media-src/src/diagram-runtime.ts media-src/src/diagram-runtime.test.ts \
  test/vscode-e2e/mermaid-flip-gate.spec.ts
git commit -m "refactor(retheme): migrate mermaid to shared viewport gate (412)"
```

---

### Task 3: Gate Mono, D2, GeoJSON, and TopoJSON

**Files:**
- Modify: `media-src/src/diagram-retheme.ts`
- Modify: `media-src/src/diagram-retheme.test.ts`

**Interfaces:**
- Consumes: `runViewportGated<HTMLElement>()`, `diagramBlockFor()`
- Preserves: Mono foreground polling; Geo/D2 400 ms delay; cache-first routing

- [x] **Step 1: Write failing targeted-dispatch tests**

Extend `diagram-retheme.test.ts` with rendered live nodes whose rectangles are visible/offscreen. For D2, after 400 ms assert:

```ts
expect(reRenderD2).toHaveBeenCalledTimes(1)
expect(reRenderD2).toHaveBeenCalledWith(visibleBlock)
expect(offscreenD2.hasAttribute(RETHEME_DEFER_ATTR)).toBe(true)
```

Fire the offscreen observer entry and assert `reRenderD2(offscreenBlock)`. Add equivalent dispatch assertions for one native Mono language, one custom Mono language, GeoJSON, and TopoJSON. Make the mocked cache takeover suppress only the selected visible block.

- [x] **Step 2: Run and verify RED**

```bash
npx vitest run --config test/vitest.config.ts media-src/src/diagram-retheme.test.ts
```

Expected: existing whole-editor calls render visible and offscreen blocks together and never set the shared marker.

- [x] **Step 3: Add registry-derived target collection**

Inside `diagram-retheme.ts`, collect rendered live elements with preview-scoped selectors for each requested language. Convert each live element to its owning Vditor block using `diagramBlockFor`.

- [x] **Step 4: Gate Mono callbacks**

Keep `reThemeOnForegroundChange` unchanged. Inside its settled callback, submit per-language jobs. The batch callback re-reads `deps.getCdn()` and invokes `cacheFirstThen(root, lang, () => monoOrGeoRerender(lang)?.(root, cdn))` for each selected root.

- [x] **Step 5: Gate Geo/D2 callbacks**

Keep the single 400 ms timeout. When it fires, submit GeoJSON, TopoJSON, and D2 jobs separately. Deferred callbacks re-read the current CDN and use the existing cache-first/live functions against only their selected roots.

- [x] **Step 6: Verify GREEN and commit**

```bash
npx vitest run --config test/vitest.config.ts \
  media-src/src/diagram-retheme.test.ts \
  media-src/src/diagram-viewport-gate.test.ts
git add media-src/src/diagram-retheme.ts media-src/src/diagram-retheme.test.ts
git commit -m "perf(retheme): viewport-gate mono geo and d2 (412)"
```

---

### Task 4: Gate ECharts and forced mindmap rebuilds

**Files:**
- Modify: `media-src/src/echarts-retheme.ts`
- Create: `media-src/src/echarts-retheme.test.ts`

**Interfaces:**
- Consumes: `runViewportGated<EchartsRethemeJob>()`, `diagramBlockFor()`
- Preserves public signature:

```ts
reRenderEcharts(
  win: any,
  editorEl: HTMLElement | undefined,
  mode: 'dark' | 'light',
): void
```

- [x] **Step 1: Write failing chart tests**

Build two rendered chart blocks with valid source, sizes, and visible/offscreen rectangles. Mock the ECharts instance boundary. Assert only the visible instance is disposed/reinitialized immediately, the offscreen target is marked, and intersecting it performs exactly one later redraw.

- [x] **Step 2: Write failing mindmap tests**

Build visible/offscreen mindmap blocks with `data-code` and non-zero widths. Assert the forced theme rebuild follows the same gate, while a direct normal `reconstructMindmaps(..., force=false)` call remains eager and unchanged.

- [x] **Step 3: Run and verify RED**

```bash
npx vitest run --config test/vitest.config.ts media-src/src/echarts-retheme.test.ts
```

Expected: `reRenderEcharts` disposes/rebuilds every chart and mindmap immediately.

- [x] **Step 4: Extract single-target chart work**

Move the existing source lookup, dimension capture, dispose, parse, `ec.init`, `setOption`, and processed marker into a private single-job function. Resolve the current theme name inside the gate's batch callback, not while scheduling.

- [x] **Step 5: Submit chart and mindmap jobs**

Use a discriminated union:

```ts
type EchartsRethemeJob =
  | { kind: 'chart'; pane: HTMLElement; live: HTMLElement }
  | { kind: 'mindmap'; root: HTMLElement }
```

The callback handles charts individually and calls `reconstructMindmaps(win, root, currentName, true)` for mindmap roots. Keep normal observer/resize callers untouched.

- [x] **Step 6: Verify GREEN and commit**

```bash
npx vitest run --config test/vitest.config.ts \
  media-src/src/echarts-retheme.test.ts \
  media-src/src/diagram-viewport-gate.test.ts
git add media-src/src/echarts-retheme.ts media-src/src/echarts-retheme.test.ts
git commit -m "perf(retheme): viewport-gate echarts and mindmap (412)"
```

---

### Task 5: Add Chromium and real-VS-Code regression coverage

**Files:**
- Modify: `media-src/e2e/harness-entries.mjs`
- Create: `media-src/e2e/viewport-gate.html`
- Create: `media-src/e2e/viewport-gate-harness.ts`
- Create: `media-src/e2e/viewport-gate.spec.ts`
- Create: `test/vscode-e2e/fixtures/viewport-gated-retheme.md`
- Modify: `test/vscode-e2e/retheme-flip-matrix.spec.ts`

**Interfaces:**
- Exercises the actual generic gate in Chromium
- Exercises real bundled engine re-theme paths in VS Code

- [x] **Step 1: Write the failing Chromium spec**

Register a minimal tall page harness with one near and two offscreen targets. Expose only scheduling and callback-event inspection. Assert the near target runs immediately, offscreen targets carry the generic marker, and scrolling each into view runs it once and clears the marker.

- [x] **Step 2: Verify RED**

```bash
xvfb-run -a npm --prefix media-src run test:e2e -- --grep "shared viewport gate"
```

Expected: route/harness failure before its registry entry and implementation exist.

- [x] **Step 3: Add minimal harness support and verify GREEN**

Add the registry row `{ key: 'viewport-gate' }`, page markup with enough vertical separation, and a harness importing only `runViewportGated`.

- [x] **Step 4: Add a tall real-VS-Code fixture**

Create two compact examples each of PlantUML, Graphviz, D2, ECharts, GeoJSON, and TopoJSON. Keep one group near the top and separate the second group with prose/spacer sections so it is below the fold. Use offline/simple engine inputs already proven in `all-renderers.md`.

- [x] **Step 5: Extend `retheme-flip-matrix.spec.ts`**

Add a task-412 test which:

1. opens the fixture with `theme.content=auto`;
2. waits for every initial render;
3. tags each current SVG/canvas/Leaflet root;
4. flips light → dark;
5. asserts at least one render refreshed immediately, not all refreshed, and offscreen live nodes have `data-vmarkd-retheme-defer`;
6. scrolls deferred nodes into view one at a time;
7. waits for every marker to clear and every tagged render to be replaced;
8. asserts each family still has the original render count.

- [x] **Step 6: Run focused real-VS-Code specs**

```bash
node build.mjs
env -u ELECTRON_RUN_AS_NODE xvfb-run -a npm --prefix test/vscode-e2e test -- mermaid-flip-gate.spec.ts
env -u ELECTRON_RUN_AS_NODE xvfb-run -a npm --prefix test/vscode-e2e test -- retheme-flip-matrix.spec.ts
```

- [x] **Step 7: Commit**

```bash
git add media-src/e2e/harness-entries.mjs media-src/e2e/viewport-gate.html \
  media-src/e2e/viewport-gate-harness.ts media-src/e2e/viewport-gate.spec.ts \
  test/vscode-e2e/fixtures/viewport-gated-retheme.md \
  test/vscode-e2e/retheme-flip-matrix.spec.ts
git commit -m "test(retheme): cover viewport-gated engine flips (412)"
```

---

### Task 6: Full verification, coverage, and task closure

**Files:**
- Modify: `scripts/check-coverage-modules.mjs` only if the ratchet requires pruning newly-covered modules
- Modify: `tasks/412-generalize-diagram-viewport-gating.md`
- Modify: `tasks/README.md`
- Modify: this plan

**Interfaces:**
- Produces a fully verified, closed task 412

- [x] **Step 1: Run unit tests and coverage**

```bash
npm test
npm run test:coverage
node scripts/check-coverage-modules.mjs
```

Confirm `diagram-viewport-gate.ts`, Mermaid, ECharts, and diagram-retheme paths are covered.

- [x] **Step 2: Run build, type, lint, and full Chromium gates**

```bash
node build.mjs
npm run typecheck
npm run lint:ci
xvfb-run -a npm --prefix media-src run test:e2e
```

- [x] **Step 3: Run the real-VS-Code fast tier**

```bash
env -u ELECTRON_RUN_AS_NODE xvfb-run -a npm run test:vscode:fast
```

- [x] **Step 4: Update task tracking**

Mark only implemented scope and verification items complete, record exact test counts and coverage, set task 412 to DONE, update `tasks/README.md`, and check completed plan steps.

- [x] **Step 5: Request independent code review**

Use `superpowers:requesting-code-review`. Fix every Critical/Important finding through RED → GREEN and repeat affected verification.

- [x] **Step 6: Commit closure**

```bash
git add scripts/check-coverage-modules.mjs \
  tasks/412-generalize-diagram-viewport-gating.md tasks/README.md \
  docs/superpowers/plans/2026-07-30-task-412-diagram-viewport-gating.md
git commit -m "chore: complete task 412 verification"
```

- [x] **Step 7: Final evidence gate**

Use `superpowers:verification-before-completion`, verify the committed tree is clean, then use `superpowers:finishing-a-development-branch`.
