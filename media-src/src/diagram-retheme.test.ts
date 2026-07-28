// @vitest-environment jsdom
import { beforeAll, describe, expect, test, vi } from 'vitest'
import { CUSTOM_DIAGRAM_ADAPTERS } from './custom-diagrams'
import { engineLangs } from './engine-registry'

// diagram-retheme.ts transitively imports plantuml-retheme/mermaid-retheme/echarts-retheme, which
// import vditor source — that reads the esbuild-injected VDITOR_VERSION define at module scope, so
// it must be set before the dynamic import (same pattern as engine-registry.test.ts /
// native-offscreen.test.ts).
let monoOrGeoRerender: (
  lang: string,
) => ((el: HTMLElement | undefined, cdn: string) => void) | undefined
beforeAll(async () => {
  ;(globalThis as Record<string, unknown>).VDITOR_VERSION = 'test'
  ;({ monoOrGeoRerender } = await import('./diagram-retheme'))
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
