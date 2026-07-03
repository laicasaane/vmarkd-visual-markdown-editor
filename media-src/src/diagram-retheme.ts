import type { VmarkdConfigOptions } from '../../src/protocol'
import { engineLangs } from './engine-registry'
import { activeModeElement } from './source-map'
import {
  applyMermaidTheme,
  mermaidInitSignature,
  resolveMermaidInit,
} from './mermaid-theme'
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
  // stl dropped (task 164 §4): its material is theme-independent, so a flip re-render is pure
  // waste (two full three.js/WebGL rebuilds per block). Registry retheme is now 'none' → stl no
  // longer appears in MONO_LANGS, so the fail-loud check below stays satisfied.
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

/** Re-render the baked/currentColor SVG group (plantuml/graphviz/abc/wavedrom/nomnoml) after a flip
 *  by POLLING the settled foreground — like flowchart/vega (task 164 §3). Replaces the old
 *  unconditional rAF + setTimeout(400) DOUBLE fire, which re-parsed + re-rendered every block TWICE
 *  per flip (incl. the TeaVM/viz.js WASM). `monoGroup` is only ever set on a VS Code flip or a
 *  content-theme switch — both move the foreground — so the poll always fires at least once, and the
 *  final one uses the settled colour (the content-theme `<link>` lands late). The re-render is now
 *  change-gated: no extra fire when the colour didn't actually move. */
function reThemeMono(): void {
  const probe = MONO_LANGS.flatMap((l) => [
    `.vditor-ir__preview .language-${l}`,
    `.vditor-wysiwyg__preview .language-${l}`,
  ]).join(',')
  reThemeOnForegroundChange(probe, (root) => {
    const cdn = deps.getCdn()
    for (const lang of MONO_LANGS) MONO_RERENDER[lang]?.(root, cdn)
  })
}

/** geojson/topojson (Leaflet) + D2 re-render on a DEFERRED rAF + 400ms — deliberately NOT the
 *  foreground poll (task 164 §3 caveat): geo must also re-render on a `geoBasemap`-only setting
 *  change and D2 on a `d2Layout`/`d2Theme` change, neither of which moves the editor foreground, so a
 *  poll would miss them. The mono group split off to reThemeMono(). */
function reThemeGeoAndD2(opts: { geo: boolean; d2: boolean }): void {
  if (!opts.geo && !opts.d2) return
  const run = () => {
    const el = activeModeElement(window.vditor) ?? undefined
    // geojson/topojson: a content flip re-themes the geometry colour AND flips the `auto` basemap
    // light/dark; a geoBasemap setting change swaps the tile source. One re-render covers both.
    if (opts.geo) for (const lang of GEO_LANGS) GEO_RERENDER[lang]?.(el)
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
  const win = window as any
  // Code-block + content theme: swap the hljs stylesheet + UI mode (no re-init, keeps cursor).
  if (f.code) deps.applyCodeTheme(f.theme)
  // Mermaid/ECharts paint once → apply the theme wrapper + offscreen re-render (tasks 59/86/90).
  if (f.mermaid) {
    const init = resolveMermaidInit(
      options?.mermaidTheme,
      options?.contentTheme,
      f.theme,
    )
    applyMermaidTheme(window, init)
    // Skip the (full re-parse + dagre relayout) re-render when the resolved init is unchanged: a
    // paired/explicit palette is mode-independent, so a flip yields a byte-identical SVG (task 164
    // §1). The signature folds the mode in ONLY for the auto (init===null) branch. applyMermaidTheme
    // above always runs (keeps the wrapper live); only reRenderMermaid is gated. First flip (no
    // stored sig) always renders.
    // Fold the layout (dagre|elk, task 112) into the signature: a layout flip changes the SVG geometry
    // but not the theme, so it must bust the skip-gate too. The re-render itself needs no special ELK
    // setup — reRenderMermaid re-runs mermaid offscreen, and mermaid AWAITS the (synchronously registered)
    // ELK loader, which lazy-loads the adapter on demand; the offscreen poll waits it out.
    const layout = win.__vmarkdMermaidLayout === 'elk' ? 'elk' : 'dagre'
    const sig = mermaidInitSignature(init, f.theme, layout)
    if (win.__vmarkdLastMermaidSig !== sig) {
      reRenderMermaid(el, cdn, f.theme)
      win.__vmarkdLastMermaidSig = sig
    }
  }
  if (f.echarts) {
    const spec = resolveEchartsTheme(
      options?.echartsTheme,
      options?.contentTheme,
      f.theme,
      readVscodePalette(window),
    )
    applyEchartsTheme(window, spec)
    // Skip dispose+reinit (every chart in every pane) + the forced mindmap rebuild when the resolved
    // spec is unchanged (task 164 §2). Sign the FULL spec — the auto case differs only inside
    // theme.backgroundColor/series, so signing `name` alone would wrongly skip and leave charts
    // stale. applyEchartsTheme already ran (cheap registerTheme + resolver reinstall); only
    // reRenderEcharts is gated. First flip always renders; observeMindmaps still handles real resizes.
    const sig = JSON.stringify(spec)
    if (win.__vmarkdLastEchartsSig !== sig) {
      reRenderEcharts(window, el, f.theme)
      win.__vmarkdLastEchartsSig = sig
    }
  }
  // flowchart.js + vega bake their foreground from getComputedStyle → poll the settled colour.
  if (f.flowchart) reThemeFlowchart()
  if (f.vega) reThemeVega()
  // Monochrome/palette-baked SVG group: poll the foreground (change-gated, once per flip) — task 164 §3.
  if (f.monoGroup) reThemeMono()
  // geojson/topojson + D2 ride a deferred rAF+400 (they re-render on settings that don't move the fg).
  reThemeGeoAndD2({ geo: f.geo, d2: f.d2 })
  // SMILES follows the page-background luminance — a flip changes it outside #app, so re-run explicitly.
  if (f.smiles) reThemeSmiles()
}
