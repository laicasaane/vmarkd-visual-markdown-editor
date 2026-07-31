// Vega / Vega-Lite — task 409, split out of custom-diagrams.ts's god-module into its own engine
// file. Both languages share ONE render path (renderVegaBlock) and one reset call (task 400: a
// vega-lite block carries `data-vega-error`, not `data-vega-lite-error` — see reRenderVega).
import {
  renderDiagramError,
  renderDiagramLoadError,
} from '../../diagram-kit/diagram-error'
import {
  findBlocks,
  getCdn,
  resetCustomBlocks,
} from '../../diagram-kit/diagram-dom'
import { getD2Config } from '../../diagram-kit/d2-config'
import { loadScript } from '../../util/load-script'
import { faithfulRender } from '../faithful-render'

declare const window: Window & {
  vegaEmbed?: (el: HTMLElement, spec: any, opts?: any) => Promise<any>
}

// Strip remote data sources for offline rendering + security. Vega/Vega-Lite load external data via a
// `url` on a `data` object — at the top level, inside `data: [...]` arrays, or nested in layers /
// transforms / lookups. Only inline `data.values` works offline, and a remote fetch is a tracking /
// exfiltration channel (same policy as image.allowRemoteImages). CSP already blocks the request; this
// recursively deletes EVERY `url` so no spec even ATTEMPTS a fetch (no failed-fetch error; defense in
// depth). Mutates in place — the caller passes a freshly JSON.parsed spec — and returns it for chaining.
// `$schema` (its key isn't `url`) and inline `values` are untouched.
export function stripRemoteData<T>(spec: T): T {
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const item of v) walk(item)
    } else if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>
      if (typeof obj.url === 'string') delete obj.url
      for (const k of Object.keys(obj)) walk(obj[k])
    }
  }
  walk(spec)
  return spec
}

// Task 424 (reprise, 2026-07-28) — the user compared echarts' material-dark salmon against
// vega/vega-lite's own hardcoded default mark colour (`#4c78a8`, vega-lite's stock blue) and
// asked for the same salmon on vega too, so the two chart engines read as one family on this
// theme. Keyed separately from the shared mermaid/d2/plantuml palette (`pairedPalette` would
// resolve material-dark to one-dark's purple accent, `#c678dd` — the direction task 424 tried
// for echarts and the user rejected) because the ask here is specifically "match echarts",
// not "match the line-art diagrams".
const VEGA_MARK_COLOR: Record<string, string> = {
  'material-dark': '#d87c7c', // ECharts' vintage-gallery salmon (src/echarts-gallery.ts)
}

// Default fill/stroke for a mark with no colour encoding of its own, covering BOTH dialects.
// Vega-Lite honours a generic `config.mark.color` fallback; raw Vega does NOT (verified: setting
// only `mark.fill` left a plain `rect` mark at vega's own default `#4c78a8`) — it reads
// `config.<marktype>.fill`/`.stroke` per mark type instead, so each is set explicitly. `line`/
// `rule`/`trail` use `stroke` (open marks); the rest use `fill` (filled marks).
function markColorConfig(
  markColor: string | undefined,
): Record<string, unknown> {
  if (!markColor) return {}
  const fill = { fill: markColor }
  return {
    mark: { color: markColor },
    arc: fill,
    area: fill,
    path: fill,
    rect: fill,
    shape: fill,
    symbol: fill,
    text: fill,
    line: { stroke: markColor },
    rule: { stroke: markColor },
    trail: fill,
  }
}

// The vega/vega-lite render config — one definition for both engines, and the seam the unit test
// pins. Everything here is a DEFAULT: vega-embed merges the chart's own spec on top, so an author
// who sets e.g. `axis.labelPadding` in their spec, or an explicit mark colour, still wins.
export function vegaRenderConfig(
  fg: string,
  markColor?: string,
): Record<string, unknown> {
  return {
    background: 'transparent',
    axis: {
      labelColor: fg,
      titleColor: fg,
      tickColor: fg,
      domainColor: fg,
      gridColor: fg,
      gridOpacity: 0.15,
      // Task 380 — vega's default of 2 leaves the tick touching the top of the glyph with no gap at
      // all (measured: tick ends on row 216, the "A" starts on 217). 4 puts 2px of air between them.
      // Deliberately not more: at 8 the label stops reading as belonging to its own tick.
      labelPadding: 4,
    },
    legend: { labelColor: fg, titleColor: fg },
    title: { color: fg },
    view: { stroke: 'transparent' },
    ...markColorConfig(markColor),
  }
}

function renderVegaBlock(
  blocks: { wrapper: HTMLElement; code: string }[],
): void {
  const ve = window.vegaEmbed
  if (!ve) {
    renderDiagramLoadError(blocks, 'vega', 'Vega')
    return
  }

  const markColor = VEGA_MARK_COLOR[getD2Config().contentTheme ?? '']
  blocks.forEach(({ wrapper, code }) => {
    const fg = getComputedStyle(wrapper).color || '#333'
    // On a JSON parse error OR a failed embed the onError callback shows the shared themed error box
    // (task 178; was: source cleared first, so a bad spec blanked the block).
    void faithfulRender(
      wrapper,
      'vega',
      async (stage) => {
        // Offline/security: only inline data.values renders; stripRemoteData recursively removes any
        // remote `url` (top-level, data arrays, nested layers/transforms) so nothing fetches.
        const spec = stripRemoteData(JSON.parse(code))
        const div = document.createElement('div')
        stage.appendChild(div)
        await ve(div, spec, {
          renderer: 'svg',
          actions: false,
          config: vegaRenderConfig(fg, markColor),
        })
      },
      (w, err) => renderDiagramError(w, 'vega', err),
    )
  })
}

export function renderVega(root?: ParentNode): void {
  const container = root ?? document
  const blocks = findBlocks(container, 'vega')
  if (!blocks.length) return

  const cdn = getCdn()
  loadScript(`${cdn}/dist/js/vega/vega-embed.min.js`, 'vditorVegaScript').then(
    () => {
      renderVegaBlock(blocks)
    },
  )
}

export function renderVegaLite(root?: ParentNode): void {
  const container = root ?? document
  const blocks = findBlocks(container, 'vega-lite')
  if (!blocks.length) return

  const cdn = getCdn()
  loadScript(`${cdn}/dist/js/vega/vega-embed.min.js`, 'vditorVegaScript').then(
    () => {
      renderVegaBlock(blocks)
    },
  )
}

export function reRenderVega(root?: ParentNode): void {
  const container = root ?? document
  // renderVegaBlock (shared by renderVega + renderVegaLite) always calls faithfulRender with the
  // literal 'vega', so vega-lite blocks carry `data-vega-error` too — pass it explicitly, not
  // `data-vega-lite-error`.
  resetCustomBlocks(container, ['vega', 'vega-lite'], 'data-vega-error')
  renderVega(container)
  renderVegaLite(container)
}
