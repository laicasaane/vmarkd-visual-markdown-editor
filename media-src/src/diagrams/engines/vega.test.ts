// @vitest-environment jsdom
// Task 409: moved out of custom-diagrams.test.ts / vega-strip.test.ts alongside the vega engine.
// Vega/Vega-Lite offline data stripping (stripRemoteData). Remote `data.url` loads are blocked for
// offline rendering + security (a remote fetch leaks that the file was opened). Only inline
// `data.values` works. The strip must be RECURSIVE — a `url` can hide in `data: [...]` arrays or
// nested layers/transforms, not just at the top level (the old top-level-only check leaked).
import { afterEach, describe, expect, it, test } from 'vitest'
import { setD2Config } from '../../diagram-kit/d2-config'
import {
  renderVega,
  renderVegaLite,
  stripRemoteData,
  vegaRenderConfig,
} from './vega'

describe('missing Vega dependency', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    delete (window as any).vegaEmbed
  })

  for (const [lang, render] of [
    ['vega', renderVega],
    ['vega-lite', renderVegaLite],
  ] as const) {
    test(`a failed Vega load shows a terminal ${lang} error instead of returning silently`, async () => {
      document.body.innerHTML = `<div class="language-${lang}" data-code='{"data":{"values":[]}}'></div>`

      render()
      document
        .getElementById('vditorVegaScript')!
        .dispatchEvent(new Event('error'))
      await new Promise((r) => setTimeout(r, 0))

      const wrapper = document.querySelector<HTMLElement>(`.language-${lang}`)!
      expect(wrapper.querySelector('.vmde-diagram-error')).not.toBeNull()
      expect(wrapper.textContent).toContain('Vega')
      expect(wrapper.getAttribute('data-vega-error')).toBe('load')
      expect(wrapper.getAttribute('data-processed')).toBe('true')
    })
  }
})

describe('stripRemoteData (vega offline guard)', () => {
  it('removes a top-level data.url', () => {
    const spec = stripRemoteData({
      data: { url: 'https://evil.example/x.json' },
    })
    expect(spec.data.url).toBeUndefined()
  })

  it('keeps inline data.values', () => {
    const spec = stripRemoteData({
      data: { values: [{ a: 1 }], url: 'https://evil.example/x.json' },
    })
    expect((spec.data as any).url).toBeUndefined()
    expect(spec.data.values).toEqual([{ a: 1 }])
  })

  it('removes urls nested in layers / transforms / lookups (recursive)', () => {
    const spec = stripRemoteData({
      layer: [
        { data: { url: 'https://evil.example/a.csv' }, mark: 'line' },
        {
          transform: [
            {
              lookup: 'k',
              from: { data: { url: 'https://evil.example/b.json' } },
            },
          ],
        },
      ],
    })
    expect((spec.layer[0].data as any).url).toBeUndefined()
    // `stripRemoteData<T>` returns the generic T, and this literal's heterogeneous `layer` array
    // makes TS infer `from`/`transform` as possibly absent on the union member — a fixture-shape
    // artifact, not a real runtime possibility (we just constructed this literal above with both
    // present). Same reach-into-a-loosely-typed-fixture cast as the `spec.data` line above.
    const layer1 = spec.layer[1] as any
    expect(layer1.transform[0].from.data.url).toBeUndefined()
  })

  it('removes urls inside a data:[...] array (full Vega multi-source)', () => {
    const spec = stripRemoteData({
      data: [
        { name: 'a', url: 'https://evil.example/a.json' },
        { name: 'b', values: [1, 2, 3] },
      ],
    })
    expect(spec.data[0].url).toBeUndefined()
    expect(spec.data[1].values).toEqual([1, 2, 3])
  })

  it('does not touch a url-like value under a non-url key ($schema)', () => {
    const spec = stripRemoteData({
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      data: { values: [] },
    })
    expect(spec.$schema).toBe('https://vega.github.io/schema/vega-lite/v5.json')
  })

  it('leaves a fully-inline spec unchanged', () => {
    const input = {
      mark: 'bar',
      data: { values: [{ x: 1, y: 2 }] },
      encoding: { x: { field: 'x' }, y: { field: 'y' } },
    }
    expect(stripRemoteData(structuredClone(input))).toEqual(input)
  })
})

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

  // Task 424 (reprise) — a mark with no colour encoding of its own must fall back to the same
  // salmon echarts uses on material-dark, in BOTH dialects: vega-lite honours a generic
  // `config.mark.color`, raw Vega only reads `config.<marktype>.fill`/`.stroke` per mark type.
  test('defaults every common mark type to a themed colour, fill for filled marks and stroke for open ones', () => {
    const cfg = vegaRenderConfig('#abcdef', '#d87c7c') as Record<
      string,
      { fill?: string; stroke?: string; color?: string }
    >
    expect(cfg.mark.color).toBe('#d87c7c') // vega-lite's generic fallback
    for (const k of [
      'arc',
      'area',
      'path',
      'rect',
      'shape',
      'symbol',
      'text',
    ]) {
      expect(cfg[k].fill, `${k}.fill`).toBe('#d87c7c')
    }
    for (const k of ['line', 'rule']) {
      expect(cfg[k].stroke, `${k}.stroke`).toBe('#d87c7c')
    }
  })

  test('with no mark colour, no mark-type config is added at all (unthemed content themes)', () => {
    const cfg = vegaRenderConfig('#abcdef')
    expect(cfg.mark).toBeUndefined()
    expect(cfg.rect).toBeUndefined()
  })
})

describe('material-dark mark colour end to end (task 424 reprise)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    delete (window as any).vegaEmbed
    setD2Config({ contentTheme: undefined })
  })

  // loadScript resolves synchronously (no real network) when a script with this id already
  // exists — see load-script.ts's "present + not in flight → already loaded" branch.
  function stubVegaScriptLoaded() {
    const s = document.createElement('script')
    s.id = 'vditorVegaScript'
    document.head.appendChild(s)
  }

  it('renders a material-dark bar/rect mark with the shared echarts salmon', async () => {
    setD2Config({ contentTheme: 'material-dark' })
    stubVegaScriptLoaded()
    document.body.innerHTML =
      '<code class="language-vega">{"mark":"bar","data":{"values":[]}}</code>'
    let captured: Record<string, unknown> | undefined
    ;(window as any).vegaEmbed = (_el: unknown, _spec: unknown, opts: any) => {
      captured = opts.config
      return Promise.resolve()
    }
    renderVega()
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    expect(captured?.mark).toEqual({ color: '#d87c7c' })
    expect(captured?.rect).toEqual({ fill: '#d87c7c' })
  })

  it('leaves an un-mapped content theme with no forced mark colour', async () => {
    setD2Config({ contentTheme: 'github-dark' })
    stubVegaScriptLoaded()
    document.body.innerHTML =
      '<code class="language-vega">{"mark":"bar","data":{"values":[]}}</code>'
    let captured: Record<string, unknown> | undefined
    ;(window as any).vegaEmbed = (_el: unknown, _spec: unknown, opts: any) => {
      captured = opts.config
      return Promise.resolve()
    }
    renderVega()
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    expect(captured?.mark).toBeUndefined()
    expect(captured?.rect).toBeUndefined()
  })
})
