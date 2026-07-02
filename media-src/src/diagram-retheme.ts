import type { VmarkdConfigOptions } from '../../src/protocol'
import { engineLangs } from './engine-registry'
import { activeModeElement } from './source-map'
import { applyMermaidTheme, resolveMermaidInit } from './mermaid-theme'
import { reRenderMermaid } from './mermaid-retheme'
import { resolveEchartsTheme } from '../../src/echarts-theme'
import { applyEchartsTheme, readVscodePalette } from './echarts-apply'
import { reRenderEcharts } from './echarts-retheme'
import { reRenderFlowchart } from './flowchart-retheme'
import {
  reRenderPlantuml,
  reRenderGraphviz,
  reRenderAbc,
} from './plantuml-retheme'
import {
  reRenderWavedrom,
  reRenderNomnoml,
  reRenderGeojson,
  reRenderTopojson,
  reRenderStl,
  reRenderVega,
  reRenderD2,
} from './custom-diagrams'
import { repairSmiles } from './smiles-render'

// Live re-theme of every diagram renderer after a theme/config flip (task 152 items
// 1+3). main.ts owns the per-init state (lastInitMsg) and the code-theme applier
// (also used at init), so it injects them here once via configureDiagramRetheme —
// read at CALL time through getters because lastInitMsg changes per re-init.
interface RethemeDeps {
  getOptions: () => VmarkdConfigOptions | undefined
  getCdn: () => string
  applyCodeTheme: (theme: 'dark' | 'light') => void
}
let deps: RethemeDeps = {
  getOptions: () => undefined,
  getCdn: () => '',
  applyCodeTheme: () => {},
}
export function configureDiagramRetheme(d: RethemeDeps): void {
  deps = d
}

/** Re-evaluate every smiles preview's palette after a theme flip. The new background CSS (and the
 *  content-theme `<link>`) settles asynchronously and outside #app, so schedule a few passes across
 *  the settle; repairSmiles is idempotent per bg-darkness, so the redundant calls are cheap no-ops. */
function reThemeSmiles(): void {
  const app = document.getElementById('app')
  if (!app) return
  requestAnimationFrame(() => repairSmiles(app))
  window.setTimeout(() => repairSmiles(app), 200)
  window.setTimeout(() => repairSmiles(app), 600)
}

/** Re-render a renderer that BAKES its colours from `getComputedStyle(...).color` at draw time, once
 *  the new theme's foreground actually LANDS. Such engines (flowchart.js, vega-embed) go stale on a
 *  live flip: the content-theme `<link>` applies asynchronously and can settle LATE (>400ms), so a
 *  fixed-delay re-render bakes the OLD colour (reported: vega axis numbers/ticks keep the previous
 *  theme's colour until the file is reopened). POLL the foreground (probe = a rendered block whose
 *  computed colour mirrors what the renderer reads) for ~2s and re-render only when it CHANGES —
 *  cheap (a couple of re-renders at most), and the LAST one uses the settled colour. `reRender`
 *  re-parses from source, so with no such block in the doc it's a no-op. */
function reThemeOnForegroundChange(
  probeSelector: string,
  reRender: (root?: HTMLElement) => void,
): void {
  let lastFg = ''
  let ticks = 0
  const tick = () => {
    ticks++
    const editorEl = activeModeElement(window.vditor) ?? undefined
    const probe = editorEl?.querySelector(probeSelector) as HTMLElement | null
    const fg = probe ? getComputedStyle(probe).color : ''
    if (fg && fg !== lastFg) {
      lastFg = fg
      reRender(editorEl)
    }
    if (ticks < 14) window.setTimeout(tick, 150) // watch for a late content-theme settle (~2s)
  }
  requestAnimationFrame(tick)
}

function reThemeFlowchart(): void {
  reThemeOnForegroundChange(
    '.vditor-ir__preview .language-flowchart, .vditor-wysiwyg__preview .language-flowchart',
    (root) => reRenderFlowchart(window, root),
  )
}

/** Vega/Vega-Lite bake axis/label/legend/title colours from `getComputedStyle(wrapper).color` at
 *  render time — same late-settle trap as flowchart, so poll the foreground rather than re-rendering
 *  on a fixed delay (which left the axis numbers in the old theme's colour until reopen). */
function reThemeVega(): void {
  reThemeOnForegroundChange(
    '.vditor-ir__preview .language-vega, .vditor-wysiwyg__preview .language-vega,' +
      '.vditor-ir__preview .language-vega-lite, .vditor-wysiwyg__preview .language-vega-lite',
    reRenderVega,
  )
}

/** Re-render the baked/currentColor SVG renderers after a theme flip — deferred (rAF + 400ms) so the
 *  content-theme `<link>` and the `vditor--dark` class have settled before the re-render reads colours.
 *  `mono` covers plantuml/graphviz/abc/wavedrom/nomnoml/stl; `geo` (geojson/topojson) is SEPARATE so
 *  changing only the `theme.geoBasemap` setting re-renders the maps without touching the rest of the
 *  group (a content flip sets both → still a single geojson re-render via the `mono || geo` gate); `d2`
 *  is SEPARATE so the single authority (rethemeDiagrams) decides D2's grouping once — D2 can re-render
 *  for a layout/theme change with no content flip, where the mono group must NOT re-render. */
// 185/2a: the mono/geo group MEMBERSHIP comes from the engine registry; only the per-engine
// re-render functions live here. Vega is deliberately NOT in the mono map even though it bakes
// colours — it re-themes via reThemeVega() (foreground polling): its axis/label colours come
// from getComputedStyle, which settles too late for this fixed 400ms delay (the old colour stuck).
const MONO_RERENDER: Record<
  string,
  (el: HTMLElement | undefined, cdn: string) => void
> = {
  plantuml: (el, cdn) => reRenderPlantuml(el, cdn),
  graphviz: (el, cdn) => reRenderGraphviz(el, cdn),
  abc: (el, cdn) => reRenderAbc(el, cdn),
  wavedrom: (el) => reRenderWavedrom(el),
  nomnoml: (el) => reRenderNomnoml(el),
  stl: (el) => reRenderStl(el),
}
const GEO_RERENDER: Record<string, (el: HTMLElement | undefined) => void> = {
  geojson: (el) => reRenderGeojson(el),
  topojson: (el) => reRenderTopojson(el),
}
const MONO_LANGS = engineLangs((e) => e.retheme === 'mono')
const GEO_LANGS = engineLangs((e) => e.retheme === 'geo')
// A registry engine tagged mono/geo with no re-render fn here is a wiring bug — fail loud at
// module init (any unit test importing this module catches it), same philosophy as the
// build-time patch asserts.
for (const lang of [...MONO_LANGS, ...GEO_LANGS]) {
  if (!MONO_RERENDER[lang] && !GEO_RERENDER[lang]) {
    throw new Error(
      `diagram-retheme: registry engine '${lang}' is tagged mono/geo but has no re-render fn`,
    )
  }
}

function reThemeMonochromeGroup(opts: {
  mono: boolean
  geo: boolean
  d2: boolean
}): void {
  if (!opts.mono && !opts.geo && !opts.d2) return
  const cdn = deps.getCdn()
  const run = () => {
    const el = activeModeElement(window.vditor) ?? undefined
    if (opts.mono) for (const lang of MONO_LANGS) MONO_RERENDER[lang]?.(el, cdn)
    // geojson/topojson: a content flip re-themes the geometry colour AND flips the `auto` basemap
    // light/dark; a geoBasemap setting change swaps the tile source. One re-render covers both.
    if (opts.mono || opts.geo)
      for (const lang of GEO_LANGS) GEO_RERENDER[lang]?.(el)
    // D2 SVG bakes currentColor, so a flip needs a re-render. It rides the same deferral.
    if (opts.d2) reRenderD2(el ?? undefined)
  }
  requestAnimationFrame(run)
  window.setTimeout(run, 400)
}

/** THE single re-theme authority (task 152 item 3). Both theme-flip sites route through this:
 *  handleSetTheme passes everything (a mode flip re-themes all), handleConfigChanged passes the
 *  changed-flag subset. D2's grouping lives ONLY here — it fires once when the mono SVG group
 *  re-themes (content flip) OR its own layout/theme changed, so the two sites can no longer
 *  double-render D2 or drift. `theme` is the effective light/dark mode the renderers paint with. */
export function rethemeDiagrams(f: {
  theme: 'dark' | 'light'
  code: boolean
  mermaid: boolean
  echarts: boolean
  smiles: boolean
  flowchart: boolean
  vega: boolean
  monoGroup: boolean
  geo: boolean
  d2: boolean
}): void {
  const el = activeModeElement(window.vditor) ?? undefined
  const cdn = deps.getCdn()
  const options = deps.getOptions()
  // Code-block + content theme: swap the hljs stylesheet + UI mode (no re-init, keeps cursor).
  if (f.code) deps.applyCodeTheme(f.theme)
  // Mermaid/ECharts paint once → apply the theme wrapper + offscreen re-render (tasks 59/86/90).
  if (f.mermaid) {
    applyMermaidTheme(
      window,
      resolveMermaidInit(options?.mermaidTheme, options?.contentTheme, f.theme),
    )
    reRenderMermaid(el, cdn, f.theme)
  }
  if (f.echarts) {
    applyEchartsTheme(
      window,
      resolveEchartsTheme(
        options?.echartsTheme,
        options?.contentTheme,
        f.theme,
        readVscodePalette(window),
      ),
    )
    reRenderEcharts(window, el, f.theme)
  }
  // flowchart.js + vega bake their foreground from getComputedStyle → poll the settled colour.
  if (f.flowchart) reThemeFlowchart()
  if (f.vega) reThemeVega()
  // Baked/currentColor SVG group + geojson/topojson + D2 (deferred); D2 deduped to a single fire here.
  reThemeMonochromeGroup({ mono: f.monoGroup, geo: f.geo, d2: f.d2 })
  // SMILES follows the page-background luminance — a flip changes it outside #app, so re-run explicitly.
  if (f.smiles) reThemeSmiles()
}
