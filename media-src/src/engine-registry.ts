// SINGLE SOURCE OF TRUTH for per-engine diagram behavior (audit 185/2a).
//
// Before this registry the same knowledge lived in ~12 independent lists across 8 files
// (code-source CUSTOM_LANGS, edit-activity NATIVE_DEFER/CACHED/MEASURE_LANGS,
// render-cache-client CACHEABLE_LANGS, native-offscreen NATIVE_CACHE_LANGS, diagram-zoom
// STATIC_SVG_DIAGRAM, diagram-zoom-gate RENDERED_DIAGRAM, diagram-error ENGINE_TITLES, the
// custom-diagrams renderer array, and diagram-retheme's grouping) — adding an engine meant
// synchronized edits to all of them, and a missed one failed silently. Every one of those
// sites now DERIVES its set from these descriptors; engine-registry.test.ts pins each
// derived set and the cross-field consistency rules.
//
// PURE DATA — this module must import nothing from the engine modules (they import it).
// Render/re-render FUNCTIONS stay where they live (custom-diagrams.ts, diagram-retheme.ts,
// native-offscreen.ts RENDERERS); tests assert those maps stay in sync with the registry.

export type EngineFamily = 'native' | 'custom'
export type EngineZoom = 'static' | 'gated' | 'none'
// Which rethemeDiagrams flag re-renders the engine on a theme flip. 'echarts' also covers
// mindmap (one reRenderEcharts pass), 'vega' covers vega-lite, 'geo' is separate from 'mono'
// so a geoBasemap-only change re-renders maps alone, 'd2' is separate so the single authority
// dedupes its extra layout/theme triggers, 'none' = no retheme path (markmap, math, stl — stl's
// material is theme-independent, task 164 §4).
export type RethemeStrategy =
  | 'mermaid'
  | 'echarts'
  | 'flowchart'
  | 'vega'
  | 'smiles'
  | 'mono'
  | 'geo'
  | 'd2'
  | 'none'

export interface EngineDescriptor {
  /** The fenced-code language slug (class `language-<lang>`). */
  lang: string
  /** 'native' = rendered by Vditor's own (build-patched) renderer pass;
   *  'custom' = rendered by our observeCustomDiagrams/findBlocks observer. */
  family: EngineFamily
  /** false only for math — a formula, not a diagram (no overlay/zoom/cache semantics). */
  diagram: boolean
  /** In the task-184 render cache's OFFSCREEN-miss tier (reserve+paint, and re-render offscreen on a
   *  miss). false ⇒ not in that tier. Excluded WHY (task 184): echarts/mindmap/stl draw canvas/WebGL,
   *  markmap keeps a live d3 instance, geojson/topojson are live Leaflet maps, graphviz double-invokes
   *  its Viz.js worker on a reserve (hangs), smiles not cached yet. NOTE plantuml IS cached — but via a
   *  LIVE-miss tier (it sets data-processed early + skips reserved blocks, so offscreen is wrong for it),
   *  tracked as an explicit named tier in render-cache-client.ts (NATIVE_RESERVE_LANGS), not this flag. */
  cacheable: boolean
  /** Measures its container/text DURING render → cannot render inside display:none;
   *  edit-activity renders it visible under an opaque COVER overlay instead. */
  measuresHidden: boolean
  /** Inline interaction: 'static' = svg wheel-zoom/drag-pan (diagram-zoom.ts),
   *  'gated' = Ctrl-to-interact capture gate (diagram-zoom-gate.ts), 'none' = inert. */
  zoom: EngineZoom
  /** Human title on the shared `.vmarkd-diagram-error` box (diagram-error.ts — and inlined
   *  byte-identically for native engines by the esbuild patches; a test keeps them equal). */
  errorTitle: string
  retheme: RethemeStrategy
}

export const ENGINES: readonly EngineDescriptor[] = [
  // ── Vditor-native renderers (patched at build time) ──────────────────────────
  {
    lang: 'mermaid',
    family: 'native',
    diagram: true,
    cacheable: true,
    measuresHidden: false,
    zoom: 'static',
    errorTitle: 'Mermaid',
    retheme: 'mermaid',
  },
  {
    lang: 'echarts',
    family: 'native',
    diagram: true,
    cacheable: false,
    measuresHidden: true,
    zoom: 'none',
    errorTitle: 'ECharts',
    retheme: 'echarts',
  },
  {
    lang: 'mindmap',
    family: 'native',
    diagram: true,
    cacheable: false,
    measuresHidden: true,
    zoom: 'gated',
    errorTitle: 'Mindmap',
    retheme: 'echarts',
  },
  {
    lang: 'flowchart',
    family: 'native',
    diagram: true,
    cacheable: true,
    measuresHidden: true,
    zoom: 'static',
    errorTitle: 'Flowchart',
    retheme: 'flowchart',
  },
  {
    lang: 'graphviz',
    family: 'native',
    diagram: true,
    cacheable: false,
    measuresHidden: false,
    zoom: 'static',
    errorTitle: 'Graphviz',
    retheme: 'mono',
  },
  {
    lang: 'plantuml',
    family: 'native',
    diagram: true,
    cacheable: false,
    measuresHidden: false,
    zoom: 'none',
    errorTitle: 'PlantUML',
    retheme: 'mono',
  },
  {
    lang: 'markmap',
    family: 'native',
    diagram: true,
    cacheable: false,
    measuresHidden: false,
    zoom: 'gated',
    errorTitle: 'Markmap',
    retheme: 'none',
  },
  {
    lang: 'abc',
    family: 'native',
    diagram: true,
    cacheable: true,
    measuresHidden: false,
    zoom: 'static',
    errorTitle: 'abc',
    retheme: 'mono',
  },
  {
    lang: 'smiles',
    family: 'native',
    diagram: true,
    cacheable: false,
    measuresHidden: false,
    zoom: 'static',
    errorTitle: 'SMILES',
    retheme: 'smiles',
  },
  {
    lang: 'math',
    family: 'native',
    diagram: false,
    cacheable: false,
    measuresHidden: false,
    zoom: 'none',
    errorTitle: 'Math',
    retheme: 'none',
  },
  // ── Our custom renderers (custom-diagrams.ts / smiles excluded — it is native-patched) ──
  {
    lang: 'wavedrom',
    family: 'custom',
    diagram: true,
    cacheable: true,
    measuresHidden: false,
    zoom: 'none',
    errorTitle: 'WaveDrom',
    retheme: 'mono',
  },
  {
    lang: 'nomnoml',
    family: 'custom',
    diagram: true,
    cacheable: true,
    measuresHidden: false,
    zoom: 'none',
    errorTitle: 'nomnoml',
    retheme: 'mono',
  },
  {
    lang: 'geojson',
    family: 'custom',
    diagram: true,
    cacheable: false,
    measuresHidden: true,
    zoom: 'gated',
    errorTitle: 'GeoJSON',
    retheme: 'geo',
  },
  {
    lang: 'topojson',
    family: 'custom',
    diagram: true,
    cacheable: false,
    measuresHidden: true,
    zoom: 'gated',
    errorTitle: 'TopoJSON',
    retheme: 'geo',
  },
  {
    lang: 'vega',
    family: 'custom',
    diagram: true,
    cacheable: true,
    measuresHidden: false,
    zoom: 'none',
    errorTitle: 'Vega',
    retheme: 'vega',
  },
  {
    lang: 'vega-lite',
    family: 'custom',
    diagram: true,
    cacheable: true,
    measuresHidden: false,
    zoom: 'none',
    errorTitle: 'Vega-Lite',
    retheme: 'vega',
  },
  {
    lang: 'stl',
    family: 'custom',
    diagram: true,
    cacheable: false,
    measuresHidden: true,
    zoom: 'none',
    errorTitle: 'STL',
    // 'none': the STL material is the fixed, theme-independent STL_MATERIAL_COLOR on a transparent
    // canvas, so a flip changes nothing visually — no re-render needed (task 164 §4). Was 'mono',
    // which rebuilt the whole three.js WebGL scene twice per flip for zero change.
    retheme: 'none',
  },
  {
    lang: 'd2',
    family: 'custom',
    diagram: true,
    cacheable: true,
    measuresHidden: false,
    zoom: 'static',
    errorTitle: 'D2',
    retheme: 'd2',
  },
]

/** Langs matching `pred` (all langs when omitted), in registry order. */
export function engineLangs(pred?: (e: EngineDescriptor) => boolean): string[] {
  return ENGINES.filter(pred ?? (() => true)).map((e) => e.lang)
}

export function engineLangSet(
  pred?: (e: EngineDescriptor) => boolean,
): Set<string> {
  return new Set(engineLangs(pred))
}

export function engineByLang(lang: string): EngineDescriptor | undefined {
  return ENGINES.find((e) => e.lang === lang)
}
