// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { installDiagramZoomGate } from './diagram-zoom-gate'
import { controllerForDiagram } from './diagram-viewport-controller'

// The gate is a document-CAPTURE listener that calls stopImmediatePropagation over a rendered diagram
// unless Ctrl is held. We detect whether an event survived the gate with a bubble-phase sentinel on a
// root that contains the fixtures: if the capture gate stopped the event, the bubble sentinel never
// fires. installDiagramZoomGate has a module-level once-guard, so install ONCE on the jsdom document.
// Done at module scope (not beforeAll) because describe-body fixtures are built at collection time.

installDiagramZoomGate(document)
const root = document.createElement('div')
document.body.appendChild(root)
let reached = false
root.addEventListener('mousedown', () => {
  reached = true
})
root.addEventListener('wheel', () => {
  reached = true
})
root.addEventListener('click', () => {
  reached = true
})

function add(html: string): HTMLElement {
  const wrap = document.createElement('div')
  wrap.innerHTML = html
  root.appendChild(wrap)
  return wrap
}

function mousedown(target: Element, ctrlKey = false): boolean {
  reached = false
  target.dispatchEvent(
    new MouseEvent('mousedown', {
      button: 0,
      ctrlKey,
      bubbles: true,
      cancelable: true,
    }),
  )
  return reached
}

function wheel(target: Element, ctrlKey = false): boolean {
  reached = false
  target.dispatchEvent(
    new WheelEvent('wheel', {
      deltaY: 120,
      ctrlKey,
      bubbles: true,
      cancelable: true,
    }),
  )
  return reached
}

function click(target: Element): { reached: boolean; prevented: boolean } {
  reached = false
  const event = new MouseEvent('click', {
    button: 0,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return { reached, prevented: event.defaultPrevented }
}

describe('installDiagramZoomGate — geojson/topojson Leaflet maps', () => {
  const map = add(
    `<div class="vditor-ir__preview"><div class="language-geojson">
       <div class="leaflet-container"><div class="surface"></div>
         <div class="leaflet-control"><a class="leaflet-control-zoom-in">+</a></div>
       </div>
     </div></div>`,
  )
  const surface = map.querySelector('.surface') as Element
  const control = map.querySelector('.leaflet-control a') as Element

  it('blocks a plain drag (mousedown) over the rendered map surface → no pan', () => {
    expect(mousedown(surface, false)).toBe(false)
  })

  it('lets Ctrl+drag through → Leaflet pans', () => {
    expect(mousedown(surface, true)).toBe(true)
  })

  it('lets a plain drag through only while the shared Pan toggle is active', () => {
    const wrapper = map.querySelector<HTMLElement>('.language-geojson')!
    ;(wrapper as HTMLElement & { __vmdeMap?: unknown }).__vmdeMap = {}
    const controller = controllerForDiagram(wrapper)!
    controller.setPanEnabled(true)
    expect(mousedown(surface, false)).toBe(true)
    expect(wheel(surface, false)).toBe(false)
    expect(click(surface)).toEqual({ reached: false, prevented: true })
    controller.setPanEnabled(false)
    expect(mousedown(surface, false)).toBe(false)
    expect(click(surface)).toEqual({ reached: true, prevented: false })
  })

  it('blocks a plain wheel over the map (page scrolls; passive — never preventDefault)', () => {
    expect(wheel(surface, false)).toBe(false)
  })

  it('exempts the Leaflet +/- zoom control from the gate (plain click still works)', () => {
    expect(mousedown(control, false)).toBe(true)
  })

  it('never gates the editable source (a .language-geojson NOT inside a preview pane)', () => {
    const src = add(
      `<div class="language-geojson"><code>{"type":"FeatureCollection"}</code></div>`,
    )
    expect(mousedown(src.querySelector('code') as Element, false)).toBe(true)
  })

  it('gates topojson maps the same way', () => {
    const topo = add(
      `<div class="vditor-wysiwyg__preview"><div class="language-topojson"><div class="leaflet-container"><div class="t"></div></div></div></div>`,
    )
    expect(mousedown(topo.querySelector('.t') as Element, false)).toBe(false)
    expect(mousedown(topo.querySelector('.t') as Element, true)).toBe(true)
  })
})

describe('installDiagramZoomGate — markmap/mindmap (regression: unchanged)', () => {
  it('still blocks a plain wheel/drag over a rendered markmap in a preview pane', () => {
    const mm = add(
      `<div class="vditor-preview"><div class="language-markmap"><svg></svg></div></div>`,
    )
    const svg = mm.querySelector('svg') as Element
    expect(wheel(svg, false)).toBe(false)
    expect(mousedown(svg, false)).toBe(false)
    expect(wheel(svg, true)).toBe(true)
  })
})

// Task 459: Ctrl+mousedown is ALSO the "focus this diagram for keyboard zoom" signal — reuses the
// exact gesture that already means "interact with this diagram" for wheel/drag.
describe('installDiagramZoomGate — Ctrl+mousedown focuses the wrapper (task 459)', () => {
  it('focuses the gated-diagram wrapper on Ctrl+mousedown, with tabindex="-1" (not a Tab stop)', () => {
    const mm = add(
      `<div class="vditor-preview"><div class="language-markmap"><svg><g></g></svg></div></div>`,
    )
    const wrapper = mm.querySelector('.language-markmap') as HTMLElement
    const svg = mm.querySelector('svg') as Element
    expect(document.activeElement).not.toBe(wrapper)
    mousedown(svg, true)
    expect(document.activeElement).toBe(wrapper)
    expect(wrapper.getAttribute('tabindex')).toBe('-1')
  })

  it('does NOT focus anything on a plain (non-Ctrl) mousedown', () => {
    const mm = add(
      `<div class="vditor-preview"><div class="language-mindmap"><canvas></canvas></div></div>`,
    )
    const wrapper = mm.querySelector('.language-mindmap') as HTMLElement
    const canvas = mm.querySelector('canvas') as Element
    mousedown(canvas, false)
    expect(document.activeElement).not.toBe(wrapper)
  })
})
