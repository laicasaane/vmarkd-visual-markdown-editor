// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { CUSTOM_DIAGRAM_ADAPTERS } from './custom-diagrams'
import { reRenderD2 } from './diagram-engines/d2'
import { rethemeCacheFirst } from './render-cache-client'
import { engineLangs } from './engine-registry'

// diagram-retheme.ts transitively imports plantuml-retheme/mermaid-retheme/echarts-retheme, which
// import vditor source — that reads the esbuild-injected VDITOR_VERSION define at module scope, so
// it must be set before the dynamic import (same pattern as engine-registry.test.ts /
// native-offscreen.test.ts).
let monoOrGeoRerender: (
  lang: string,
) => ((el: HTMLElement | undefined, cdn: string) => void) | undefined
let rethemeDiagrams: (f: Record<string, unknown>) => void
beforeAll(async () => {
  ;(globalThis as Record<string, unknown>).VDITOR_VERSION = 'test'
  ;({ monoOrGeoRerender, rethemeDiagrams } = await import('./diagram-retheme'))
})

// Task 411 — reThemeGeoAndD2 dispatched its deferred work on BOTH requestAnimationFrame AND
// setTimeout(400), unconditionally, so every flip re-rendered each D2/geo block twice (two WASM
// compiles + layouts per diagram, two tile fetches per map). Counted at the ENGINE entry point
// rather than by spying on the timers: what the bug cost was live renders, not scheduled callbacks,
// and an assertion on the timers would keep passing if the two legs were ever merged into one
// callback that still ran the engine twice.
vi.mock('./diagram-engines/d2', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  reRenderD2: vi.fn(),
}))

// Task 436 — the re-theme path asks the cache before running an engine. Mocked to a plain switch so
// the WIRING is what's under test here (does a take-over really suppress the live render?); whether
// the lookup itself reserves/paints correctly is render-cache-client.test.ts's job.
vi.mock('./render-cache-client', () => ({
  rethemeCacheFirst: vi.fn(() => false),
}))

describe('reThemeGeoAndD2 fires ONCE per flip (task 411)', () => {
  const FLAGS = {
    theme: 'dark',
    code: false,
    mermaid: false,
    echarts: false,
    smiles: false,
    flowchart: false,
    vega: false,
    monoGroup: false,
    geo: false,
    d2: false,
  }
  afterEach(() => {
    vi.useRealTimers()
    // Unstub HERE, not at the end of the test that stubs: a failing assertion would otherwise skip
    // the restore and leak a fake requestAnimationFrame into every later test in this file.
    vi.unstubAllGlobals()
    vi.mocked(reRenderD2).mockClear()
    vi.mocked(rethemeCacheFirst).mockClear()
    vi.mocked(rethemeCacheFirst).mockReturnValue(false)
  })

  test('the cache takes D2 over → the live engine is NOT called (task 436)', () => {
    vi.useFakeTimers()
    vi.mocked(rethemeCacheFirst).mockReturnValue(true)
    rethemeDiagrams({ ...FLAGS, d2: true })
    vi.advanceTimersByTime(1000)
    expect(vi.mocked(rethemeCacheFirst)).toHaveBeenCalledWith(
      expect.anything(),
      ['d2'],
    )
    expect(vi.mocked(reRenderD2)).not.toHaveBeenCalled()
  })

  test('one live D2 re-render per rethemeDiagrams call, not two', () => {
    vi.useFakeTimers()
    // rAF is what the removed leg used; drive it so a reintroduced leg would be COUNTED, not
    // silently dropped by an environment that never runs frames.
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb)
      return frames.length
    })

    rethemeDiagrams({ ...FLAGS, d2: true })
    vi.advanceTimersByTime(1000)
    for (const cb of frames.splice(0)) cb(0)
    vi.advanceTimersByTime(1000)

    expect(vi.mocked(reRenderD2)).toHaveBeenCalledTimes(1)
  })

  test('no D2 re-render at all when the flip does not touch d2/geo', () => {
    vi.useFakeTimers()
    rethemeDiagrams({ ...FLAGS })
    vi.advanceTimersByTime(1000)
    expect(vi.mocked(reRenderD2)).not.toHaveBeenCalled()
  })

  test('the single fire is DEFERRED, not synchronous (the content-theme link lands late)', () => {
    vi.useFakeTimers()
    rethemeDiagrams({ ...FLAGS, d2: true })
    expect(
      vi.mocked(reRenderD2),
      'nothing renders before the deferral elapses',
    ).not.toHaveBeenCalled()
    vi.advanceTimersByTime(400)
    expect(vi.mocked(reRenderD2)).toHaveBeenCalledTimes(1)
  })
})

// Task 404 phase 2: MONO_RERENDER/GEO_RERENDER used to carry their OWN wavedrom/nomnoml/geojson/
// topojson rows — a second per-engine map next to CUSTOM_DIAGRAM_ADAPTERS for the exact same 4
// `family: 'custom'` engines. monoOrGeoRerender() is the single dispatch point both the module-init
// fail-loud check and reThemeMono/reThemeGeoAndD2 now read from: the native (plantuml/graphviz/abc)
// map first, then CUSTOM_DIAGRAM_ADAPTERS for everything else tagged mono/geo in the registry.
describe('monoOrGeoRerender dispatch (task 404 phase 2)', () => {
  test('every registry engine tagged mono or geo resolves to a function', () => {
    const langs = [
      ...engineLangs((e) => e.retheme === 'mono'),
      ...engineLangs((e) => e.retheme === 'geo'),
    ]
    expect(langs.length).toBeGreaterThan(0)
    for (const lang of langs) {
      expect(monoOrGeoRerender(lang), lang).toBeTypeOf('function')
    }
  })

  test('wavedrom/nomnoml/geojson/topojson dispatch through CUSTOM_DIAGRAM_ADAPTERS.reRender (not a second copy)', () => {
    for (const lang of ['wavedrom', 'nomnoml', 'geojson', 'topojson']) {
      const spy = vi.spyOn(CUSTOM_DIAGRAM_ADAPTERS[lang], 'reRender')
      monoOrGeoRerender(lang)?.(document.createElement('div'), 'https://cdn')
      expect(spy, lang).toHaveBeenCalledTimes(1)
      spy.mockRestore()
    }
  })

  test('an unknown lang resolves to undefined (no silent fallback)', () => {
    expect(monoOrGeoRerender('bogus-lang')).toBeUndefined()
  })
})
