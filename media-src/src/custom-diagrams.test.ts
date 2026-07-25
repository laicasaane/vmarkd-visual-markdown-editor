// @vitest-environment jsdom
import { test, expect, beforeEach, describe } from 'vitest'
import {
  basemapFor,
  enrichMarkdownLabels,
  findBlocks,
  presentCustomLangs,
  renderWavedrom,
} from './custom-diagrams'

beforeEach(() => {
  document.body.innerHTML = ''
})

// The `theme.geoBasemap` setting → Leaflet tile source (initLeafletMap reads this). `auto` (default)
// is themed monochrome CARTO (Positron light / Dark Matter dark); `voyager`/`osm` are colored; `none`
// disables the basemap. Keep in sync with the package.json enum.
describe('basemapFor (theme.geoBasemap → tile source)', () => {
  test('auto (default) is themed monochrome CARTO, flipping light/dark by mode', () => {
    const light = basemapFor('auto', false)
    const dark = basemapFor('auto', true)
    expect(light?.url).toContain('cartocdn.com/light_all/')
    expect(dark?.url).toContain('cartocdn.com/dark_all/')
    expect(light?.subdomains).toBe('abcd')
  })

  test('an unknown value falls back to auto (themed monochrome), NOT none', () => {
    expect(basemapFor(undefined, false)?.url).toContain(
      'cartocdn.com/light_all/',
    )
    expect(basemapFor('bogus', true)?.url).toContain('cartocdn.com/dark_all/')
  })

  test('voyager is the colored CARTO Voyager basemap (mode-independent)', () => {
    expect(basemapFor('voyager', false)?.url).toContain(
      'cartocdn.com/rastertiles/voyager/',
    )
    expect(basemapFor('voyager', true)?.url).toContain(
      'cartocdn.com/rastertiles/voyager/',
    )
  })

  test('osm is the OpenStreetMap basemap (abc subdomains, no retina token)', () => {
    const osm = basemapFor('osm', false)
    expect(osm?.url).toContain('tile.openstreetmap.org/')
    expect(osm?.url).not.toContain('{r}') // OSM has no retina tiles
    expect(osm?.subdomains).toBe('abc')
  })

  test('none disables the basemap (null → geometry only)', () => {
    expect(basemapFor('none', false)).toBeNull()
    expect(basemapFor('none', true)).toBeNull()
  })
})

// Regression for the "diagram sits on a code-PANEL background" bug: Vditor highlights these unknown
// languages as code first (adds `.hljs` to the <code>); findBlocks swaps <code>→<div> and MUST NOT
// carry `.hljs` over, else the highlight.js theme paints the code-panel bg behind the diagram svg.
// (e2e counterpart: test/vscode-e2e/diagram-bg.spec.ts.)

test('code→div swap drops the hljs class (keeps language-X)', () => {
  document.body.innerHTML =
    '<pre class="vditor-ir__preview"><code class="language-d2 hljs">a -> b</code></pre>'
  const blocks = findBlocks(document, 'd2')
  expect(blocks).toHaveLength(1)
  const w = blocks[0].wrapper
  expect(w.tagName).toBe('DIV')
  expect(w.classList.contains('hljs')).toBe(false)
  expect(w.classList.contains('language-d2')).toBe(true)
  expect(w.className).toBe('language-d2')
  expect(blocks[0].code).toBe('a -> b')
})

test('preserves OTHER classes while stripping only hljs', () => {
  document.body.innerHTML =
    '<pre class="vditor-ir__preview"><code class="language-wavedrom hljs extra-x">{}</code></pre>'
  const blocks = findBlocks(document, 'wavedrom')
  expect(blocks).toHaveLength(1)
  const w = blocks[0].wrapper
  expect(w.classList.contains('hljs')).toBe(false)
  expect(w.classList.contains('language-wavedrom')).toBe(true)
  expect(w.classList.contains('extra-x')).toBe(true)
})

test('a code block without hljs swaps cleanly to a language-only div', () => {
  document.body.innerHTML =
    '<pre class="vditor-ir__preview"><code class="language-stl">solid x</code></pre>'
  const blocks = findBlocks(document, 'stl')
  expect(blocks).toHaveLength(1)
  expect(blocks[0].wrapper.className).toBe('language-stl')
})

test('skips the editable IR source marker (only renders in the preview)', () => {
  document.body.innerHTML =
    '<pre class="vditor-ir__marker--pre"><code class="language-d2 hljs">a -> b</code></pre>'
  expect(findBlocks(document, 'd2')).toHaveLength(0)
})

test('an existing rendered div is reused as the wrapper (idempotent, no hljs)', () => {
  document.body.innerHTML =
    '<pre class="vditor-ir__preview"><div class="language-d2" data-code="a -> b"></div></pre>'
  const blocks = findBlocks(document, 'd2')
  expect(blocks).toHaveLength(1)
  expect(blocks[0].wrapper.tagName).toBe('DIV')
  expect(blocks[0].wrapper.classList.contains('hljs')).toBe(false)
})

// Task 186: WaveDrom's renderWaveForm resolves its output node via a DOCUMENT-GLOBAL
// document.getElementById(prefix + index). The IR pane renders first and its id-bearing
// divs stay in the pane — so when the full-Preview pass restarted numbering at 0, every
// getElementById hit the STALE IR div, the offscreen stage stayed empty, and faithfulRender
// swapped a zero-height empty div into the Preview wrapper (parity signature {ir:>0, pv:0}).
describe('renderWavedrom target ids across multi-pane passes (task 186)', () => {
  const WAVE = '{"signal":[{"name":"clk","wave":"p."}]}'

  beforeEach(() => {
    // addScript short-circuits when the script tag exists; the stub below mimics the real
    // bundle's contract (1 getElementById hit in wavedrom.min.js) incl. replacing innerHTML.
    if (!document.getElementById('vditorWavedromScript')) {
      const s = document.createElement('script')
      s.id = 'vditorWavedromScript'
      document.head.appendChild(s)
    }
    ;(window as any).wavedrom = {
      renderWaveForm: (i: number, _src: object, prefix: string) => {
        const el = document.getElementById(prefix + i)
        if (el) el.innerHTML = `<svg data-wd="${i}"></svg>`
      },
    }
  })

  async function renderPass(html: string): Promise<HTMLElement> {
    const pane = document.createElement('div')
    pane.innerHTML = html
    document.body.appendChild(pane)
    renderWavedrom(pane)
    // addScript.then → faithfulRender (async) → swap: microtasks + a macrotask tick.
    await new Promise((r) => setTimeout(r, 0))
    return pane.querySelector<HTMLElement>('.language-wavedrom')!
  }

  test('a second pass (the full-Preview copy) renders into ITS wrapper, not the stale IR div', async () => {
    const ir = await renderPass(
      `<div class="language-wavedrom" data-code='${WAVE}'></div>`,
    )
    expect(ir.querySelector('svg')).toBeTruthy()

    const pv = await renderPass(
      `<div class="language-wavedrom" data-code='${WAVE}'></div>`,
    )
    expect(pv.getAttribute('data-processed')).toBe('true')
    // The bug left this empty (svg drawn into the IR pane's leftover div instead).
    expect(pv.querySelector('svg')).toBeTruthy()
  })

  test('no __vmarkd_wd_* ids remain after a pass — nothing for a later getElementById to hit', async () => {
    // The id must exist only on the offscreen stage during produce(): anything retained in a
    // pane (or persisted by the task-184 render cache and restored in a session whose counter
    // restarted) becomes a stale getElementById winner for some future index.
    await renderPass(
      `<div class="language-wavedrom" data-code='${WAVE}'></div>`,
    )
    await renderPass(
      `<div class="language-wavedrom" data-code='${WAVE}'></div>`,
    )
    expect(document.querySelectorAll('[id^="__vmarkd_wd_"]')).toHaveLength(0)
  })
})

// Task 154: |md| label enrichment — Lute render + offscreen measure BEFORE layout.
// NOTE: getD2Lute caches module-level, so the no-Lute test MUST run first in this file.
describe('enrichMarkdownLabels (task 154)', () => {
  const mdShape = () => ({
    id: 'a',
    idVal: 'a',
    label: '# T',
    shape: 'text',
    language: 'markdown',
    special: { isSequence: false, isGrid: false },
  })
  const graphOf = (shapes: object[]) => ({ shapes, edges: [] })

  test('without window.Lute the graph is left untouched (plain-text fallback)', async () => {
    delete (window as { Lute?: unknown }).Lute
    const graph = graphOf([mdShape()]) as never
    await enrichMarkdownLabels(graph)
    expect(
      (graph as { shapes: { mdHtml?: string }[] }).shapes[0].mdHtml,
    ).toBeUndefined()
  })

  test('attaches Lute-rendered mdHtml + a floored mdSize to |md| text shapes only', async () => {
    ;(window as { Lute?: unknown }).Lute = {
      New: () => ({ Md2HTML: (md: string) => `<h1>${md.trim()}</h1>` }),
    }
    const graph = graphOf([
      mdShape(),
      {
        id: 'b',
        idVal: 'b',
        label: 'plain',
        shape: 'text',
        special: { isSequence: false, isGrid: false },
      },
      {
        id: 'c',
        idVal: 'c',
        label: 'lbl',
        shape: 'rectangle',
        language: 'markdown',
        special: { isSequence: false, isGrid: false },
      },
    ]) as never
    await enrichMarkdownLabels(graph)
    const shapes = (
      graph as {
        shapes: { mdHtml?: string; mdSize?: { w: number; h: number } }[]
      }
    ).shapes
    expect(shapes[0].mdHtml).toBe('<h1># T</h1>')
    // jsdom has no layout — getBoundingClientRect is 0 — the measure floors kick in.
    expect(shapes[0].mdSize).toEqual({ w: 24, h: 16 })
    // A plain text shape and a non-text shape must NOT be enriched.
    expect(shapes[1].mdHtml).toBeUndefined()
    expect(shapes[2].mdHtml).toBeUndefined()
  })
})

// Drives observeCustomDiagrams' per-lang dispatch (task 164 §5): only engines whose lang is present
// get invoked + a yielded frame. Must be a SUPERSET of findBlocks (no edit-surface filter).
describe('presentCustomLangs', () => {
  test('empty doc → empty set (no-diagram sweeps skip every renderer)', () => {
    document.body.innerHTML =
      '<div id="app"><p>prose</p><pre><code>plain</code></pre></div>'
    expect(presentCustomLangs(document.getElementById('app')!).size).toBe(0)
  })

  test('picks out exactly the langs with an un-rendered block (incl. hyphenated vega-lite)', () => {
    document.body.innerHTML =
      '<div id="app">' +
      '<div class="language-d2"></div>' +
      '<code class="language-vega-lite hljs">{}</code>' +
      '<pre><code class="language-python">x=1</code></pre>' +
      '</div>'
    const present = presentCustomLangs(document.getElementById('app')!)
    expect(present.has('d2')).toBe(true)
    expect(present.has('vega-lite')).toBe(true)
    // A native/non-custom lang is still reported (harmless: it has no renderer in the array), but a
    // renderer whose lang is absent (e.g. wavedrom) is NOT — that's the whole point.
    expect(present.has('wavedrom')).toBe(false)
  })

  test('skips already-rendered blocks (data-processed="true")', () => {
    document.body.innerHTML =
      '<div id="app">' +
      '<div class="language-d2" data-processed="true"></div>' +
      '<div class="language-nomnoml"></div>' +
      '</div>'
    const present = presentCustomLangs(document.getElementById('app')!)
    expect(present.has('d2')).toBe(false) // done → not re-swept
    expect(present.has('nomnoml')).toBe(true)
  })

  test('SUPERSET of findBlocks: a lang only in an editable marker is still reported (safe false positive)', () => {
    // findBlocks would SKIP this (edit-surface .closest filter); the pre-scan must NOT — a false
    // negative would drop a real diagram, a false positive just degrades to a renderer no-op.
    document.body.innerHTML =
      '<div id="app"><pre class="vditor-ir__marker--pre">' +
      '<code class="language-wavedrom">{}</code></pre></div>'
    expect(
      presentCustomLangs(document.getElementById('app')!).has('wavedrom'),
    ).toBe(true)
  })
})

// Task 377 — nomnoml drew node borders, edges AND labels in one colour (the theme foreground), so
// the structure shouted as loudly as the body text. Structure now takes the palette's `muted`;
// labels keep `currentColor`. Only the ink changed — nomnoml stays out of full palette-pairing
// (ADR-0006: trialled and reverted), and the 6% node tint is pre-existing.
import { themeNomnomlSvg } from './custom-diagrams'

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

// Task 379 — Leaflet snaps fitBounds to WHOLE zoom levels by default, and a level is a factor of 2,
// so a dataset can be drawn at up to half the size the box could show. `zoomSnap: 0` removes that
// quantisation. Measured gain on the fixture: 3% — small, but free. The visible size of a map is
// otherwise geometry, not a bug: fitBounds keeps geographic proportions.
import { initLeafletMap } from './custom-diagrams'

test('the map is created with fractional zoom', () => {
  const opts: Record<string, unknown>[] = []
  const map = {
    fitBounds: () => {},
    setView: () => {},
  }
  const layer = { addTo: () => {}, getBounds: () => ({}) }
  ;(window as any).L = {
    map: (_el: HTMLElement, o: Record<string, unknown>) => {
      opts.push(o)
      return map
    },
    geoJSON: () => layer,
    circleMarker: () => ({}),
    control: { attribution: () => ({ addTo: () => {} }) },
  }
  const wrapper = document.createElement('div')
  document.body.replaceChildren(wrapper)
  initLeafletMap(wrapper, { type: 'FeatureCollection', features: [] })
  expect(opts).toHaveLength(1)
  expect(opts[0].zoomSnap).toBe(0)
})

// Task 380 — vega's default labelPadding (2) leaves the axis tick touching the top of the label
// glyph with no gap (measured on the fixture: the tick ends on row 216, the "A" starts on 217).
import { vegaRenderConfig } from './custom-diagrams'

describe('vegaRenderConfig', () => {
  test('gives axis labels breathing room without detaching them from their tick', () => {
    const axis = vegaRenderConfig('#e6edf3').axis as Record<string, unknown>
    expect(axis.labelPadding).toBe(4)
  })

  test('drives every axis colour from the themed foreground', () => {
    const axis = vegaRenderConfig('#abcdef').axis as Record<string, unknown>
    for (const k of [
      'labelColor',
      'titleColor',
      'tickColor',
      'domainColor',
      'gridColor',
    ]) {
      expect(axis[k], `${k} is not themed`).toBe('#abcdef')
    }
    // The canvas stays transparent so the page background shows through, like every other engine.
    expect(vegaRenderConfig('#abcdef').background).toBe('transparent')
  })
})
