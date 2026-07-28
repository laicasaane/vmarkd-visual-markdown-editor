import { test, expect, describe } from 'vitest'
import {
  DIAGRAM_CONFIG_KEYS,
  ENGINES,
  engineLangs,
  engineLangSet,
} from './engine-registry'

// 185/2a — the registry replaced ~12 hand-synced lists across 8 files. These tests PIN each
// derived set to the exact membership those lists had at the time of the refactor, so the
// consolidation is provably behavior-identical, and future edits to the table are conscious
// membership changes (update the pin here) rather than accidents.

const sorted = (a: Iterable<string>) => Array.from(a).sort()

describe('derived sets pin the pre-registry memberships exactly', () => {
  test('CUSTOM_LANGS (code-source hljs-exclusion) = all 18 engines', () => {
    expect(sorted(engineLangSet())).toEqual(
      sorted([
        'mermaid',
        'echarts',
        'flowchart',
        'graphviz',
        'plantuml',
        'mindmap',
        'markmap',
        'abc',
        'smiles',
        'math',
        'wavedrom',
        'nomnoml',
        'geojson',
        'topojson',
        'vega',
        'vega-lite',
        'stl',
        'd2',
      ]),
    )
  })

  test('NATIVE_DEFER (edit-activity) = the 9 native diagram engines', () => {
    expect(
      sorted(engineLangs((e) => e.family === 'native' && e.diagram)),
    ).toEqual(
      sorted([
        'mermaid',
        'graphviz',
        'echarts',
        'flowchart',
        'plantuml',
        'mindmap',
        'markmap',
        'abc',
        'smiles',
      ]),
    )
  })

  test('CACHED overlay langs (edit-activity) = all 17 diagrams (math excluded)', () => {
    expect(sorted(engineLangs((e) => e.diagram))).toEqual(
      sorted([
        'mermaid',
        'graphviz',
        'echarts',
        'flowchart',
        'plantuml',
        'mindmap',
        'markmap',
        'abc',
        'smiles',
        'd2',
        'wavedrom',
        'nomnoml',
        'geojson',
        'topojson',
        'vega',
        'vega-lite',
        'stl',
      ]),
    )
  })

  test('MEASURE_LANGS (edit-activity cover mode) = the 6 DOM-measuring engines', () => {
    expect(sorted(engineLangs((e) => e.measuresHidden))).toEqual(
      sorted(['echarts', 'mindmap', 'stl', 'geojson', 'topojson', 'flowchart']),
    )
  })

  test('CACHEABLE_LANGS (render-cache custom tier) = the 5 reusable-SVG custom engines', () => {
    expect(
      sorted(engineLangs((e) => e.family === 'custom' && e.cacheable)),
    ).toEqual(sorted(['d2', 'wavedrom', 'nomnoml', 'vega', 'vega-lite']))
  })

  test('NATIVE cacheable tier (task 184 Phase 3) = mermaid + abc + flowchart', () => {
    expect(
      sorted(engineLangs((e) => e.family === 'native' && e.cacheable)),
    ).toEqual(sorted(['mermaid', 'abc', 'flowchart']))
  })

  test('static-zoom engines (diagram-zoom) = the 6 static-SVG renderers', () => {
    expect(sorted(engineLangs((e) => e.zoom === 'static'))).toEqual(
      sorted(['d2', 'mermaid', 'flowchart', 'graphviz', 'abc', 'smiles']),
    )
  })

  test('Ctrl-gated engines (diagram-zoom-gate) = the 4 interactive renderers', () => {
    expect(sorted(engineLangs((e) => e.zoom === 'gated'))).toEqual(
      sorted(['markmap', 'mindmap', 'geojson', 'topojson']),
    )
  })

  test('mono retheme group = the 5 baked/currentColor SVG engines (stl excluded, task 164 §4)', () => {
    expect(sorted(engineLangs((e) => e.retheme === 'mono'))).toEqual(
      sorted(['plantuml', 'graphviz', 'abc', 'wavedrom', 'nomnoml']),
    )
  })

  test('stl has no retheme path — its material is theme-independent (task 164 §4)', () => {
    expect(ENGINES.find((e) => e.lang === 'stl')?.retheme).toBe('none')
  })

  test('geo retheme group = the 2 Leaflet map engines', () => {
    expect(sorted(engineLangs((e) => e.retheme === 'geo'))).toEqual(
      sorted(['geojson', 'topojson']),
    )
  })

  test('error-box titles cover all 18 engines with the exact pre-registry strings', () => {
    const titles = Object.fromEntries(
      ENGINES.map((e) => [e.lang, e.errorTitle]),
    )
    expect(titles).toEqual({
      mermaid: 'Mermaid',
      graphviz: 'Graphviz',
      echarts: 'ECharts',
      mindmap: 'Mindmap',
      flowchart: 'Flowchart',
      plantuml: 'PlantUML',
      d2: 'D2',
      vega: 'Vega',
      'vega-lite': 'Vega-Lite',
      wavedrom: 'WaveDrom',
      nomnoml: 'nomnoml',
      smiles: 'SMILES',
      geojson: 'GeoJSON',
      topojson: 'TopoJSON',
      stl: 'STL',
      math: 'Math',
      abc: 'abc',
      markmap: 'Markmap',
    })
  })
})

describe('cross-field consistency rules', () => {
  test('lang slugs are unique', () => {
    expect(new Set(ENGINES.map((e) => e.lang)).size).toBe(ENGINES.length)
  })

  test('only diagrams can be cacheable / measure / zoom / retheme', () => {
    for (const e of ENGINES.filter((e) => !e.diagram)) {
      expect(e.cacheable, e.lang).toBe(false)
      expect(e.measuresHidden, e.lang).toBe(false)
      expect(e.zoom, e.lang).toBe('none')
      expect(e.retheme, e.lang).toBe('none')
    }
  })

  test('a measuring engine is never in the static-zoom svg family without an svg output guard', () => {
    // flowchart is the one engine that both measures AND emits a static svg — pinned so a
    // future row edit that breaks this assumption is a conscious decision.
    expect(
      sorted(engineLangs((e) => e.measuresHidden && e.zoom === 'static')),
    ).toEqual(['flowchart'])
  })

  test('every engine has a non-empty error title', () => {
    for (const e of ENGINES)
      expect(e.errorTitle.length, e.lang).toBeGreaterThan(0)
  })
})

describe('configKeys (task 408 — per-engine cache/retheme config ownership)', () => {
  test('DIAGRAM_CONFIG_KEYS is exactly the union of every engine.configKeys', () => {
    const union = new Set<string>()
    for (const e of ENGINES) for (const k of e.configKeys) union.add(k)
    expect(sorted(union)).toEqual(sorted(DIAGRAM_CONFIG_KEYS))
  })

  test('no engine claims a configKey outside DIAGRAM_CONFIG_KEYS', () => {
    const allowed = new Set<string>(DIAGRAM_CONFIG_KEYS)
    for (const e of ENGINES)
      for (const k of e.configKeys)
        expect(allowed.has(k), `${e.lang} claims unknown key ${k}`).toBe(true)
  })

  test('pinned per-engine ownership (deliberate, not incidental)', () => {
    const byLang = Object.fromEntries(
      ENGINES.map((e) => [e.lang, e.configKeys]),
    )
    expect(byLang.mermaid).toEqual(['mermaidTheme', 'mermaidLayout'])
    expect(byLang.echarts).toEqual(['echartsTheme'])
    // mindmap shares the 'echarts' retheme strategy (one reRenderEcharts pass) — same own key.
    expect(byLang.mindmap).toEqual(['echartsTheme'])
    expect(byLang.geojson).toEqual(['geoBasemap'])
    expect(byLang.topojson).toEqual(['geoBasemap'])
    expect(byLang.d2).toEqual(['d2Layout', 'd2Theme', 'd2Sketch'])
    // Every other engine has no own diagram-config setting — only contentTheme (global) affects it.
    for (const e of ENGINES) {
      if (
        ['mermaid', 'echarts', 'mindmap', 'geojson', 'topojson', 'd2'].includes(
          e.lang,
        )
      )
        continue
      expect(e.configKeys, e.lang).toEqual([])
    }
  })
})

describe('cross-module wiring stays in sync with the registry', () => {
  test('native-offscreen RENDERERS keys == native cacheable engines', async () => {
    // native-offscreen transitively imports vditor source, which reads the esbuild-injected
    // VDITOR_VERSION define at module scope — provide it before the dynamic import.
    ;(globalThis as Record<string, unknown>).VDITOR_VERSION = 'test'
    const { NATIVE_CACHE_LANGS } = await import('./native-offscreen')
    expect(sorted(NATIVE_CACHE_LANGS)).toEqual(
      sorted(engineLangs((e) => e.family === 'native' && e.cacheable)),
    )
  })
})
