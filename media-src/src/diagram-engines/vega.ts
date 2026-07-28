// Vega / Vega-Lite — task 409, split out of custom-diagrams.ts's god-module into its own engine
// file. Both languages share ONE render path (renderVegaBlock) and one reset call (task 400: a
// vega-lite block carries `data-vega-error`, not `data-vega-lite-error` — see reRenderVega).
import { renderDiagramError } from '../diagram-error'
import { findBlocks, getCdn, resetCustomBlocks } from '../diagram-dom'
import { loadScript } from '../load-script'
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

// The vega/vega-lite render config — one definition for both engines, and the seam the unit test
// pins. Everything here is a DEFAULT: vega-embed merges the chart's own spec on top, so an author
// who sets e.g. `axis.labelPadding` in their spec still wins.
export function vegaRenderConfig(fg: string): Record<string, unknown> {
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
  }
}

function renderVegaBlock(
  blocks: { wrapper: HTMLElement; code: string }[],
): void {
  const ve = window.vegaEmbed
  if (!ve) return

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
          config: vegaRenderConfig(fg),
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
