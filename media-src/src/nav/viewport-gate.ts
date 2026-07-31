// Shared IntersectionObserver-based viewport gate for diagram theme-flip re-renders — task 412,
// generalizing task 166's mermaid-only mechanism (mermaid-retheme.ts) so every retheme path (the
// mono SVG group, ECharts/mindmap, D2, geo) can defer OFFSCREEN diagrams instead of re-rendering
// every diagram in the document on every flip. Task 166's own measurement: a flip that would
// otherwise re-lay-out 12 mermaid diagrams with only 1 visible cut ~90% of the wasted work; the
// other engines (plantuml C4 ~2.2s/render, D2 ~365ms/compile — tasks 349/352/436) pay a WORSE per-
// block cost than mermaid's dagre relayout, so leaving them ungated was the higher-impact miss.
//
// Engine-agnostic: callers hand it a list of candidate elements plus a `render(el)` callback.
// Elements currently in (or near) the viewport are returned immediately for the caller to render —
// singly, or batched, however that engine's render path works (mermaid batches every visible
// diagram into one offscreen-sandbox pass; the others render one element at a time). Elements
// outside the viewport are registered on ONE shared observer and rendered individually — via the
// SAME `render` callback — the moment each scrolls into view.
//
// `render` MUST read whatever live state it needs (current theme, cdn, computed colour) at CALL
// time, not capture it from the enclosing scope: a deferred element's callback can fire long after
// the flip that queued it — possibly after ANOTHER flip has already changed the theme — so a
// closure that captured the flip-time value would paint the WRONG (stale) one. Every caller in this
// codebase satisfies this by reading through a live getter (deps.getCdn()) or by re-deriving colour
// from the DOM at render time (the mono/d2/geo engines bake `currentColor`, which is already correct
// by the time the callback runs — the CSS class flip that drives it happens synchronously, long
// before any diagram redraw).
export interface ViewportGate {
  /**
   * Splits `elements` into "visible now" (returned, for the caller to render) and "offscreen"
   * (deferred: queued on the shared observer, each individually calling `render(el)` the instant it
   * scrolls into view). An element already deferred from a PRIOR `partition()` call is NOT re-queued
   * if it's still offscreen (stays on the observer, unchanged); if it has since become visible it's
   * un-observed and returned here instead — matching task 166's "a second flip before scroll-in does
   * not re-queue" invariant. The stored callback for an element still offscreen is refreshed to this
   * call's `render` (harmless no-op when `render` always reads live state, as required above; kept
   * for parity with the same repeat-flip refresh task 166's mermaid gate did).
   */
  partition(
    elements: readonly HTMLElement[],
    render: (el: HTMLElement) => void,
  ): HTMLElement[]
  /** Tear down the observer (task-152 Disposables, on every re-init — a re-init rebuilds the
   *  editor DOM, and any node still tracked from the OLD tree would otherwise leak). */
  dispose(): void
}

// Re-render a diagram this many px before it enters the viewport, so a themed picture is ready
// just before it's seen — else a brief flash of the stale render on scroll-in. Matches task 166's
// mermaid gate's own margin.
const ROOT_MARGIN_PX = 200

function isVisibleish(el: HTMLElement, rootMarginPx: number): boolean {
  const r = el.getBoundingClientRect()
  // A zero-box (collapsed / display:none) counts as NOT visible → deferred; its IntersectionObserver
  // entry fires if/when it gets a box and scrolls in.
  if (r.width === 0 && r.height === 0) return false
  const vh = window.innerHeight || document.documentElement.clientHeight
  return r.bottom > -rootMarginPx && r.top < vh + rootMarginPx
}

export function createViewportGate(
  rootMarginPx = ROOT_MARGIN_PX,
): ViewportGate {
  let observer: IntersectionObserver | null = null
  // Which elements are currently queued on the observer — checked instead of an attribute so
  // multiple independent gate instances (or an element the caller stops passing) can never collide
  // on a shared DOM attribute name. `let`, not `const`: WeakSet/WeakMap have no `.clear()`, so
  // dispose() below swaps in fresh ones — without that, an element still offscreen at dispose time
  // would read as "already observed" on the NEXT partition() call (the observer that used to watch
  // it is gone) and never get re-queued on the new one, silently un-gating it forever.
  let observed = new WeakSet<Element>()
  let callbacks = new WeakMap<Element, (el: HTMLElement) => void>()

  function ensureObserver(): IntersectionObserver {
    if (observer) return observer
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const el = e.target as HTMLElement
          observer?.unobserve(el)
          observed.delete(el)
          const render = callbacks.get(el)
          callbacks.delete(el)
          render?.(el)
        }
      },
      { rootMargin: `${rootMarginPx}px` },
    )
    return observer
  }

  return {
    partition(elements, render) {
      const visible: HTMLElement[] = []
      for (const el of elements) {
        if (isVisibleish(el, rootMarginPx)) {
          if (observed.has(el)) {
            observer?.unobserve(el)
            observed.delete(el)
            callbacks.delete(el)
          }
          visible.push(el)
        } else if (!observed.has(el)) {
          observed.add(el)
          callbacks.set(el, render)
          ensureObserver().observe(el)
        } else {
          callbacks.set(el, render) // repeat flip before scroll-in — refresh, don't re-queue
        }
      }
      return visible
    },
    dispose() {
      observer?.disconnect()
      observer = null
      observed = new WeakSet()
      callbacks = new WeakMap()
    },
  }
}
