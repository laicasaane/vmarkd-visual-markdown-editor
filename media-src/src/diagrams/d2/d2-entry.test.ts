// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Coverage-ratchet net (task 403 group 2). d2-entry.ts is a lazy-bundle bridge — its only job is
// wiring already-tested functions (d2-render.test.ts, d2-sketch.test.ts, elk-layout.test.ts) onto
// window.__vmdeD2 for custom-diagrams.ts to read. There is no logic of its own to exercise, but
// the wiring itself IS a real, breakable contract — a renamed export or a forgotten key here is a
// silent runtime failure (custom-diagrams.ts reads window.__vmdeD2.x as `any`), not a compile
// error. Pin the bridge by identity so that class of bug fails a test instead of shipping.
const h = vi.hoisted(() => ({
  renderD2Graph: () => 'RENDER',
  d2Theme: () => 'THEME',
  unsupportedReason: () => 'REASON',
  canvasMeasure: () => 'MEASURE',
  makeSketch: () => 'SKETCH',
  renderD2GraphElk: () => 'ELK',
}))
vi.mock('./d2-render', () => ({
  canvasMeasure: h.canvasMeasure,
  d2Theme: h.d2Theme,
  renderD2Graph: h.renderD2Graph,
  unsupportedReason: h.unsupportedReason,
}))
vi.mock('./d2-sketch', () => ({ makeSketch: h.makeSketch }))
vi.mock('./elk-layout', () => ({ renderD2GraphElk: h.renderD2GraphElk }))

describe('d2-entry (lazy D2 bundle bridge, task 165)', () => {
  beforeEach(() => {
    delete (window as any).__vmdeD2
    vi.resetModules()
  })

  it('exposes exactly the six functions custom-diagrams.ts reads off window.__vmdeD2', async () => {
    await import('./d2-entry')
    const bridge = (window as any).__vmdeD2
    expect(bridge.renderD2Graph).toBe(h.renderD2Graph)
    expect(bridge.renderD2GraphElk).toBe(h.renderD2GraphElk)
    expect(bridge.canvasMeasure).toBe(h.canvasMeasure)
    expect(bridge.unsupportedReason).toBe(h.unsupportedReason)
    expect(bridge.d2Theme).toBe(h.d2Theme)
    expect(bridge.makeSketch).toBe(h.makeSketch)
    expect(Object.keys(bridge).sort()).toEqual(
      [
        'renderD2Graph',
        'renderD2GraphElk',
        'canvasMeasure',
        'unsupportedReason',
        'd2Theme',
        'makeSketch',
      ].sort(),
    )
  })
})
