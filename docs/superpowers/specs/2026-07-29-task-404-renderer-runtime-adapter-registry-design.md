# Task 404: Renderer runtime adapter registry

## Goal

Complete task 404 by replacing the remaining hand-wired diagram lifecycle setup with a
typed runtime adapter registry and a single phased installer. Adding or changing an engine
must have one explicit lifecycle contract, while rendered output, scheduling, observer
ordering, cache behavior, and theme behavior remain unchanged.

## Constraints

- `engine-registry.ts` remains pure data and imports no engine implementation modules.
- Runtime function references live in a separate adjacent module.
- Existing engine-specific implementations remain authoritative. In particular, the design
  does not flatten D2 configuration/WASM behavior, PlantUML warm-engine selection, STL
  resource disposal, or foreground-color polling.
- The render-cache reservation remains synchronous and runs before renderer attachment.
- Existing `requestAnimationFrame`, debounce, mutation-observer, and window-resize timing
  remains unchanged.
- The work does not add or remove engines and does not change diagram output.
- Existing unrelated working-tree changes are preserved.

## Architecture

### Pure engine metadata

`engine-registry.ts` continues to define engine identity and declarative capabilities. It
may gain lifecycle capability metadata only when that metadata is pure data and useful for
completeness validation. It must not import or reference runtime functions.

### Runtime adapters

A new focused module adjacent to the existing diagram modules defines the runtime contract
and adapter map. The contract uses optional hooks because most engines need only a subset:

- `configure`: install or update engine-wide configuration before any observers attach.
- `render`: attach or invoke the engine's render path.
- `fit`: attach post-render geometry repair such as ABC viewBox fitting.
- `onResize`: attach window/pane resize behavior such as ECharts or Markmap fitting.
- `dispose`: tear down state that is not already returned by another hook.
- `retheme`: identify or dispatch the existing theme-refresh implementation when the shared
  adapter surface can do so without duplicate calls.

The existing custom renderer adapter map remains the render/re-render authority for custom
engines. The runtime registry composes or references that authority instead of introducing
a competing render map.

Runtime entries are keyed by engine language. Entries may cover native or custom engines.
Completeness and capability tests compare them bidirectionally with `ENGINES`: every
declared lifecycle capability has a matching implementation, and every runtime entry
belongs to a known engine. Hooks shared by multiple languages are represented once at the
installation level where invoking them once is the existing behavior; for example,
ECharts and mindmap must not install duplicate resize listeners, and Vega/Vega-Lite must
not trigger duplicate shared re-renders.

### Phased installer

`installDiagramRuntime()` owns diagram-specific setup formerly interleaved in
`runFinishInit()`. It receives explicit dependencies such as the stable app element,
`window`, the `Disposables` registry, and the cache message callback.

It executes four named phases in this fixed order:

1. `configure`
2. `reserve-cache`
3. `attach-renderers`
4. `attach-decoration-and-resize`

The cache phase calls `installRenderCache` synchronously and registers its disposer before
calling any renderer attachment. There is no asynchronous boundary between entering the
installer and completing cache reservation plus renderer attachment.

The ordering is structural: renderer installation is not exported as an independently
callable public step. Tests inject phase hooks and assert the exact call order, including
that cache reservation finishes before custom rendering begins. If a required phase or
declared adapter is absent, installation throws a descriptive error during initialization.

`runFinishInit()` continues to install non-diagram editor behavior in its current order.
At the point currently occupied by the diagram cache and renderer wiring, it delegates to
`installDiagramRuntime()`. Diagram zoom remains registry-derived and may either stay at its
current call site or move into the decoration phase only if doing so preserves its exact
relative installation order. The implementation will characterize this order before
refactoring.

### Disposal

Every lifecycle hook returns a disposer where practical. `installDiagramRuntime()` stores
all returned disposers in the existing `Disposables` instance under stable, descriptive
keys. Standalone cleanup functions such as Mermaid's deferred-observer teardown are adapted
as disposers rather than manually assigned from `finish-init.ts`.

Hooks that already implement idempotent global listener installation may initially return
their existing disposer shape or an explicit no-op only if the current implementation
cannot be safely changed without altering behavior. The registry still records their
installation so completeness is testable.

## Data flow

On webview initialization:

1. `runFinishInit()` completes the existing editor-surface setup preceding diagram runtime.
2. `installDiagramRuntime()` applies configuration synchronously.
3. The cache observer scans and reserves eligible blocks synchronously.
4. Native/custom render observers attach and see reserved blocks already marked.
5. Fit, repair, resize, and deferred-cleanup hooks attach in their characterized order.
6. Returned cleanup functions are owned by `Disposables` and replaced safely on re-init.

On edit, resize, theme flip, or reopen, the existing engine modules perform the same work
as before; the new registry changes ownership and dispatch only.

## Error handling and invariants

- Unknown adapter languages fail a completeness test.
- Missing runtime implementations for declared capabilities fail a completeness test.
- Missing required installation phases throw synchronously with the engine/phase name.
- Cache-before-render ordering is asserted by unit tests and made unrepresentable through
  the public installer API.
- Shared hooks are deduplicated by an explicit installation identity, preventing duplicate
  listeners or shared re-renders.
- Existing renderer error boundaries remain unchanged.

## Testing

Development follows TDD: each production change is preceded by a focused test that fails
for the missing registry/phase behavior.

### Unit tests

- Pin the runtime adapter contract and its bidirectional agreement with `ENGINES`.
- Assert exact phase order and synchronous cache reservation before renderer attachment.
- Assert shared hooks install once.
- Assert every returned disposer is registered and replaced/disposed on re-init.
- Characterize the existing `runFinishInit()` diagram call order before rewiring it.
- Keep all existing per-engine tests unchanged and passing.

### Browser e2e

Extend or add a Chromium harness spec that edits a document containing representative
native and custom diagrams, verifies they render after mutation, and verifies fit/resize
decorations still run.

### Real VS Code e2e

Run focused real-webview coverage for:

- the existing theme-flip matrix;
- a cross-diagram edit path covering native and custom engines;
- diagram resize/fit behavior;
- cache reopen behavior proving zero engine renders and cache-hit attributes.

The new or extended spec must exercise the registry-driven installation path rather than
testing only pure helper output.

### Verification gates

- `npm test`
- `npm run test:coverage` plus the repository coverage ratchet
- `npm run typecheck`
- `node build.mjs`
- headless Chromium e2e
- focused real-VS-Code specs plus the fast tier
- `npm run lint:ci`

The full real-VS-Code suite is reserved for final handoff if required by the branch
integration workflow and available runtime budget.

## Task tracking

When all behavior and verification requirements pass, update
`tasks/404-renderer-runtime-adapter-registry.md` with the completed architecture and
evidence, check every completed scope/verification item, and mark task 404 done in
`tasks/README.md`. Any deliberately deferred hook must remain unchecked and keep task 404
open.

## Non-goals

- Splitting the internal D2 or custom-diagram rendering implementations.
- Changing diagram themes, output, performance policy, or supported engines.
- Replacing `Disposables`.
- Moving runtime function references into `engine-registry.ts`.
- Refactoring unrelated initialization behavior in `finish-init.ts`.
