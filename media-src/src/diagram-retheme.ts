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
  CUSTOM_DIAGRAM_ADAPTERS,
  reRenderD2,
  reRenderVega,
} from './custom-diagrams'
import { repairSmiles } from './smiles-render'
import { rethemeCacheFirst } from './render-cache-client'

/**
 * Task 436 — every re-render below goes through here: ask the render cache first, and only run the
 * live engine for what the cache did NOT take over. `rethemeCacheFirst` returns false when there is
 * nothing to reserve or the cache client isn't installed, which is what keeps this a no-op change
 * for the engines it can't serve (geojson/topojson are `cacheable: false` — a live Leaflet map, not
 * an SVG) and in unit tests that never install it.
 *
 * The blocks it reserves keep their existing `data-processed`, so the live fallback CANNOT run
 * concurrently with a pending lookup: either the cache owns them (hit → painted, miss → un-reserved
 * and re-fired at the engine) or we never handed them over and re-render right here.
 */
function cacheFirstThen(
  root: ParentNode | undefined,
  lang: string,
  live: () => void,
): void {
  if (!rethemeCacheFirst(root ?? document, [lang])) live()
}

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
 *  computed colour mirrors what the renderer reads) for ~2s.
 *
 *  DEBOUNCED to the SETTLED colour, not fired on every intermediate value. The foreground crosses
 *  MORE THAN ONE value during the settle (the `vditor--dark` class flips first, then the content-theme
 *  `<link>` lands later), and the old code re-rendered on EACH — "cheap, the last one wins". That was
 *  fine for the light mono SVGs but re-runs the EXPENSIVE mono engines (plantuml re-preprocesses its
 *  ~2000-line stdlib per block, ~2-5s each) once PER intermediate step: measured `calls:2`,
 *  `panesReRendered:26` for 13 plantuml blocks on one workbench flip (~57s of spinner). Coalescing to
 *  a single re-render on the stable colour halves that and removes the wasted intermediate pass. A
 *  genuinely late second settle (rare) still re-fires, so correctness (final render uses the settled
 *  colour) is unchanged. `reRender` re-parses from source, so with no such block in the doc it's a no-op. */
function reThemeOnForegroundChange(
  probeSelector: string,
  reRender: (root?: HTMLElement) => void,
): void {
  let lastRenderedFg = ''
  let pendingFg = ''
  let settleTimer = 0
  let ticks = 0
  const fire = () => {
    if (pendingFg && pendingFg !== lastRenderedFg) {
      lastRenderedFg = pendingFg
      reRender(activeModeElement(window.vditor) ?? undefined)
    }
  }
  const tick = () => {
    ticks++
    const editorEl = activeModeElement(window.vditor) ?? undefined
    const probe = editorEl?.querySelector(probeSelector) as HTMLElement | null
    const fg = probe ? getComputedStyle(probe).color : ''
    // Each new foreground value RESTARTS the settle timer; the re-render only runs once the colour
    // has held steady for 250ms, so the intermediate values during the flip coalesce into one pass.
    if (fg && fg !== pendingFg) {
      pendingFg = fg
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(fire, 250)
    }
    if (ticks < 14) {
      window.setTimeout(tick, 150) // watch for a late content-theme settle (~2s)
    } else {
      // End of the poll window — GUARANTEE the settled colour was actually drawn. Without this the
      // debounce can, on some settle timings, never fire (a colour that never held steady for 250ms
      // within the window), leaving the diagram in the OLD theme's baked colour. `fire` is a no-op if
      // the debounce already drew this colour, so this only covers the miss.
      window.clearTimeout(settleTimer)
      fire()
    }
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
    // Cache-first per lang (task 436). `reRenderVega` re-renders BOTH dialects in one call, so the
    // fallback is only run when neither was taken over — a partial take-over (one dialect cached,
    // the other not) is already handled by the miss path re-firing the engine for the un-reserved
    // blocks alone, and calling reRenderVega again here would clear the cached one too.
    (root) => {
      const taken = ['vega', 'vega-lite'].filter((l) =>
        rethemeCacheFirst(root ?? document, [l]),
      )
      if (!taken.length) reRenderVega(root)
    },
  )
}

/** Re-render the baked/currentColor SVG renderers after a theme flip — deferred (rAF + 400ms) so the
 *  content-theme `<link>` and the `vditor--dark` class have settled before the re-render reads colours.
 *  `mono` covers plantuml/graphviz/abc/wavedrom/nomnoml/stl; `geo` (geojson/topojson) is SEPARATE so
 *  changing only the `theme.geoBasemap` setting re-renders the maps without touching the rest of the
 *  group (a content flip sets both → still a single geojson re-render via the `mono || geo` gate); `d2`
 *  is SEPARATE so the single authority (rethemeDiagrams) decides D2's grouping once — D2 can re-render
 *  for a layout/theme change with no content flip, where the mono group must NOT re-render. */
// 185/2a: the mono/geo group MEMBERSHIP comes from the engine registry. Vega is deliberately NOT in
// the mono map even though it bakes colours — it re-themes via reThemeVega() (foreground polling):
// its axis/label colours come from getComputedStyle, which settles too late for this fixed 400ms
// delay (the old colour stuck).
//
// This map now covers ONLY the native-family mono engines (plantuml/graphviz/abc). wavedrom/nomnoml
// (mono) and geojson/topojson (geo) are `family: 'custom'` and used to have a SECOND row here (+ a
// separate GEO_RERENDER map) duplicating CUSTOM_DIAGRAM_ADAPTERS' reRender — task 404 phase 2
// removes that duplication: monoOrGeoRerender() below falls through to the shared adapter map for
// any mono/geo lang this native map doesn't cover.
const MONO_RERENDER: Record<
  string,
  (el: HTMLElement | undefined, cdn: string) => void
> = {
  plantuml: (el, cdn) => reRenderPlantuml(el, cdn),
  graphviz: (el, cdn) => reRenderGraphviz(el, cdn),
  abc: (el, cdn) => reRenderAbc(el, cdn),
  // stl dropped (task 164 §4): its material is theme-independent, so a flip re-render is pure
  // waste (two full three.js/WebGL rebuilds per block). Registry retheme is now 'none' → stl no
  // longer appears in MONO_LANGS, so the fail-loud check below stays satisfied.
}
const MONO_LANGS = engineLangs((e) => e.retheme === 'mono')
const GEO_LANGS = engineLangs((e) => e.retheme === 'geo')

// Task 404 phase 2 — the single dispatch point for every mono/geo engine's re-render: the native
// map above first, else the shared CUSTOM_DIAGRAM_ADAPTERS map (wavedrom/nomnoml/geojson/topojson
// today). `cdn` is ignored by the custom-diagram adapters (only the native engines need it) —
// accepting it here keeps ONE call signature for the reThemeMono/reThemeGeoAndD2 loops below
// instead of branching per lang at every call site. Exported for the unit test (and so a future
// engine that forgets BOTH maps fails a test, not just the module-init throw below).
export function monoOrGeoRerender(
  lang: string,
): ((el: HTMLElement | undefined, cdn: string) => void) | undefined {
  const native = MONO_RERENDER[lang]
  if (native) return native
  const adapter = CUSTOM_DIAGRAM_ADAPTERS[lang]
  return adapter ? (el) => adapter.reRender(el) : undefined
}

// A registry engine tagged mono/geo with no re-render fn (native or adapter) is a wiring bug —
// fail loud at module init (any unit test importing this module catches it), same philosophy as
// the build-time patch asserts.
for (const lang of [...MONO_LANGS, ...GEO_LANGS]) {
  if (!monoOrGeoRerender(lang)) {
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
    // wavedrom/nomnoml are cacheable customs and go through the cache first (task 436); the native
    // members of this group (plantuml/graphviz/abc) are `cacheable: false` here — their re-render is
    // not a findBlocks div — so rethemeCacheFirst finds nothing for them and they fall straight
    // through to the live path, unchanged.
    for (const lang of MONO_LANGS)
      cacheFirstThen(root, lang, () => monoOrGeoRerender(lang)?.(root, cdn))
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
    const cdn = deps.getCdn()
    // geojson/topojson: a content flip re-themes the geometry colour AND flips the `auto` basemap
    // light/dark; a geoBasemap setting change swaps the tile source. One re-render covers both.
    if (opts.geo)
      for (const lang of GEO_LANGS) monoOrGeoRerender(lang)?.(el, cdn)
    // D2 SVG bakes currentColor, so a flip needs a re-render. It rides the same deferral — and is
    // the engine task 436 exists for: a full WASM compile + layout (~365 ms) per diagram is by far
    // the most expensive thing a flip triggers, so it is the one most worth serving from cache.
    if (opts.d2) cacheFirstThen(el, 'd2', () => reRenderD2(el ?? undefined))
  }
  // ONE deferred fire (task 411). This used to be `requestAnimationFrame(run)` AND
  // `window.setTimeout(run, 400)`, both unconditional: every flip re-parsed and re-rendered each
  // D2/geo block TWICE, i.e. two D2 WASM compiles + layouts (~365 ms each, measured) and two tile
  // fetches per map. The rAF leg was not merely redundant, it was the WRONG render: it lands
  // ~16 ms in, BEFORE the content-theme `<link>` settles (the very reason this group is deferred
  // 400 ms — see reThemeMono's poll), so it painted the stale palette and was then overwritten by
  // the leg that survives today. Dropping it changes nothing visible; it removes a discarded render.
  // NOTE this group is still UNGATED by design — unlike every other group it has no change-gate,
  // because a `geoBasemap`/`d2Layout`/`d2Theme` change must re-render without moving the editor
  // foreground a poll could see (task 164 §3). "Fires once" is not "fires only when something moved".
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
