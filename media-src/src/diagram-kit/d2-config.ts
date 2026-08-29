// Typed owner for the D2 render-config globals (task 152 item 5), mirroring
// echarts-apply / mermaid-theme. main.ts (init + theme flip) SETS these; renderD2 /
// reRenderD2 (custom-diagrams.ts) READ them. Replaces the raw, untyped
// `(window as any).__vmde*` channel with one typed get/set so a key rename is a
// compile error and there's a single documented owner.
//
// `mode` + `contentTheme` are the editor's light/dark + content theme — only the
// D2 'auto' theme pairs to them, but they're the diagram-theme inputs renderD2
// reads, so they live here too. `geoBasemap` (the `diagram.geo.basemap` setting) is a
// geojson/topojson render input read by initLeafletMap alongside `mode`, so it lives
// here too. (`__vmdeAllowRemoteImages` is the CSP/security gate and stays separate.)
interface D2ConfigWindow {
  __vmdeD2Layout?: string
  __vmdeD2Theme?: string
  __vmdeD2Sketch?: boolean
  __vmdeContentTheme?: string
  __vmdeMode?: 'dark' | 'light'
  __vmdeGeoBasemap?: string
}

export interface D2Config {
  layout?: string
  theme?: string
  sketch?: boolean // hand-drawn emit (task 120, vmde.diagram.d2.sketch)
  contentTheme?: string
  mode?: 'dark' | 'light'
  geoBasemap?: string
}

const win = (): D2ConfigWindow => window as unknown as D2ConfigWindow

// Patch only the provided keys (each write site sets a different subset).
export function setD2Config(patch: Partial<D2Config>): void {
  const g = win()
  if ('layout' in patch) g.__vmdeD2Layout = patch.layout
  if ('theme' in patch) g.__vmdeD2Theme = patch.theme
  if ('sketch' in patch) g.__vmdeD2Sketch = patch.sketch
  if ('contentTheme' in patch) g.__vmdeContentTheme = patch.contentTheme
  if ('mode' in patch) g.__vmdeMode = patch.mode
  if ('geoBasemap' in patch) g.__vmdeGeoBasemap = patch.geoBasemap
}

// The projection from a host message's `options` onto this config — the ONE place that knows which
// setting feeds which D2/geo key. Both write sites (initVditor and the config-changed handler in
// message-router) used to spell this mapping out themselves, so every new option (sketch, then
// geoBasemap) had two edit sites and missing one left the live config stale while init was right.
// `mode` is deliberately NOT here: init always derives it from the payload's theme, while a config
// change carries one only when the content theme pins a new light/dark — two different rules.
export function d2ConfigFromOptions(options?: {
  d2Layout?: string
  d2Theme?: string
  d2Sketch?: boolean
  contentTheme?: string
  geoBasemap?: string
}): Partial<D2Config> {
  return {
    layout: options?.d2Layout,
    theme: options?.d2Theme,
    sketch: options?.d2Sketch,
    contentTheme: options?.contentTheme,
    geoBasemap: options?.geoBasemap,
  }
}

export function getD2Config(): D2Config {
  const g = win()
  return {
    layout: g.__vmdeD2Layout,
    theme: g.__vmdeD2Theme,
    sketch: g.__vmdeD2Sketch,
    contentTheme: g.__vmdeContentTheme,
    mode: g.__vmdeMode,
    geoBasemap: g.__vmdeGeoBasemap,
  }
}
