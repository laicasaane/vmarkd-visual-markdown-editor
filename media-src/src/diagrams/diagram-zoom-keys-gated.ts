// Task 459 — keyboard `+`/`-`/`0` zoom for the "gated" diagram families (markmap, ECharts mindmap,
// Leaflet geojson/topojson maps — `zoom: 'gated'` in engine-registry.ts), reached once
// diagram-zoom-gate.ts's Ctrl+mousedown handler has focused the wrapper (same file, same gesture as
// the mouse zoom/pan these engines already gate on Ctrl).
//
// Unlike the STATIC-SVG family (diagram-zoom.ts), these engines own a REAL interactive zoom engine
// each (d3-zoom, ECharts `roam`, Leaflet). Calling their own API/pipeline — never a parallel CSS
// transform of our own — is the "respect, don't bypass" reading of the gate's contract: a second
// zoom authority here would desync from the engine's own state on the next real Ctrl+wheel/drag.
// Per engine:
//   - markmap: `svg.__vmarkdMm` is the retained Markmap instance (esbuild-shared.mjs's
//     patchMarkmapStatic, also used by markmap-fit.ts). `.rescale(factor)` scales pinned at the
//     viewport centre — verified in markmap-view's source, `factor` is RELATIVE (multiplies the
//     current transform), matching this file's wheel-step convention directly. `.fit()` is markmap's
//     own "fit to container" — the natural reset, same role as diagram-zoom.ts's `reset()`.
//   - geojson/topojson (Leaflet): `wrapper.__vmarkdMap`/`__vmarkdMapInitialView` are stashed by
//     geojson-topojson.ts (OUR code, not vendored) right after the initial fitBounds. `zoomIn()`/
//     `zoomOut()` are Leaflet's own public API; reset restores the stashed initial view.
//   - ECharts mindmap: NO instance is retained anywhere (confirmed: diagram-retheme.ts's mindmap
//     re-theme has to RECONSTRUCT from `data-code` for the same reason — see its own comment).
//     Adding a stash would need a NEW esbuild patch on vendored mindmapRender.ts, and the only zoom
//     entry point ECharts exposes for a `tree` series' roam (`dispatchAction({type:'treeRoam'})`) is
//     an internal, undocumented action type — not something to build on unverified. Instead this
//     dispatches a SYNTHETIC `wheel` event with `ctrlKey: true` at the chart's own `<canvas>`: that is
//     the exact gesture the gate exists to gate, going through the SAME pipeline a real Ctrl+wheel
//     would (ECharts' own RoamController does the zoom math, not us) — verified working in the real
//     VS Code e2e (diagram-render-sweep.spec.ts's diagram-zoom-keys case, task 511). If mindmap
//     ever needs a real reset button, an instance stash is the honest way to add one; not attempted
//     here.
import { gatedDiagram } from './diagram-zoom-gate'

const WHEEL_FACTOR_IN = 1.12
const WHEEL_FACTOR_OUT = 1 / 1.12

interface MarkmapSvg extends SVGSVGElement {
  __vmarkdMm?: { rescale?: (factor: number) => unknown; fit?: () => unknown }
}
interface LeafletWrapper extends HTMLElement {
  __vmarkdMap?: {
    zoomIn: () => void
    zoomOut: () => void
    setView: (center: unknown, zoom: number) => void
  }
  __vmarkdMapInitialView?: { center: unknown; zoom: number }
}

function zoomMarkmap(wrapper: Element, key: '+' | '-' | '0' | '='): void {
  const svg = wrapper.querySelector<MarkmapSvg>('svg')
  const mm = svg?.__vmarkdMm
  if (!mm) return
  if (key === '0') mm.fit?.()
  else mm.rescale?.(key === '-' ? WHEEL_FACTOR_OUT : WHEEL_FACTOR_IN)
}

function zoomLeaflet(wrapper: Element, key: '+' | '-' | '0' | '='): void {
  const w = wrapper as LeafletWrapper
  const map = w.__vmarkdMap
  if (!map) return
  if (key === '0') {
    const init = w.__vmarkdMapInitialView
    if (init) map.setView(init.center, init.zoom)
    return
  }
  if (key === '-') map.zoomOut()
  else map.zoomIn()
}

// See the file header: no retained ECharts instance, so this reaches the engine's OWN wheel-driven
// roam zoom via a synthetic wheel event carrying `ctrlKey: true` — the same signal a real Ctrl+wheel
// carries, dispatched at the chart's own canvas (target-phase, so diagram-zoom-gate.ts's document
// CAPTURE listener still sees it first, same as a real gesture: `ctrlKey` true → gate lets it
// through unstopped → ECharts' own zrender canvas listener runs normally). No reset (see header).
function zoomMindmapViaSyntheticWheel(
  wrapper: Element,
  key: '+' | '-' | '0' | '=',
): void {
  if (key === '0') return // no retained instance to reset to a known state
  const canvas = wrapper.querySelector('canvas')
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  canvas.dispatchEvent(
    new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      deltaY: key === '-' ? 100 : -100,
    }),
  )
}

function onKeydown(e: KeyboardEvent): void {
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
  const key = e.key
  if (key !== '+' && key !== '-' && key !== '0' && key !== '=') return
  const wrapper = gatedDiagram(document.activeElement)
  if (!wrapper) return
  e.preventDefault()
  e.stopImmediatePropagation()
  if (wrapper.matches('.language-markmap')) zoomMarkmap(wrapper, key)
  else if (wrapper.matches('.language-mindmap'))
    zoomMindmapViaSyntheticWheel(wrapper, key)
  else if (wrapper.matches('.language-geojson, .language-topojson'))
    zoomLeaflet(wrapper, key)
}

let bound: ((e: KeyboardEvent) => void) | null = null

/** Install the `+`/`-`/`0` keydown handler for gated diagrams (markmap/mindmap/geojson/topojson),
 *  once diagram-zoom-gate.ts's Ctrl+mousedown has focused one. Idempotent; returns a disposer. */
export function installGatedDiagramZoomKeys(
  doc: Document = document,
): () => void {
  if (bound) doc.removeEventListener('keydown', bound, true)
  bound = onKeydown
  // CAPTURE phase, same convention as every other keydown interceptor in this codebase
  // (diagram-zoom-gate.ts, escape-toolbar.ts, list-backspace.ts, callout-nav.ts, undo-keybind.ts):
  // the focused wrapper is a DESCENDANT of the contenteditable editor element, and Vditor's own
  // `hotkeyEvent` listener is bound there in the BUBBLE phase — capture on `document` is what runs
  // BEFORE that, so `stopImmediatePropagation` below can actually keep `+`/`-`/`0` from also being
  // typed as a character once it reaches Vditor's handler.
  doc.addEventListener('keydown', bound, true)
  return () => {
    if (bound) doc.removeEventListener('keydown', bound, true)
    bound = null
  }
}
