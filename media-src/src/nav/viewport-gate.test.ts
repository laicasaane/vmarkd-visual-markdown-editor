// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createViewportGate } from './viewport-gate'

// jsdom has no IntersectionObserver — a minimal controllable fake that lets a test simulate an
// element scrolling into view (`fire`) and records observe/unobserve/disconnect calls so the gate's
// "don't re-queue an already-deferred element" invariant is directly assertable.
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  observed = new Set<Element>()
  observeCalls = 0
  disconnected = false
  constructor(
    public callback: IntersectionObserverCallback,
    public options?: IntersectionObserverInit,
  ) {
    FakeIntersectionObserver.instances.push(this)
  }
  observe(el: Element) {
    this.observed.add(el)
    this.observeCalls++
  }
  unobserve(el: Element) {
    this.observed.delete(el)
  }
  disconnect() {
    this.disconnected = true
    this.observed.clear()
  }
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
  // Test helper — not part of the real IntersectionObserver API.
  fire(el: Element) {
    this.callback(
      [{ target: el, isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
}

function makeEl(visible: boolean): HTMLElement {
  const el = document.createElement('div')
  // isVisibleish reads getBoundingClientRect: a nonzero box inside [0, window.innerHeight] is
  // "visible-ish" (± the 200px root margin); a box far below the fold is offscreen.
  el.getBoundingClientRect = () =>
    ({
      width: 10,
      height: 10,
      top: visible ? 100 : 5000,
      bottom: visible ? 110 : 5010,
      left: 0,
      right: 10,
    }) as DOMRect
  return el
}

beforeEach(() => {
  FakeIntersectionObserver.instances = []
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  vi.stubGlobal('innerHeight', 768)
})

describe('createViewportGate', () => {
  it('renders exactly the visible elements immediately and defers the rest', () => {
    const gate = createViewportGate()
    const visibleEls = [makeEl(true), makeEl(true)]
    const offscreenEls = [makeEl(false), makeEl(false), makeEl(false)]
    const rendered: HTMLElement[] = []
    const render = (el: HTMLElement) => rendered.push(el)

    const visible = gate.partition([...visibleEls, ...offscreenEls], render)
    for (const el of visible) render(el)

    // M (=2) immediate invocations, exactly the visible set.
    expect(visible).toEqual(visibleEls)
    expect(rendered).toEqual(visibleEls)
    // N-M (=3) queued on the shared observer, none rendered yet.
    const obs = FakeIntersectionObserver.instances[0]
    expect(obs.observed.size).toBe(3)
    for (const el of offscreenEls) expect(obs.observed.has(el)).toBe(true)
  })

  it('renders a deferred element individually the moment it scrolls into view', () => {
    const gate = createViewportGate()
    const el = makeEl(false)
    const rendered: HTMLElement[] = []
    gate.partition([el], (target) => rendered.push(target))
    expect(rendered).toEqual([])

    const obs = FakeIntersectionObserver.instances[0]
    obs.fire(el)

    expect(rendered).toEqual([el])
    // Fired entries are un-observed by the gate itself (one-shot per defer).
    expect(obs.observed.has(el)).toBe(false)
  })

  it('does not re-queue an element already deferred from a prior partition() call', () => {
    const gate = createViewportGate()
    const el = makeEl(false)
    gate.partition([el], vi.fn())
    gate.partition([el], vi.fn())
    gate.partition([el], vi.fn())

    const obs = FakeIntersectionObserver.instances[0]
    // observe() called exactly once across three partition() calls — a repeat flip before scroll-in
    // must not re-queue (task 166's own invariant, generalized here).
    expect(obs.observeCalls).toBe(1)
  })

  it('reads the LATEST render callback at fire time, not the one from the call that first deferred it', () => {
    const gate = createViewportGate()
    const el = makeEl(false)
    const first = vi.fn()
    const second = vi.fn()
    gate.partition([el], first)
    gate.partition([el], second) // "repeat flip" — refreshes the callback, still doesn't re-observe

    FakeIntersectionObserver.instances[0].fire(el)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(el)
  })

  it('un-defers an element that becomes visible on a later partition() call', () => {
    const gate = createViewportGate()
    const el = makeEl(false)
    gate.partition([el], vi.fn())
    const obs = FakeIntersectionObserver.instances[0]
    expect(obs.observed.has(el)).toBe(true)

    // Same node, now scrolled into view (mutate the stub in place).
    el.getBoundingClientRect = () =>
      ({
        width: 10,
        height: 10,
        top: 100,
        bottom: 110,
        left: 0,
        right: 10,
      }) as DOMRect
    const rendered: HTMLElement[] = []
    const visible = gate.partition([el], (t) => rendered.push(t))

    expect(visible).toEqual([el])
    expect(obs.observed.has(el)).toBe(false) // un-observed, not left dangling on the old defer
  })

  it('dispose() disconnects the observer and lets a still-offscreen element be re-queued on the next partition()', () => {
    const gate = createViewportGate()
    const el = makeEl(false)
    gate.partition([el], vi.fn())
    const firstObs = FakeIntersectionObserver.instances[0]
    expect(firstObs.observed.has(el)).toBe(true)

    gate.dispose()
    expect(firstObs.disconnected).toBe(true)

    // Still offscreen — a bug here (not resetting the internal WeakSet on dispose) would read `el`
    // as "already observed" against the now-disconnected observer and silently never re-queue it.
    gate.partition([el], vi.fn())
    const secondObs = FakeIntersectionObserver.instances[1]
    expect(secondObs).not.toBe(firstObs)
    expect(secondObs.observed.has(el)).toBe(true)
  })

  it('treats a zero-size (collapsed/display:none) element as offscreen', () => {
    const gate = createViewportGate()
    const el = document.createElement('div')
    el.getBoundingClientRect = () =>
      ({ width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0 }) as DOMRect
    const visible = gate.partition([el], vi.fn())
    expect(visible).toEqual([])
    expect(FakeIntersectionObserver.instances[0].observed.has(el)).toBe(true)
  })
})
