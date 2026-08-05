// Lazy loader for the vendored compile-only D2 WASM. Boots the TinyGo runtime once,
// caches the global window.d2compile, and exposes compileD2(src) -> graph object.
//
// The wasm is built with TinyGo (~6x smaller than stock Go); we ship TinyGo's wasm_exec.js.
// Its `Go` class is API-compatible with Go's (new Go() / go.importObject / go.run(instance)) and
// registers window.d2compile the same way, so this boot needs NO TinyGo-specific changes (verified
// rendering in headless chromium via the d2-render-harness). See media-src/vendor/d2/build/.
//
// CSP: instantiation goes through WebAssembly.instantiate, authorized by script-src 'unsafe-eval'
// (already shipped — the stock-Go wasm booted under the same CSP). If a future wasm fails to boot,
// add 'wasm-unsafe-eval' to html-builder.ts (the vmarkd-renderer-theming skill flags this).
//
// This module OWNS the D2Graph contract: the Go entrypoint (media-src/vendor/d2/build/main.go)
// emits JSON that MUST match this interface — keep them in sync (verified by d2-wasm.test.ts).

import { loadScript } from '../../util/load-script'
import { logToHost } from '../../util/webview-log'

// The (Tiny)Go wasm_exec runtime handle + the synchronous compile entrypoint it registers.
// Typed so the window-global boundary is narrowed immediately on read (task 151 item 5).
interface GoRuntime {
  importObject: WebAssembly.Imports
  run(instance: WebAssembly.Instance): void
}
// d2compile returns EITHER an error string OR a JSON `graph` string (parsed to D2Graph).
interface D2CompileResult {
  error?: string
  graph?: string
}
type D2CompileFn = (src: string) => D2CompileResult
declare const window: Window & {
  Go?: new () => GoRuntime
  d2compile?: D2CompileFn
}

interface D2Column {
  name: string
  type?: string
  constraint?: string
}
interface D2Member {
  name: string
  type?: string // field type / method return
  visibility?: string
}
// Compact visual style for a NESTED style — currently only a shape's decorative iconStyle
// (task 159 → task 134/135). Shape/edge styles are flattened onto D2Shape/D2Edge directly (the
// pre-existing contract); this mirrors main.go's outStyle. Text props excluded (an icon isn't text).
interface D2Style {
  fill?: string
  stroke?: string
  strokeWidth?: string
  strokeDash?: string
  opacity?: string
  borderRadius?: string
  fillPattern?: string
  shadow?: boolean
  multiple?: boolean
  threeD?: boolean
  doubleBorder?: boolean
}
export interface D2Shape {
  id: string
  idVal: string
  label: string
  shape: string
  container?: string
  fill?: string
  stroke?: string
  strokeWidth?: string
  strokeDash?: string
  opacity?: string
  fontColor?: string
  borderRadius?: string
  bold?: boolean
  italic?: boolean
  // Shape effects + text styling (task 159 export batch → consumers 121/129). Exported by the WASM
  // but NOT yet consumed by d2-render.ts (the render lands in the per-feature consumer tasks).
  fillPattern?: string // dots|lines|grain|paper (task 121)
  shadow?: boolean // task 121
  threeD?: boolean // style `3d` (task 121)
  multiple?: boolean // task 121
  doubleBorder?: boolean // task 121
  animated?: boolean // animated on a SHAPE (edges already had it; task 121/135)
  font?: string // task 129
  fontSize?: string // task 129
  underline?: boolean // task 129
  textTransform?: string // uppercase|lowercase|capitalize|none (task 129)
  // Block-string language (task 154): "markdown" for |md| text shapes; code langs / "latex"
  // pass through. Drives the md→foreignObject render below.
  language?: string
  // --- JS-side enrichment (task 154) — NOT emitted by the WASM. custom-diagrams.renderD2
  // attaches these to text shapes with language==='markdown' BEFORE layout: mdHtml is the
  // Lute-rendered HTML of the label, mdSize its offscreen-measured content box. d2-render
  // then sizes the node from mdSize and embeds mdHtml in a <foreignObject> instead of a
  // flat <text>. Absent (e.g. Lute unavailable) → the pre-154 plain-text render.
  mdHtml?: string
  mdSize?: { w: number; h: number }
  // Interaction + media (task 124 #3/#5). tooltip → <title>; link → clickable <a>; icon = image URL
  // (the picture for shape:image, or a decorative icon on any other shape).
  tooltip?: string
  link?: string
  icon?: string
  direction?: string // per-container layout direction up|down|left|right (task 127)
  // Explicit dimensions + absolute pin (task 159 → task 130). Raw d2 scalar px strings.
  width?: string
  height?: string
  top?: string
  left?: string
  // Label / icon / tooltip placement keyword from `label.near` etc (task 159 → task 134); the
  // d2-resolved position (e.g. outside-top-left). Absent when the source set none.
  labelPosition?: string
  iconPosition?: string
  tooltipPosition?: string
  iconStyle?: D2Style // decorative-icon style from icon.style.* (task 159 → task 134/135)
  columns?: D2Column[] // sql_table
  fields?: D2Member[] // class fields
  methods?: D2Member[] // class methods
  special: {
    isSequence: boolean
    isGrid: boolean
    gridRows?: string
    gridColumns?: string
    nearKey?: string
    // Grid spacing (task 159 → task 135). Raw d2 scalar px strings; absent = grid default.
    gridGap?: string
    verticalGap?: string
    horizontalGap?: string
  }
}
// One end of an edge's arrowhead: the d2-resolved shape string + optional cardinality/role
// label (task 128). Absent when the source didn't customise that end (fall back to the
// srcArrow/dstArrow boolean → default triangle / none).
interface D2Arrowhead {
  shape: string // triangle | arrow | diamond | filled-diamond | circle | cf-many | … | none
  label?: string
}
export interface D2Edge {
  src: string
  dst: string
  label?: string
  srcArrow: boolean
  dstArrow: boolean
  // Connection style (task 124 #1); absent fields → the renderer keeps the theme default.
  stroke?: string
  strokeWidth?: string
  strokeDash?: string
  opacity?: string
  animated?: boolean
  // Connection corner rounding from e.Style.BorderRadius (task 159 → task 135); rounds the routed
  // path's bends. Absent = default.
  borderRadius?: string
  // Connection LABEL text styling from e.Style (task 159 → task 129). Distinct from the line
  // stroke above: these style the edge's label text. Absent/false = the theme default.
  fontColor?: string
  fontSize?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  srcArrowhead?: D2Arrowhead // task 128
  dstArrowhead?: D2Arrowhead // task 128
  // Column-row endpoints for sql_table FK edges (task 133); d2 computes these at compile time.
  // When set, the edge attaches to that column's row of the table node (a port), not the node box.
  srcColumnIndex?: number
  dstColumnIndex?: number
}
// Source-level `vars.d2-config` (task 159 → task 132) — the compile-side diagram config. Scalar
// fields only (theme-overrides + data are omitted Go-side); absent when the source sets none.
interface D2Config {
  sketch?: boolean
  themeID?: number
  darkThemeID?: number
  pad?: number
  center?: boolean
  layoutEngine?: string
}
export interface D2Graph {
  shapes: D2Shape[]
  edges: D2Edge[]
  // A top-level `shape: sequence_diagram` lives on the ROOT object (not in shapes), so the
  // Go side sets this graph-level flag for both the top-level and named-container forms.
  sequence: boolean
  // Root layout direction up|down|left|right (task 127); empty/undefined = default (down).
  direction?: string
  config?: D2Config // source `vars.d2-config` (task 159 → task 132)
}

// Cache-buster: base MUST equal media-src/vendor/d2/source.json "version" (bump both on a D2
// update). The "-langN" suffix is OUR entrypoint's schema revision — bump it whenever main.go
// marshals new fields WITHOUT a d2 bump (the webview HTTP cache would otherwise keep serving
// the old wasm under an unchanged ?v= and the new fields would silently never appear).
// -lang1 = block-string `language` field (task 154); -lang2 = task 159 style/attribute export batch
// (shape effects, text styles, dimensions, label/icon/tooltip positions, grid gaps, edge label
// styling). ('-', not '+': plus parses as a space in query strings.)
const D2_VER = '0.1.33-lang2'

let bootPromise: Promise<D2CompileFn | null> | null = null

// Instantiate the D2 wasm, preferring STREAMING (compiles WHILE the ~1.8 MB downloads → shorter
// first-D2 latency, task 145 item 2). instantiateStreaming REQUIRES the response carry
// Content-Type: application/wasm; the vscode-resource origin may not send it, in which case it throws
// — fall back to the buffered fetch→arrayBuffer→instantiate path (also covers any engine without
// streaming). Logs once which path ran so the MIME behaviour is verifiable in the real webview.
async function instantiateD2Wasm(
  url: string,
  importObject: WebAssembly.Imports,
): Promise<WebAssembly.Instance> {
  if (typeof WebAssembly.instantiateStreaming === 'function') {
    try {
      const res = await WebAssembly.instantiateStreaming(
        fetch(url),
        importObject,
      )
      logToHost('[d2] wasm instantiate: streaming')
      return res.instance
    } catch (e) {
      logToHost(
        `[d2] wasm instantiate: streaming failed (${e}); buffered fallback`,
      )
    }
  }
  const resp = await fetch(url)
  const buf = await resp.arrayBuffer()
  return (await WebAssembly.instantiate(buf, importObject)).instance
}

function bootD2(cdn: string): Promise<D2CompileFn | null> {
  if (bootPromise) return bootPromise
  bootPromise = (async () => {
    await loadScript(
      `${cdn}/dist/js/d2/wasm_exec.js?v=${D2_VER}`,
      'vditorD2WasmExec',
    )
    if (!window.Go) return null
    const go = new window.Go()
    let instance: WebAssembly.Instance
    try {
      instance = await instantiateD2Wasm(
        `${cdn}/dist/js/d2/d2-compile.wasm?v=${D2_VER}`,
        go.importObject,
      )
    } catch {
      return null
    }
    go.run(instance) // blocks on select{}; do not await
    // Phase 0: cold init ~470 ms; d2compile registers within a few frames after go.run().
    // 50 rAF (~0.8 s @60 fps) is a generous safety margin, NOT a tuned constant. If the
    // global never registers we return null -> compileD2 -> {error:'d2 wasm unavailable'},
    // which renderD2 logs distinctly from a compile error.
    for (let i = 0; i < 50 && typeof window.d2compile !== 'function'; i++) {
      await new Promise((r) => requestAnimationFrame(r))
    }
    return typeof window.d2compile === 'function' ? window.d2compile : null
  })()
  return bootPromise
}

// window.d2compile is SYNCHRONOUS once booted; this exported wrapper is ASYNC because it first
// boots the WASM, and on any failure it RESOLVES (never rejects) with { error }.
export async function compileD2(
  cdn: string,
  src: string,
): Promise<D2Graph | { error: string }> {
  const fn = await bootD2(cdn)
  if (!fn) return { error: 'd2 wasm unavailable' }
  const out = fn(src)
  if (out.error) return { error: out.error }
  const g = JSON.parse(out.graph) as D2Graph
  // Go marshals nil slices as null; normalize so callers can iterate safely.
  if (!g.shapes) g.shapes = []
  if (!g.edges) g.edges = []
  return g
}
