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
// offscreen ones: a single IntersectionObserver re-renders + swaps each deferred diagram just before it
// scrolls into view (rootMargin), so a diagram is re-themed before it's seen. A deferred diagram's live
// SVG stays in the old theme until then — invisible, it's off-screen. Gotchas handled: a SECOND flip
// before scroll-in does NOT re-queue (the node stays observed) and the deferred render reads the LATEST
// theme at FIRE time (not the flip-time theme — the user may have flipped again); the observer is a module
// singleton torn down on re-init via disposeMermaidDeferObserver (registered in finish-init's Disposables).
import { clearRenderKey } from './diagram-dom'
import {
  type NativeJob,
  nativeSourceForPane,
  renderNativeJobs,
} from './native-offscreen'

// Re-render a diagram this many px before it enters the viewport (both at flip time and for the observer)
// so a themed SVG is ready just before it's seen — else a brief flash of the old-theme SVG on scroll-in.
const ROOT_MARGIN_PX = 200
const DEFER_ATTR = 'data-vmarkd-mermaid-defer'
let deferObserver: IntersectionObserver | null = null
// The current theme/cdn — read LIVE by the deferred callback so a repeat flip before scroll-in wins.
let latestTheme: 'dark' | 'light' = 'light'
let latestCdn = ''
// Deferred live node → its source (captured at defer time; theme is read live, source is stable per node).
const deferredSource = new WeakMap<Element, string>()

function ensureObserver(): IntersectionObserver {
  if (deferObserver) return deferObserver
  deferObserver = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        const live = e.target as HTMLElement
        deferObserver?.unobserve(live)
        live.removeAttribute(DEFER_ATTR)
        const source = deferredSource.get(live)
        deferredSource.delete(live)
        // Re-read latestTheme/latestCdn HERE (fire time), not at defer time — a later flip may have changed
        // them before this diagram scrolled in.
        if (source != null) {
          renderNativeJobs(
            'mermaid',
            [{ live, source }],
            latestCdn,
            latestTheme,
          )
        }
      }
    },
    { rootMargin: `${ROOT_MARGIN_PX}px` },
  )
  return deferObserver
}

/** Tear down the deferred-render observer (task-152 Disposables, on every re-init). */
export function disposeMermaidDeferObserver(): void {
  deferObserver?.disconnect()
  deferObserver = null
}

// Is the live node within (viewport ± ROOT_MARGIN)? A zero-box (collapsed / display:none) counts as NOT
// visible → deferred (its IntersectionObserver entry will fire if/when it gets a box and scrolls in).
function isVisibleish(live: HTMLElement): boolean {
  const r = live.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return false
  const vh = window.innerHeight || document.documentElement.clientHeight
  return r.bottom > -ROOT_MARGIN_PX && r.top < vh + ROOT_MARGIN_PX
}

export function reRenderMermaid(
  editorEl: HTMLElement | undefined,
  cdn: string,
  theme: 'dark' | 'light',
): void {
  if (!editorEl) return
  latestTheme = theme
  latestCdn = cdn
  const panes = Array.from(
    editorEl.querySelectorAll<HTMLElement>(
      '.vditor-ir__preview, .vditor-wysiwyg__preview',
    ),
  )
  const visible: NativeJob[] = []
  for (const pane of panes) {
    const live = pane.querySelector<HTMLElement>('.language-mermaid')
    if (!live) continue
    const source = nativeSourceForPane(pane, 'mermaid')
    if (source == null) continue
    if (isVisibleish(live)) {
      // Render now. If it was queued from an earlier flip, un-defer it (we're rendering it fresh here).
      if (live.hasAttribute(DEFER_ATTR)) {
        deferObserver?.unobserve(live)
        live.removeAttribute(DEFER_ATTR)
        deferredSource.delete(live)
      }
      clearRenderKey(live) // about to be redrawn (task 436)
      visible.push({ live, source })
    } else if (!live.hasAttribute(DEFER_ATTR)) {
      // Offscreen + not already queued → defer to scroll-in.
      live.setAttribute(DEFER_ATTR, '1')
      deferredSource.set(live, source)
      ensureObserver().observe(live)
    } else {
      // Already deferred from a prior flip: keep it observed (no re-queue), just refresh the stored source
      // in case the content changed; the theme is read live at fire time.
      deferredSource.set(live, source)
    }
  }
  // Theme: 'dark' → mermaid dark; anything else → mermaid default. An explicit `mermaidTheme` setting still
  // wins via the mermaid.initialize wrapper in applyMermaidTheme. Empty `visible` (all offscreen) → no-op.
  renderNativeJobs('mermaid', visible, cdn, theme)
}
