// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installGatedDiagramZoomKeys } from './diagram-zoom-keys-gated'

// Each test appends its own pane and focuses its own wrapper; without a reset, a later test's
// `document.activeElement` check would still see the PREVIOUS test's (still-attached, still-focused)
// wrapper — jsdom's document persists across `it`s in one file.
afterEach(() => {
  ;(document.activeElement as HTMLElement | null)?.blur()
  document.body.innerHTML = ''
})

function keydown(target: Element, key: string, opts: KeyboardEventInit = {}) {
  const evt = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...opts,
  })
  target.dispatchEvent(evt)
  return evt
}

function addPane(html: string): HTMLElement {
  const wrap = document.createElement('div')
  wrap.innerHTML = html
  document.body.appendChild(wrap)
  return wrap
}

describe('installGatedDiagramZoomKeys — markmap', () => {
  it("calls the retained instance's rescale()/fit() — not a parallel transform of its own", () => {
    const pane = addPane(
      '<div class="vditor-preview"><div class="language-markmap" tabindex="-1"><svg></svg></div></div>',
    )
    const wrapper = pane.querySelector('.language-markmap') as HTMLElement
    const svg = pane.querySelector('svg') as SVGSVGElement & {
      __vmarkdMm?: { rescale: (f: number) => void; fit: () => void }
    }
    const rescale = vi.fn()
    const fit = vi.fn()
    svg.__vmarkdMm = { rescale, fit }
    wrapper.focus()
    const dispose = installGatedDiagramZoomKeys(document)

    keydown(wrapper, '+')
    expect(rescale).toHaveBeenCalledWith(1.12)
    keydown(wrapper, '-')
    expect(rescale).toHaveBeenCalledWith(1 / 1.12)
    keydown(wrapper, '0')
    expect(fit).toHaveBeenCalledTimes(1)

    dispose()
  })

  it('does nothing when nothing is focused (no gated diagram is document.activeElement)', () => {
    addPane(
      '<div class="vditor-preview"><div class="language-markmap"><svg></svg></div></div>',
    )
    const dispose = installGatedDiagramZoomKeys(document)
    const evt = keydown(document.body, '+')
    expect(evt.defaultPrevented).toBe(false) // not consumed — falls through untouched
    dispose()
  })
})

describe('installGatedDiagramZoomKeys — geojson/topojson (Leaflet)', () => {
  it("calls the stashed map's zoomIn()/zoomOut(), and setView() to the stashed initial view on 0", () => {
    const pane = addPane(
      '<div class="vditor-preview"><div class="language-geojson" tabindex="-1"><div class="leaflet-container"></div></div></div>',
    )
    const wrapper = pane.querySelector('.language-geojson') as HTMLElement & {
      __vmarkdMap?: {
        zoomIn: () => void
        zoomOut: () => void
        setView: (c: unknown, z: number) => void
      }
      __vmarkdMapInitialView?: { center: unknown; zoom: number }
    }
    const zoomIn = vi.fn()
    const zoomOut = vi.fn()
    const setView = vi.fn()
    wrapper.__vmarkdMap = { zoomIn, zoomOut, setView }
    wrapper.__vmarkdMapInitialView = { center: 'c0', zoom: 3 }
    wrapper.focus()
    const dispose = installGatedDiagramZoomKeys(document)

    keydown(wrapper, '+')
    expect(zoomIn).toHaveBeenCalledTimes(1)
    keydown(wrapper, '-')
    expect(zoomOut).toHaveBeenCalledTimes(1)
    keydown(wrapper, '0')
    expect(setView).toHaveBeenCalledWith('c0', 3)

    dispose()
  })
})

describe('installGatedDiagramZoomKeys — ECharts mindmap (synthetic Ctrl+wheel hedge)', () => {
  it('dispatches a synthetic ctrlKey wheel event at the canvas, deltaY sign per key', () => {
    const pane = addPane(
      '<div class="vditor-preview"><div class="language-mindmap" tabindex="-1"><canvas></canvas></div></div>',
    )
    const wrapper = pane.querySelector('.language-mindmap') as HTMLElement
    const canvas = pane.querySelector('canvas') as HTMLCanvasElement
    wrapper.focus()
    let seen: WheelEvent | null = null
    canvas.addEventListener('wheel', (e) => {
      seen = e as WheelEvent
    })
    const dispose = installGatedDiagramZoomKeys(document)

    keydown(wrapper, '+')
    expect(seen).not.toBeNull()
    expect((seen as unknown as WheelEvent).ctrlKey).toBe(true)
    expect((seen as unknown as WheelEvent).deltaY).toBeLessThan(0)

    seen = null
    keydown(wrapper, '-')
    expect((seen as unknown as WheelEvent).deltaY).toBeGreaterThan(0)

    dispose()
  })

  it('does nothing on "0" (no retained instance to reset to)', () => {
    const pane = addPane(
      '<div class="vditor-preview"><div class="language-mindmap" tabindex="-1"><canvas></canvas></div></div>',
    )
    const wrapper = pane.querySelector('.language-mindmap') as HTMLElement
    const canvas = pane.querySelector('canvas') as HTMLCanvasElement
    wrapper.focus()
    let fired = false
    canvas.addEventListener('wheel', () => {
      fired = true
    })
    const dispose = installGatedDiagramZoomKeys(document)
    keydown(wrapper, '0')
    expect(fired).toBe(false)
    dispose()
  })
})
