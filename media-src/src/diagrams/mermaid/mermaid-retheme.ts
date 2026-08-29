// Re-render already-drawn mermaid diagrams in the current theme (task 59) — viewport-gated (task 166).
//
// Code highlighting follows the VS Code theme live (setTheme), but mermaid does not:
// Vditor renders each diagram to an <svg> once (marked `data-processed="true"`) and never
// re-runs it, so flipping dark↔light leaves diagrams in the stale theme until reopen.
//
// We re-render OFFSCREEN and swap the SVG in atomically (native-offscreen.ts): rendering in place
// would set the preview's textContent back to the (short) source for mermaid to read, momentarily
// collapsing the diagram's height — and if it sits above the viewport that shrinks the document and
// scrolls toward the top (the user-reported jump). The sandbox swap keeps the live DOM stable.
//
// task 166: the flip used to re-lay-out EVERY mermaid across ALL panes in one main-thread burst — N
// back-to-back dagre layouts, ~90% of them OFFSCREEN (measured: a 12-mermaid doc = one ~505ms block with
// 1 diagram visible; scales linearly). We now render only the VISIBLE diagrams immediately and DEFER the
// offscreen ones via the shared viewport-gate (task 412 — this module used to own its own bespoke
// IntersectionObserver; that mechanism is now viewport-gate.ts, generalized for every OTHER retheme path
// too, and this is one of its callers). A deferred diagram's live SVG stays in the old theme until it
// scrolls in — invisible, it's off-screen. `renderOneMermaid` is the gate's `render` callback: it reads
// `latestTheme`/`latestCdn`/`sourceForLive` LIVE at call time, not captured at defer time, so a repeat
// flip before scroll-in wins (see viewport-gate.ts's contract).
import { clearRenderKey } from '../../diagram-kit/diagram-dom'
import {
  nativeSourceForLive,
  renderedDiagramTargets,
} from '../../diagram-kit/diagram-surfaces'
import {
  type NativeJob,
  renderNativeJobs,
} from '../../diagram-kit/native-offscreen'
import { createViewportGate } from '../../nav/viewport-gate'

const gate = createViewportGate()
// The current theme/cdn — read LIVE by the deferred callback so a repeat flip before scroll-in wins.
let latestTheme: 'dark' | 'light' = 'light'
let latestCdn = ''
// Live node → its source. Refreshed on every reRenderMermaid call (including for a still-deferred
// node, in case its content changed) — the gate's callback reads this live, not a value captured at
// defer time.
const sourceForLive = new WeakMap<Element, string>()
// Purely a DOM-visible marker mirroring the gate's internal (WeakSet) defer state — the shared
// viewport-gate.ts module deliberately has no DOM footprint (multiple gate instances would collide
// on one attribute name), but mermaid-flip-gate.spec.ts (task 166's own real-VS-Code e2e) asserts on
// this attribute directly, so it's kept here as this module's own observability layer rather than
// promoted into the generic gate. Set/cleared in lockstep with visible/deferred below; never read by
// this module's own logic.
const DEFER_ATTR = 'data-vmde-mermaid-defer'

/** Tear down the deferred-render observer (task-152 Disposables, on every re-init). */
export function disposeMermaidDeferObserver(): void {
  gate.dispose()
}

function renderOneMermaid(live: HTMLElement): void {
  live.removeAttribute(DEFER_ATTR) // about to render — whether "immediate" or a deferred scroll-in fire
  const source = sourceForLive.get(live)
  if (source == null) return
  renderNativeJobs('mermaid', [{ live, source }], latestCdn, latestTheme)
}

export function reRenderMermaid(
  editorEl: HTMLElement | undefined,
  cdn: string,
  theme: 'dark' | 'light',
): void {
  if (!editorEl) return
  latestTheme = theme
  latestCdn = cdn
  // Task 412 follow-up — was the 2-selector IR/WYSIWYG-only list, so a mermaid diagram rendered in
  // the full/split Preview surface (`.vditor-preview`, a SIBLING of the active mode's own element,
  // not a descendant) was never even collected as a candidate and stayed stale after a flip until
  // reopen. `editorEl` here is always the BROAD render root (diagram-retheme.ts's
  // `diagramRenderRoot`, never a narrowed per-diagram scope — mermaid's own gating defers on the
  // live node directly, not via a re-scanned render call), so widening the pane list is the whole fix.
  //
  // Task 466 follow-up — was "one pane per candidate" (`pane.querySelector('.language-mermaid')`,
  // via the now-removed `nativeSourceForPane`): a FIRST match within `pane`, which for `.vditor-ir__
  // preview`/`.vditor-wysiwyg__preview` (exactly one diagram each) picks the right node, but
  // `.vditor-preview` is a SINGLE pane holding every diagram in the document — with 2+ mermaid
  // diagrams there, only the first was EVER collected as a candidate and the rest silently never
  // redrew. `renderedDiagramTargets` enumerates every `.language-mermaid` LIVE node directly (the
  // same fix task 454 used for echarts), so each gets its own candidate + its own `data-code` source.
  const candidates: HTMLElement[] = []
  for (const live of renderedDiagramTargets(editorEl, 'mermaid')) {
    const source = nativeSourceForLive(live, 'mermaid')
    if (source == null) continue
    sourceForLive.set(live, source)
    candidates.push(live)
  }
  const visible = gate.partition(candidates, renderOneMermaid)
  // Mirror the gate's visible/deferred split onto the DOM marker (see DEFER_ATTR's own comment) —
  // idempotent, so a repeat flip before scroll-in just re-asserts the same attribute state.
  const visibleSet = new Set(visible)
  for (const c of candidates) {
    if (visibleSet.has(c)) c.removeAttribute(DEFER_ATTR)
    else c.setAttribute(DEFER_ATTR, '1')
  }
  if (!visible.length) return
  // Batch every VISIBLE diagram into ONE offscreen-sandbox pass (unchanged from before task 412 —
  // the gate only changes how the OFFSCREEN half is handled; cheaper than one sandbox per diagram).
  const jobs: NativeJob[] = visible.map((live) => {
    clearRenderKey(live) // about to be redrawn (task 436)
    return { live, source: sourceForLive.get(live)! }
  })
  // Theme: 'dark' → mermaid dark; anything else → mermaid default. An explicit `mermaidTheme` setting
  // still wins via the mermaid.initialize wrapper in applyMermaidTheme.
  renderNativeJobs('mermaid', jobs, cdn, theme)
}
