// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'

// The palette resolver reads the d2-config globals and the live VS Code CSS vars; stub it so these
// cases are about the COLOUR ROLES, not about theme plumbing (which diagram-palette.test.ts owns).
const { resolveDiagramPalette } = vi.hoisted(() => ({
  resolveDiagramPalette: vi.fn(),
}))
vi.mock('./diagram-palette', () => ({ resolveDiagramPalette }))

import {
  applyFlowchartLabelHalo,
  flowchartDrawOptions,
} from './flowchart-retheme'

// Task 376 — flowchart drew lines, borders AND text in one colour, the theme foreground. On
// github-dark that is #e6edf3, so every box and arrow was near-white and the diagram shouted as
// loudly as the body text. Structure now takes `muted`, labels keep `fg`.
describe('flowchartDrawOptions', () => {
  const el = () => {
    const d = document.createElement('div')
    d.style.color = 'rgb(230, 237, 243)'
    document.body.replaceChildren(d)
    return d
  }

  // Each case sets its own implementation and NO mockReset between them: under vitest 4 a
  // `mockReset()` in beforeEach makes a later `mockImplementation` throw escape the mock and fail
  // the test even though the code under test catches it (verified in isolation — the catch works,
  // the fallback colours come back). mockImplementation everywhere keeps the cases independent.

  it('draws structure in muted and labels in fg', () => {
    resolveDiagramPalette.mockImplementation(() => ({
      fg: '#e6edf3',
      muted: '#9198a1',
      bg: '#0d1117',
    }))
    const o = flowchartDrawOptions(window, el())
    expect(o['line-color']).toBe('#9198a1')
    expect(o['element-color']).toBe('#9198a1')
    expect(o['font-color']).toBe('#e6edf3')
  })

  it('keeps fill "none" so box interiors stay transparent', () => {
    // Raphael renders `fill:"transparent"` BLACK; "none" is the only working value (task 91).
    resolveDiagramPalette.mockImplementation(() => ({
      fg: '#fff',
      muted: '#888',
    }))
    expect(flowchartDrawOptions(window, el()).fill).toBe('none')
  })

  it('falls back to the computed foreground for BOTH roles when the palette has no muted', () => {
    resolveDiagramPalette.mockImplementation(() => ({ fg: '#e6edf3' }))
    const o = flowchartDrawOptions(window, el())
    expect(o['line-color']).toBe('rgb(230, 237, 243)')
    expect(o['font-color']).toBe('rgb(230, 237, 243)')
  })

  it('never returns an unset colour when the palette throws (flowchart.js would draw BLACK)', () => {
    resolveDiagramPalette.mockImplementation(() => {
      throw new Error('theme globals not ready')
    })
    const o = flowchartDrawOptions(window, el())
    expect(o['line-color']).toBe('rgb(230, 237, 243)')
    expect(o['element-color']).toBe('rgb(230, 237, 243)')
    expect(o['font-color']).toBe('rgb(230, 237, 243)')
  })
})

// Task 378 — the routed line runs THROUGH an edge label ("no"). flowchart.js has no label-background
// option, so the label gets a halo in the page's own colour instead.
describe('applyFlowchartLabelHalo', () => {
  const mount = (bg: string) => {
    const page = document.createElement('div')
    page.style.backgroundColor = bg
    const el = document.createElement('div')
    el.innerHTML = '<svg><text>no</text><path d="M0 0"></path></svg>'
    page.appendChild(el)
    document.body.replaceChildren(page)
    return el
  }

  it('paints the halo UNDER the glyphs in the backdrop colour', () => {
    const el = mount('rgb(13, 17, 23)')
    applyFlowchartLabelHalo(window, el)
    const t = el.querySelector('text') as SVGElement
    // paint-order is what puts the stroke beneath the fill; without it the halo thickens the glyph.
    expect(t.style.paintOrder).toBe('stroke')
    expect(t.style.stroke).toBe('rgb(13, 17, 23)')
    expect(t.style.strokeWidth).toBe('5px')
  })

  it('takes the backdrop from the nearest ANCESTOR that paints one', () => {
    // The diagram div itself is transparent — the colour comes from the markdown body above it.
    const el = mount('rgb(255, 255, 255)')
    applyFlowchartLabelHalo(window, el)
    expect((el.querySelector('text') as SVGElement).style.stroke).toBe(
      'rgb(255, 255, 255)',
    )
  })

  it('leaves the labels alone when no backdrop can be resolved', () => {
    // Better a struck-through label than a halo in a colour that is not the page's — that would be
    // a visible smear rather than a gap.
    // Explicit, not inherited from the case above: nothing on the page paints a background AND the
    // palette is unresolvable, which is the only state that yields no backdrop.
    resolveDiagramPalette.mockImplementation(() => {
      throw new Error('theme globals not ready')
    })
    const el = document.createElement('div')
    el.innerHTML = '<svg><text>no</text></svg>'
    document.body.replaceChildren(el)
    applyFlowchartLabelHalo(window, el)
    expect((el.querySelector('text') as SVGElement).style.stroke).toBe('')
  })
})
