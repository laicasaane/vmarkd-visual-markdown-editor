import { observeDiagramControls } from '../src/diagrams/diagram-controls'
import { observeDiagramZoom } from '../src/diagrams/diagram-zoom'
import { installDiagramZoomGate } from '../src/diagrams/diagram-zoom-gate'

document.body.innerHTML = `<div id="app"><div class="vditor-preview">
  <div class="language-d2"><svg width="300" height="120"><rect width="100" height="50" /></svg></div>
  <div class="language-markmap"><svg width="300" height="120"><g /></svg></div>
  <div class="language-mindmap" data-processed="true" data-code="%7B%22name%22%3A%22root%22%7D"><canvas width="300" height="120"></canvas></div>
  <div class="language-geojson"><div class="leaflet-container"><div class="map-surface"></div><div class="leaflet-control-attribution">© map</div></div></div>
  <div class="language-plantuml"><svg width="300" height="120" /></div>
</div></div>`

const app = document.getElementById('app')!
const wrappers = Object.fromEntries(
  ['d2', 'markmap', 'mindmap', 'geojson', 'plantuml'].map((lang) => [
    lang,
    document.querySelector<HTMLElement>(`.language-${lang}`)!,
  ]),
)
const state = {
  markScale: 1,
  markFit: 0,
  markPan: 0,
  mindZoom: 0,
  mindReset: 0,
  mindPan: 0,
  geoZoom: 3,
  geoPan: 0,
}

const markSvg = wrappers.markmap.querySelector('svg') as SVGSVGElement & {
  __vmdeMm?: unknown
}
markSvg.__vmdeMm = {
  rescale: (factor: number) => {
    state.markScale *= factor
  },
  fit: () => {
    state.markScale = 1
    state.markFit++
  },
}
markSvg.addEventListener('mousedown', (event) => {
  if (
    event.ctrlKey ||
    event.metaKey ||
    (window as any).__vmdeDiagramPanEnabled(markSvg)
  )
    state.markPan++
})

const attachMindCanvas = (canvas: HTMLCanvasElement) => {
  canvas.addEventListener('wheel', (event) => {
    state.mindZoom += event.deltaY < 0 ? 1 : -1
  })
  canvas.addEventListener('mousedown', () => {
    state.mindPan++
  })
}
attachMindCanvas(wrappers.mindmap.querySelector('canvas')!)
Object.defineProperty(wrappers.mindmap, 'clientWidth', { value: 300 })
;(window as any).__vmdeEchartsResolve = () => 'test-theme'
;(window as any).echarts = {
  getInstanceByDom: () => ({
    dispose() {
      /* fake ECharts instance */
    },
  }),
  init: (element: HTMLElement) => {
    state.mindReset++
    const canvas = document.createElement('canvas')
    attachMindCanvas(canvas)
    element.appendChild(canvas)
    return {
      setOption() {
        /* fake ECharts instance */
      },
    }
  },
}

const geo = wrappers.geojson as HTMLElement & {
  __vmdeMap?: any
  __vmdeMapInitialView?: any
}
geo.__vmdeMap = {
  zoomIn: () => state.geoZoom++,
  zoomOut: () => state.geoZoom--,
  setView: (_center: unknown, zoom: number) => {
    state.geoZoom = zoom
  },
}
geo.__vmdeMapInitialView = { center: [0, 0], zoom: 3 }
geo.querySelector('.map-surface')!.addEventListener('mousedown', () => {
  state.geoPan++
})

for (const wrapper of Object.values(wrappers)) {
  wrapper.style.width = '320px'
  wrapper.style.height = '140px'
}
;(
  wrappers.d2 as HTMLElement & { setPointerCapture(): void }
).setPointerCapture = () => {
  /* harness pointer-capture stub */
}
;(
  wrappers.d2 as HTMLElement & { releasePointerCapture(): void }
).releasePointerCapture = () => {
  /* harness pointer-capture stub */
}

installDiagramZoomGate(document)
observeDiagramZoom(app)
observeDiagramControls(app)

const button = (lang: string, label: string) =>
  Array.from(wrappers[lang].querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.getAttribute('aria-label') === label,
  )!

;(window as any).__clickControl = (lang: string, label: string) =>
  button(lang, label).click()
;(window as any).__drag = (lang: string, modified: boolean) => {
  const wrapper = wrappers[lang]
  const target =
    lang === 'd2'
      ? wrapper
      : wrapper.querySelector<HTMLElement>(
          lang === 'markmap'
            ? 'svg'
            : lang === 'mindmap'
              ? 'canvas'
              : '.map-surface',
        )!
  if (lang === 'd2') {
    target.dispatchEvent(
      new PointerEvent('pointerdown', {
        button: 0,
        pointerId: 5,
        clientX: 10,
        clientY: 10,
        ctrlKey: modified,
        bubbles: true,
      }),
    )
    target.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 5,
        clientX: 40,
        clientY: 30,
        bubbles: true,
      }),
    )
    target.dispatchEvent(
      new PointerEvent('pointerup', { pointerId: 5, bubbles: true }),
    )
  } else {
    target.dispatchEvent(
      new MouseEvent('mousedown', {
        button: 0,
        ctrlKey: modified,
        bubbles: true,
        cancelable: true,
      }),
    )
  }
}
;(window as any).__controlsState = () => ({
  bars: Object.fromEntries(
    Object.entries(wrappers).map(([lang, wrapper]) => [
      lang,
      wrapper.querySelectorAll(':scope > .vmde-diagram-controls').length,
    ]),
  ),
  labels: Array.from(wrappers.d2.querySelectorAll('button')).map((entry) =>
    entry.getAttribute('aria-label'),
  ),
  pan: Object.fromEntries(
    ['d2', 'markmap', 'mindmap', 'geojson'].map((lang) => [
      lang,
      button(lang, 'Pan diagram').getAttribute('aria-pressed'),
    ]),
  ),
  d2Transform: wrappers.d2.querySelector<SVGElement>('svg')?.style.transform,
  fullscreen: Boolean(
    document.querySelector('.vmde-diagram-fullscreen-overlay'),
  ),
  d2Fullscreen: wrappers.d2.getAttribute('data-vmde-fullscreen'),
  d2InPreview: Boolean(wrappers.d2.closest('.vditor-preview')),
  fullscreenLabel: Array.from(
    wrappers.d2.querySelectorAll<HTMLButtonElement>('button'),
  )
    .find((entry) =>
      entry.getAttribute('aria-label')?.toLowerCase().includes('fullscreen'),
    )
    ?.getAttribute('aria-label'),
  ...state,
  controlBg: getComputedStyle(
    wrappers.d2.querySelector('.vmde-diagram-controls')!,
  ).backgroundColor,
  focusOutline: getComputedStyle(button('d2', 'Zoom in')).outlineStyle,
  source: 'unchanged markdown',
})

requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    button('d2', 'Zoom in').focus()
    ;(window as any).__ready = true
  }),
)
