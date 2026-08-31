// Ctrl-to-interact gate for the interactive diagram renderers:
//   - markmap + ECharts mindmap: wheel = zoom, drag = pan — both grab the pointer the moment it's over
//     them, so a plain scroll/drag over the diagram hijacks the gesture ("przechwytuje kursor").
//   - geojson/topojson Leaflet maps: a plain drag PANS the map (Leaflet `dragging` defaults on);
//     wheel-zoom is already off (scrollWheelZoom:false). Same hijack class — gate the pan behind Ctrl.
//
// markmap uses d3-zoom (a non-passive `wheel` on its <svg>); the ECharts mindmap uses `roam`
// (handlers deep on the zr <canvas>); Leaflet binds drag on `mousedown` deep in the map pane. None
// exposes a reliable per-event Ctrl filter we can configure from outside, so we gate at the DOM with a
// CAPTURE-phase listener on the document: a wheel/mousedown over a RENDERED diagram is blocked from
// reaching the renderer UNLESS Ctrl is held. The capture listener on the document ancestor runs before
// the renderer's own (deeper) handlers, so stopImmediatePropagation keeps the event from ever reaching
// them — and because we never preventDefault the wheel (the listener is passive), the document is free
// to scroll.
//
// Result: plain wheel → page scrolls; Ctrl+wheel → zoom; plain drag → nothing; Ctrl+drag → pan
// (markmap also gets a d3-zoom `.filter` override in the esbuild patch so Ctrl+drag actually pans; the
// mindmap's ECharts `roam` and Leaflet's `dragging` both pan on Ctrl+drag for free once the gate lets
// the gesture through — neither filters on Ctrl itself).
//
// Leaflet EXCEPTION: a map's +/- zoom control (and the attribution control) must stay plain-clickable.
// Our document-CAPTURE gate runs BEFORE Leaflet's own bubble-phase `disableClickPropagation`, so it
// would otherwise swallow the control click — so exempt any event whose target is inside a
// `.leaflet-control` (a control click is not a pan gesture). markmap/mindmap have no such sub-controls,
// so the exemption is a no-op for them.
//
// Scoped to RENDERED diagrams only (inside a preview pane) — never the editable source
// `<code class="language-…">`. Installed once per webview (idempotent); document-level, so it
// survives IR/WYSIWYG/Preview switches and the DOM rebuilds Vditor does per keystroke.

import { engineLangs } from '../diagram-kit/engine-registry'
import { controllerForDiagram } from './diagram-viewport-controller'
let installed = false

// 185/2a: derived from the engine registry — every engine whose zoom mode is 'gated'.
const RENDERED_DIAGRAM = engineLangs((e) => e.zoom === 'gated')
  .map((lang) => `.language-${lang}`)
  .join(', ')
const PREVIEW_PANES =
  '.vditor-ir__preview, .vditor-wysiwyg__preview, .vditor-preview, .vmde-diagram-fullscreen-stage'
// Leaflet's zoom (+/-) + attribution controls — clicking them is not a pan, so it must reach Leaflet.
const LEAFLET_CONTROL = '.leaflet-control'
const SHARED_CONTROLS = '.vmde-diagram-controls'

// The rendered diagram this event should be suppressed for, or null to let it through. Exported for
// diagram-zoom-keys-gated.ts (task 459) — the keyboard zoom handler resolves the SAME "which gated
// diagram is this" question document.activeElement answers, so it reuses this rather than a second
// copy of the selector logic.
export function gatedDiagram(target: EventTarget | null): Element | null {
  const el = target instanceof Element ? target : null
  const diagram = el?.closest(RENDERED_DIAGRAM) ?? null
  if (!diagram?.closest(PREVIEW_PANES)) return null
  // A click on a Leaflet map's +/- / attribution control is not a pan — let it reach Leaflet.
  if (el?.closest(`${LEAFLET_CONTROL}, ${SHARED_CONTROLS}`)) return null
  return diagram
}

function admitsGesture(e: Event, diagram: Element | null): boolean {
  const modified = (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey
  if (modified) return true
  return Boolean(
    e.type === 'mousedown' &&
      diagram instanceof HTMLElement &&
      controllerForDiagram(diagram)?.isPanEnabled(),
  )
}

function gatePanClick(e: Event, diagram: Element | null): void {
  if (!(diagram instanceof HTMLElement)) return
  const mouse = e as MouseEvent
  if (mouse.ctrlKey || mouse.metaKey) return
  if (!controllerForDiagram(diagram)?.isPanEnabled()) return
  e.preventDefault()
  e.stopImmediatePropagation()
}

export function installDiagramZoomGate(doc: Document = document): void {
  if (installed) return
  installed = true
  const gate = (e: Event): void => {
    // Ctrl held → let the renderer zoom/pan. Otherwise suppress it over a rendered diagram so the
    // page scrolls (wheel) / nothing happens (drag) instead of the diagram grabbing the gesture.
    const diagram = gatedDiagram(e.target)
    if (e.type === 'click') {
      gatePanClick(e, diagram)
      return
    }
    if (admitsGesture(e, diagram)) {
      // Task 459: Ctrl+mousedown is ALSO the "focus this diagram for keyboard zoom" gesture — the
      // same signal that already means "interact with this diagram" for wheel/drag, so keyboard
      // entry costs no new mental model. Wheel is excluded (mousedown is the natural "I clicked
      // this widget" moment; a wheel tick alone isn't). tabIndex=-1: script/click-focusable, never a
      // Tab stop (457's decision 3 — Tab must not walk into diagram content).
      if (
        e.type === 'mousedown' &&
        ((e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey)
      ) {
        if (diagram instanceof HTMLElement) {
          diagram.tabIndex = -1
          diagram.focus({ preventScroll: true })
        }
      }
      return
    }
    if (!diagram) return
    e.stopImmediatePropagation()
  }
  // passive wheel: we only stopImmediatePropagation (allowed while passive) — never preventDefault,
  // so the document scrolls normally. mousedown is non-passive (it only stops propagation too).
  doc.addEventListener('wheel', gate, { capture: true, passive: true })
  doc.addEventListener('mousedown', gate, { capture: true })
  doc.addEventListener('click', gate, { capture: true })
}
