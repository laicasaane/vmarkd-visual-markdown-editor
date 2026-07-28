// @vitest-environment jsdom
// Task 409: moved out of custom-diagrams.test.ts alongside the nomnoml engine itself.
import { describe, expect, test } from 'vitest'
import { themeNomnomlSvg } from './nomnoml'

// Task 377 — nomnoml drew node borders, edges AND labels in one colour (the theme foreground), so
// the structure shouted as loudly as the body text. Structure now takes the palette's `muted`;
// labels keep `currentColor`. Only the ink changed — nomnoml stays out of full palette-pairing
// (ADR-0006: trialled and reverted), and the 6% node tint is pre-existing.

// Shaped like nomnoml's real output: <text> carries NO fill (only stroke="none") and INHERITS the
// ink from an ancestor <g fill="#33322E">. A fixture with fill ON the text would make this suite
// pass while the real diagram came out fully muted — which is exactly what happened.
function nomnomlSvg(): SVGElement {
  const host = document.createElement('div')
  host.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg">' +
    '<g fill="#33322E" stroke="#33322E">' +
    '<rect fill="#eee8d5" stroke="#33322E"></rect>' + // node box
    '<path fill="#33322E" stroke="#33322e"></path>' + // arrowhead + edge
    '<text stroke="none">Pirate</text>' + // inherits the group fill
    '</g>' +
    '<g fill="#ff0000"><text stroke="none">Authored</text></g>' + // a #fill: directive
    '</svg>'
  return host.querySelector('svg') as SVGElement
}

describe('themeNomnomlSvg — structure vs labels', () => {
  const win = (muted: string | undefined) =>
    ({
      // themeNomnomlSvg only reaches the palette through mutedInk(win); a stub window is enough.
      getComputedStyle: () => ({ getPropertyValue: () => '' }),
      __muted: muted,
    }) as unknown as Window

  test('paints borders/edges with muted and leaves the label on currentColor', () => {
    const svg = nomnomlSvg()
    // mutedInk resolves through the real palette code; pin it by faking the d2-config globals is
    // overkill here, so assert the ROLES: whatever structure gets, the text must NOT get it.
    themeNomnomlSvg(svg, win('#9198a1'))
    const text = svg.querySelector('text') as SVGElement
    const path = svg.querySelector('path') as SVGElement
    expect(text.getAttribute('fill')).toBe('currentColor')
    // …and a label the AUTHOR coloured keeps their colour, inherited and untouched.
    const authored = svg.querySelectorAll('text')[1] as SVGElement
    expect(authored.getAttribute('fill')).toBeNull()
    expect((authored.parentElement as Element).getAttribute('fill')).toBe(
      '#ff0000',
    )
    expect(path.getAttribute('fill')).not.toBe('currentColor')
    expect(path.getAttribute('stroke')).not.toBe('currentColor')
    expect(path.getAttribute('fill')).toBe(path.getAttribute('stroke'))
  })

  test('keeps the 6% node tint on currentColor (unchanged, and not a surface fill)', () => {
    const svg = nomnomlSvg()
    themeNomnomlSvg(svg, win('#9198a1'))
    const rect = svg.querySelector('rect') as SVGElement
    expect(rect.getAttribute('fill')).toBe('currentColor')
    expect(rect.getAttribute('fill-opacity')).toBe('0.06')
  })
})
