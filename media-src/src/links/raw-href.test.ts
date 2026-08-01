// @vitest-environment jsdom
//
// This suite needs a real DOM (Element.getAttribute, an actual .href resolution to prove
// against) — the vitest config defaults to `environment: 'node'` for media-src unit tests
// (most are pure-logic, no DOM needed), so this file opts into jsdom on its own.
import { describe, expect, it } from 'vitest'
import { rawHrefOf } from './raw-href'

// Task 359 #2 — rawHrefOf must return the raw href ATTRIBUTE, never the browser-resolved
// `.href` property. jsdom resolves a relative `<a href>` against its own document location
// (not the webview's vscode-resource <base href>), but the bug shape is the same: `.href`
// on a real HTML anchor is always an absolute URL, however the attribute reads. Pinning
// against the attribute (not against a specific resolved value) is what proves the fix,
// since the exact resolved URL is jsdom/environment-dependent either way.
describe('rawHrefOf', () => {
  it('returns the raw relative href, not the browser-resolved absolute one', () => {
    const a = document.createElement('a')
    a.setAttribute('href', './notes/a.md')
    expect(a.href).not.toBe('./notes/a.md') // sanity: jsdom DOES resolve .href
    expect(rawHrefOf(a)).toBe('./notes/a.md')
  })

  it('returns a same-document anchor-only href untouched', () => {
    const a = document.createElement('a')
    a.setAttribute('href', '#heading')
    expect(rawHrefOf(a)).toBe('#heading')
  })

  it('returns an already-absolute href unchanged', () => {
    const a = document.createElement('a')
    a.setAttribute('href', 'https://example.com/page')
    expect(rawHrefOf(a)).toBe('https://example.com/page')
  })

  it('reads the href attribute of an SVG <a> the same way (no .href string fallback needed)', () => {
    const svgA = document.createElementNS('http://www.w3.org/2000/svg', 'a')
    svgA.setAttribute('href', './diagram-target.md')
    // Sanity: SVGAElement.href is an SVGAnimatedString, not a plain string — the very reason
    // the old code special-cased SVG. rawHrefOf doesn't need to know that; getAttribute works
    // identically on both element types.
    expect(typeof (svgA as unknown as { href: unknown }).href).not.toBe(
      'string',
    )
    expect(rawHrefOf(svgA)).toBe('./diagram-target.md')
  })

  it('returns "" when there is no href attribute', () => {
    const a = document.createElement('a')
    expect(rawHrefOf(a)).toBe('')
  })
})
