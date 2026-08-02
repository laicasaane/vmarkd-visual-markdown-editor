# Task 412 Diagram Viewport Gating Design

## Goal

Generalize Mermaid's task-166 theme-flip viewport gate so expensive Mono,
ECharts/mindmap, D2, GeoJSON, and TopoJSON re-renders happen immediately only
for diagrams near the viewport. Offscreen diagrams keep their existing render
until they approach the viewport, then re-render with the latest theme and
settings.

## Constraints

- Preserve rendered output, theme selection, cache routing, and the existing
  foreground-settle and 400 ms scheduling gates.
- Use one shared `IntersectionObserver`, not one observer per engine.
- A second theme/config change before scroll-in updates pending work; it must
  not add another observation or replay a stale theme.
- Visible jobs retain the existing batching behavior where the renderer
  supports it.
- The shared observer is disposed through task 404's runtime `Disposables`.
- STL, Markmap, and SMILES remain unchanged.

## Considered Approaches

### 1. Shared typed job gate (selected)

Create an engine-agnostic helper which receives `{ target, value }` jobs and a
batch callback. It runs visible values immediately as one batch and stores one
latest callback per offscreen target. The shared observer later invokes a
single-value batch for each target that intersects.

This preserves Mermaid's visible batching, supports engine-specific job
payloads, and centralizes repeat-flip replacement, marker cleanup, root margin,
visibility checks, and disposal.

### 2. Gate only the top-level re-theme calls

Partition the editor into visible/offscreen roots and call the existing
whole-editor renderer on each root. This looks smaller, but every engine has
different DOM ownership rules; passing a preview node to functions which search
for descendant preview nodes silently finds nothing. It also encourages
duplicated root-selection logic.

### 3. Keep a separate observer in each engine

This minimizes individual diffs but duplicates task 166's state machine and
makes repeat-flip and teardown behavior drift between engines. It does not
satisfy the systemic goal of task 412.

## Shared Helper

Add `media-src/src/diagram-viewport-gate.ts`:

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

`runViewportGated` uses the same ±200 px margin as task 166. A non-zero box
inside that margin is immediate. A zero-size or distant element is marked and
queued. Re-queuing the same element replaces its stored callback/value without
calling `observe` again. If a queued element becomes visible during a later
explicit call, it is unobserved and promoted into the immediate batch.

The observer removes the marker and pending entry before invoking work. The
pending closure calls the supplied batch callback with the latest single value.
`disposeDiagramViewportGate` disconnects the observer, removes markers from all
pending elements, and clears pending state.

`diagramBlockFor` returns the nearest Vditor code-block owner, falling back to
the target's parent and finally the target itself. Renderer functions receive
that owner so their existing descendant selectors continue to work.

## Engine Wiring

### Mermaid

`mermaid-retheme.ts` keeps `latestTheme` and `latestCdn`, source extraction,
cache-key clearing, and `renderNativeJobs`. Its private observer, visibility
test, weak map, marker, and disposer are removed. Jobs use the live Mermaid node
as target and `NativeJob` as value. The batch callback reads
`latestTheme/latestCdn` at execution time, so a deferred diagram never renders
an obsolete flip.

### Mono group

After `reThemeOnForegroundChange` detects the settled foreground,
`reThemeMono` creates jobs per language and rendered live node. Each value is
the owning Vditor block. The callback re-reads `deps.getCdn()` and runs the
existing cache-first path plus `monoOrGeoRerender` for only those roots.
PlantUML, Graphviz, ABC, WaveDrom, and Nomnoml keep their existing renderer
implementations.

### ECharts and mindmap

`reRenderEcharts` partitions chart and mindmap live nodes into typed jobs. The
existing single-chart body is extracted into a private function. The callback
resolves the ECharts theme name at execution time from the current resolver,
then redraws only the selected chart or invokes `reconstructMindmaps` against
the selected block root with `force=true`.

Normal mindmap observation/resizing remains eager; only the theme-change
forced rebuild is viewport-gated.

### D2

The existing 400 ms task-411 deferral remains. When it fires,
`reThemeGeoAndD2` queues each D2 live target separately. The callback re-reads
the current editor/CDN state, then runs task 436's cache-first path and
`reRenderD2` only for selected block roots.

### GeoJSON and TopoJSON decision

They are included, not exempted. Their theme/basemap redraw is expensive and
invisible while offscreen. Creating the Leaflet map only when the block nears
the viewport gives it current, non-hidden dimensions; the existing renderer
continues to own map construction and layout. Geo maps remain non-cacheable,
so their deferred callback goes directly to the existing live re-render.

## Scheduling and Repeated Changes

The gate is added inside existing scheduling authorities:

- Mono still waits for the foreground poll.
- Geo/D2 still wait 400 ms.
- Mermaid and ECharts still use their signature gates in
  `rethemeDiagrams`.

Only after those gates decide a redraw is needed does viewport partitioning
occur. A later qualifying change overwrites pending callbacks per target. At
observer fire time, callbacks read current globals/dependencies, preventing a
stale palette, CDN, cache key, D2 layout, or Geo basemap.

## Testing

### Unit

- Shared helper: with N jobs and M visible, exactly M values run immediately;
  each remaining value runs only after its own intersecting entry.
- Repeated scheduling updates pending work without duplicate observation.
- Promoting a pending node to visible unobserves it and runs the latest value.
- Disposal disconnects, clears markers/state, and permits a clean new
  observer.
- Mermaid integration preserves latest-theme-at-fire behavior.
- Diagram retheme tests pin Mono, D2, and Geo targeting after their existing
  scheduling gates.
- ECharts tests pin visible-only chart/mindmap rebuild and deferred execution.

### Browser and real VS Code

- Add a Chromium harness/spec for the shared gate's real
  `IntersectionObserver` behavior.
- Extend `retheme-flip-matrix.spec.ts` with a tall fixture containing repeated
  PlantUML, Graphviz, D2, ECharts, and Geo blocks. Tag existing render children,
  flip the theme, and assert only near-viewport children are replaced
  immediately while offscreen targets carry `RETHEME_DEFER_ATTR`.
- Scroll deferred targets into view and assert their marker clears and their
  render is replaced/re-themed.
- Re-run the existing Mermaid flip gate and the complete retheme matrix to
  prove no engine loses, duplicates, or retains stale output once visible.

## Out of Scope

- Initial render gating.
- D2 worker/off-thread work.
- Cache policy changes.
- Retheming STL, Markmap, or SMILES.
