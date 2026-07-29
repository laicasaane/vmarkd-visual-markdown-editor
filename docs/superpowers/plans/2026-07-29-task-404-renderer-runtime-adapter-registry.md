# Task 404 Renderer Runtime Adapter Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete task 404 with a typed runtime adapter registry and a synchronous phased installer that preserves every existing diagram lifecycle behavior.

**Architecture:** Keep `engine-registry.ts` pure data and place function-bearing adapters in a new `diagram-runtime.ts`. `installDiagramRuntime()` derives lifecycle installation from those adapters, deduplicates shared hooks, reserves the cache synchronously before renderer attachment, and registers all cleanup through `Disposables`; `runFinishInit()` becomes a thin caller at the existing ordering point.

**Tech Stack:** TypeScript, Vitest, happy-dom, Playwright/Chromium, `vscode-test-playwright`, Biome, esbuild.

## Global Constraints

- `engine-registry.ts` must import no engine implementation modules.
- Do not add or remove diagram engines.
- Do not change rendered output, retheme policy, scheduling, debounce timing, or cache semantics.
- Cache reservation must remain synchronous and complete before renderer attachment.
- Preserve unrelated changes in `media-src/src/render-cache-client.ts`, `package.json`, and `test/vscode-e2e/d2-content-theme-flip.spec.ts`.
- Every production change follows RED → GREEN TDD.
- Webview changes require unit, Chromium e2e, real-VS-Code e2e, and coverage verification.

---

### Task 1: Characterize and make resize installers disposable

**Files:**
- Modify: `media-src/src/echarts-fit.ts`
- Modify: `media-src/src/echarts-fit.test.ts`
- Modify: `media-src/src/markmap-fit.ts`
- Modify: `media-src/src/markmap-fit.test.ts`

**Interfaces:**
- Produces: `installEchartsResize(win): () => void`
- Produces: `installMarkmapResize(win): () => void`
- Preserves: one active listener/observer fleet per installer

- [x] **Step 1: Write failing ECharts disposal tests**

Add tests which install twice with disposal between installs and assert:

```ts
const dispose = installEchartsResize(win)
dispose()
installEchartsResize(win)
expect(addEventListener).toHaveBeenCalledTimes(2)
expect(resizeObserverDisconnect).toHaveBeenCalledTimes(1)
expect(mutationObserverDisconnect).toHaveBeenCalledTimes(1)
```

Also assert a pending animation frame is cancelled by disposal.

- [x] **Step 2: Run the focused ECharts test and verify RED**

Run:

```bash
npx vitest run --config test/vitest.config.ts media-src/src/echarts-fit.test.ts
```

Expected: FAIL because `installEchartsResize()` returns `void` and never disconnects listeners/observers.

- [x] **Step 3: Implement the minimal ECharts disposer**

Retain references to the debounced resize callback, `ResizeObserver`, `MutationObserver`, and pending rAF. Return a cleanup function that removes/disconnects/cancels them and resets the module `installed` guard. Keep the existing fit body and scheduling unchanged.

- [x] **Step 4: Verify ECharts GREEN**

Run the focused test again and expect all tests to pass.

- [x] **Step 5: Write failing Markmap disposal tests**

Assert that the returned disposer removes the exact resize listener, cancels a pending rAF, calls the existing debounced function's `.cancel()`, resets the installation guard, and permits a clean reinstall.

- [x] **Step 6: Run the focused Markmap test and verify RED**

Run:

```bash
npx vitest run --config test/vitest.config.ts media-src/src/markmap-fit.test.ts
```

Expected: FAIL because `installMarkmapResize()` returns `void`.

- [x] **Step 7: Implement the minimal Markmap disposer**

Replace the anonymous resize listener with a named callback, return cleanup for the listener/rAF, call the existing debounced function's `.cancel()`, and reset `installed`.

- [x] **Step 8: Verify Markmap GREEN and commit**

Run both focused test files, then:

```bash
git add media-src/src/echarts-fit.ts media-src/src/echarts-fit.test.ts media-src/src/markmap-fit.ts media-src/src/markmap-fit.test.ts
git commit -m "refactor(diagrams): make resize installers disposable (404)"
```

---

### Task 2: Define the typed runtime adapter registry

**Files:**
- Create: `media-src/src/diagram-runtime.ts`
- Create: `media-src/src/diagram-runtime.test.ts`
- Modify: `media-src/src/engine-registry.ts`
- Modify: `media-src/src/engine-registry.test.ts`

**Interfaces:**
- Produces:

```ts
export type DiagramRuntimePhase =
  | 'configure'
  | 'reserve-cache'
  | 'attach-renderers'
  | 'attach-decoration-and-resize'

export interface DiagramRuntimeContext {
  app: HTMLElement | null
  win: Window
  observers: Disposables
  postCacheMessage: (message: WebviewMessage) => void
}

export interface DiagramRuntimeAdapter {
  readonly lang: string
  readonly render?: RuntimeHook
  readonly fit?: RuntimeHook
  readonly onResize?: RuntimeHook
  readonly dispose?: () => void
  readonly phase?: {
    readonly fit?: 'configure' | 'attach-decoration-and-resize'
    readonly onResize?: 'configure' | 'attach-decoration-and-resize'
  }
}

export type RuntimeHook = (
  context: DiagramRuntimeContext,
) => void | (() => void)

export const DIAGRAM_RUNTIME_ADAPTERS: Readonly<Record<string, DiagramRuntimeAdapter>>
```

- Produces pure descriptor metadata:

```ts
export type RuntimeCapability = 'render' | 'fit' | 'resize' | 'dispose'
runtime?: readonly RuntimeCapability[]
```

- [x] **Step 1: Write failing pure-data and completeness tests**

Assert:

```ts
expect(Object.keys(DIAGRAM_RUNTIME_ADAPTERS).sort()).toEqual(
  ENGINES.filter((engine) => engine.runtime?.length).map((engine) => engine.lang).sort(),
)
```

For each descriptor capability, assert the corresponding adapter hook exists. Assert no adapter key refers to an unknown language. Add an import-boundary test proving `engine-registry.ts` still imports no engine module.

- [x] **Step 2: Run focused tests and verify RED**

Run:

```bash
npx vitest run --config test/vitest.config.ts media-src/src/diagram-runtime.test.ts media-src/src/engine-registry.test.ts
```

Expected: FAIL because `runtime`, `DiagramRuntimeAdapter`, and `DIAGRAM_RUNTIME_ADAPTERS` do not exist.

- [x] **Step 3: Add minimal pure capability metadata**

Classify only engines with remaining runtime lifecycle:

- all custom-family engines: `render`;
- `smiles`: `fit`;
- `abc`: `fit`;
- `mindmap`: `fit` and `resize`;
- `echarts`: `resize`;
- `markmap`: `resize`;
- `mermaid`: `dispose`.

Keep runtime function references out of `engine-registry.ts`.

- [x] **Step 4: Add minimal adapter implementations**

In `diagram-runtime.ts`, adapt existing functions without moving engine logic:

```ts
const installCustomRender = ({ app }: DiagramRuntimeContext) =>
  observeCustomDiagrams(app)

const installSmilesFit = ({ app }: DiagramRuntimeContext) => observeSmiles(app)
const installAbcFit = ({ app }: DiagramRuntimeContext) => observeAbc(app)
const installMindmapFit = ({ app, win }: DiagramRuntimeContext) =>
  observeMindmaps(win, app)
const installEcharts = ({ win }: DiagramRuntimeContext) =>
  installEchartsResize(typedWindow(win))
const installMarkmap = ({ win }: DiagramRuntimeContext) =>
  installMarkmapResize(win)
```

Point every custom language at the same `installCustomRender` function so the installer can deduplicate it by identity. Point `echarts` and `mindmap` at the same ECharts resize adapter. Preserve the current initial scheduling order by declaring ECharts `onResize` and SMILES `fit` in `configure`; place Markmap resize, ABC fit, mindmap fit, and Mermaid disposal in `attach-decoration-and-resize`. Adapt Mermaid teardown as `dispose`.

- [x] **Step 5: Verify registry GREEN and commit**

Run the focused tests and:

```bash
git add media-src/src/diagram-runtime.ts media-src/src/diagram-runtime.test.ts media-src/src/engine-registry.ts media-src/src/engine-registry.test.ts
git commit -m "feat(diagrams): add runtime adapter registry (404)"
```

---

### Task 3: Implement the synchronous phased installer

**Files:**
- Modify: `media-src/src/diagram-runtime.ts`
- Modify: `media-src/src/diagram-runtime.test.ts`

**Interfaces:**
- Produces:

```ts
export interface DiagramRuntimeDeps {
  installCache: (app: HTMLElement | null, post: (message: WebviewMessage) => void) => () => void
  adapters: Readonly<Record<string, DiagramRuntimeAdapter>>
}

export function installDiagramRuntime(
  context: DiagramRuntimeContext,
  deps?: Partial<DiagramRuntimeDeps>,
): void
```

- [x] **Step 1: Write the failing exact-order test**

Inject test adapters and cache installer which append to an array:

```ts
expect(events).toEqual([
  'configure',
  'cache:start',
  'cache:end',
  'render',
  'fit',
  'resize',
  'dispose',
])
```

Make the render hook assert that `cache:end` is already present. Assert there is no promise/microtask boundary by checking the complete array immediately after the function returns.

- [x] **Step 2: Run the test and verify RED**

Run the diagram-runtime test. Expected: FAIL because `installDiagramRuntime` does not exist.

- [x] **Step 3: Implement named synchronous phases**

Implement private phase functions called in a fixed array order. Register cache under `render-cache`. For adapter hooks:

- deduplicate identical functions by reference within each hook kind;
- use stable keys such as `diagram-runtime:render:<first-lang>`;
- register every returned disposer through `context.observers.set`;
- call `dispose` hooks through a registered disposer slot without invoking them during installation;
- throw with phase and language for a declared-but-missing capability.

Do not `await`, schedule, or wrap the cache/render phases.

- [x] **Step 4: Add failing deduplication and disposal tests**

Use two languages sharing one function and assert it runs once. Replace the same runtime installation and assert old disposers run once before new ones are stored.

- [x] **Step 5: Verify RED, implement minimal dedupe, verify GREEN**

Run the focused test after each change. Keep deduplication scoped per hook kind so one function intentionally used in two lifecycle phases is not incorrectly suppressed.

- [x] **Step 6: Commit**

```bash
git add media-src/src/diagram-runtime.ts media-src/src/diagram-runtime.test.ts
git commit -m "feat(diagrams): install runtime in asserted phases (404)"
```

---

### Task 4: Rewire `runFinishInit`

**Files:**
- Modify: `media-src/src/finish-init.ts`
- Create: `media-src/src/finish-init.test.ts`
- Modify: `media-src/src/diagram-runtime.test.ts`

**Interfaces:**
- Consumes: `installDiagramRuntime(context)`
- Preserves the relative runtime sequence currently in `runFinishInit`

- [x] **Step 1: Write a characterization test for current ordering**

Mock the existing diagram installers and call `runFinishInit()` with a fake `Disposables`. Pin the current relative sequence:

```ts
expect(diagramCalls).toEqual([
  'zoom-gate',
  'echarts-resize',
  'smiles',
  'render-cache',
  'custom-diagrams',
  'markmap-resize',
  'abc',
  'mindmap',
  'mermaid-defer',
])
```

This test is allowed to pass before refactoring because it characterizes behavior; it must remain unchanged afterward.

- [x] **Step 2: Add a failing delegation assertion**

Assert `runFinishInit()` calls `installDiagramRuntime()` once with the stable `#app`,
`window`, the existing `observers`, and a cache post callback that delegates to
`vscode.postMessage`.

- [x] **Step 3: Run the focused test and verify RED**

Expected: characterization passes and delegation assertion fails.

- [x] **Step 4: Replace hand wiring with one installer call**

Remove diagram-runtime-only imports from `finish-init.ts` and call `installDiagramRuntime()`
where `installEchartsResize()` currently runs. Keep `installDiagramZoomGate()` immediately
before it. The runtime `configure` phase installs ECharts resize followed by SMILES repair;
then cache reservation and custom rendering attach; the final phase installs Markmap resize,
ABC fit, mindmap fit, and Mermaid cleanup in that exact order. This reproduces the current
listener and rAF scheduling order while making cache-before-render structural.

- [x] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run --config test/vitest.config.ts media-src/src/finish-init.test.ts media-src/src/diagram-runtime.test.ts
```

- [x] **Step 6: Commit**

```bash
git add media-src/src/finish-init.ts media-src/src/finish-init.test.ts media-src/src/diagram-runtime.ts media-src/src/diagram-runtime.test.ts
git commit -m "refactor(diagrams): centralize runtime installation (404)"
```

---

### Task 5: Add browser and real-webview regression coverage

**Files:**
- Modify: `media-src/e2e/custom-diagrams-harness.ts`
- Modify: `media-src/e2e/custom-diagrams.spec.ts`
- Reuse unchanged: `test/vscode-e2e/custom-diagrams-render.spec.ts`
- Reuse unchanged: `test/vscode-e2e/cross-diagram-edit.spec.ts`
- Reuse unchanged: `test/vscode-e2e/diagram-resize.spec.ts`
- Reuse unchanged: `test/vscode-e2e/retheme-flip-matrix.spec.ts`
- Reuse unchanged: `test/vscode-e2e/diagram-cache.spec.ts`

**Interfaces:**
- Exercises the actual bundled `installDiagramRuntime()` path

- [x] **Step 1: Write a failing Chromium lifecycle regression**

The existing all-custom-engine harness was the narrower integration surface for the
installer. Mutate the WaveDrom source after initial render and assert:

- the custom SVG changes;
- no duplicate runtime observers/listeners are installed after re-init.

The duplicate assertion reads a test-only observable exposed by the harness rather than
inspecting implementation source. Existing ABC/SMILES and resize real-webview specs cover
their engine-specific behavior.

- [x] **Step 2: Run the focused Chromium spec and verify RED**

Run:

```bash
node build.mjs
xvfb-run -a npm --prefix media-src exec -- playwright test e2e/custom-diagrams.spec.ts -g "runtime re-init"
```

Expected: the new re-init/lifecycle assertion fails before the harness/runtime support exists.

- [x] **Step 3: Add minimal harness support and verify GREEN**

Expose only the re-init trigger/counter needed by the test; do not add production debug globals.

- [x] **Step 4: Verify the existing real-VS-Code cross-diagram coverage**

Inspection showed that the existing `cross-diagram-edit.spec.ts` already edits native and
custom diagrams in the same document and checks their repaint. Reuse it unchanged rather
than duplicating the scenario in `custom-diagrams-render.spec.ts`.

- [x] **Step 5: Run focused real-VS-Code specs**

Run:

```bash
node build.mjs
env -u ELECTRON_RUN_AS_NODE xvfb-run -a npm --prefix test/vscode-e2e test -- custom-diagrams-render.spec.ts
env -u ELECTRON_RUN_AS_NODE xvfb-run -a npm --prefix test/vscode-e2e test -- cross-diagram-edit.spec.ts
env -u ELECTRON_RUN_AS_NODE xvfb-run -a npm --prefix test/vscode-e2e test -- diagram-resize.spec.ts
env -u ELECTRON_RUN_AS_NODE xvfb-run -a npm --prefix test/vscode-e2e test -- retheme-flip-matrix.spec.ts
env -u ELECTRON_RUN_AS_NODE xvfb-run -a npm --prefix test/vscode-e2e test -- diagram-cache.spec.ts
```

Expected: all pass; cache reopen reports zero live engine renders and cache-hit attributes remain present.

- [x] **Step 6: Commit**

```bash
git add media-src/e2e/custom-diagrams-harness.ts media-src/e2e/custom-diagrams.spec.ts
git commit -m "test(diagrams): cover runtime lifecycle reinit (404)"
```

Only add files actually modified.

---

### Task 6: Full verification and task status

**Files:**
- Modify: `tasks/404-renderer-runtime-adapter-registry.md`
- Modify: `tasks/README.md`
- Modify: this plan to check completed steps

**Interfaces:**
- Produces a fully verified, closed task 404

- [x] **Step 1: Run unit tests and coverage**

```bash
npm test
npm run test:coverage
node scripts/check-coverage-modules.mjs
```

Confirm the new runtime module is exercised and the coverage ratchet passes.

- [x] **Step 2: Run type, build, lint, and browser gates**

```bash
npm run typecheck
node build.mjs
npm run lint:ci
xvfb-run -a npm --prefix media-src run test:e2e
```

- [x] **Step 3: Run the real-VS-Code fast tier**

```bash
env -u ELECTRON_RUN_AS_NODE xvfb-run -a npm run test:vscode:fast
```

- [x] **Step 4: Update task tracking**

Set task 404 to DONE, check only completed scope and verification items, record exact test
evidence, and mark 404 complete in `tasks/README.md`. Check every completed plan checkbox.

- [x] **Step 5: Commit task completion**

```bash
git add tasks/404-renderer-runtime-adapter-registry.md tasks/README.md docs/superpowers/plans/2026-07-29-task-404-renderer-runtime-adapter-registry.md
git commit -m "chore: complete task 404 verification"
```

- [x] **Step 6: Request code review**

Use `superpowers:requesting-code-review`, address Critical/Important findings with
`superpowers:receiving-code-review`, rerun affected verification, then use
`superpowers:verification-before-completion` before reporting success.
