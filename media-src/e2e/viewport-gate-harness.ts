import { createViewportGate } from '../src/nav/viewport-gate'

// Task 412's shared viewport gate is a pure DOM/IntersectionObserver module — no Vditor needed.
// This harness exercises it against a REAL browser IntersectionObserver (unit tests only ever drive
// a hand-rolled fake one; jsdom has none), so this is the only net that proves the real geometry/
// rootMargin/scroll semantics actually defer and un-defer as designed.
const ids = ['near', 'offscreen-a', 'offscreen-b'] as const
const elements = ids.map((id) => document.getElementById(id) as HTMLElement)

const rendered: string[] = []
const render = (el: HTMLElement) => rendered.push(el.id)

const gate = createViewportGate()
// partition() only SPLITS the candidates — same contract viewport-gate.test.ts pins: the caller
// renders the immediately-visible ones itself; only the deferred half is rendered automatically
// (via `render`) later, off the shared IntersectionObserver, the moment each scrolls into view.
const visible = gate.partition(elements, render)
for (const el of visible) render(el)

;(window as any).__viewportGate = {
  ready: true,
  rendered: () => [...rendered],
}
