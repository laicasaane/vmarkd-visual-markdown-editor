import { engineByLang, engineLangs } from '../diagram-kit/engine-registry'
import { reconstructMindmaps } from './echarts-retheme'

export interface DiagramViewportController {
  zoomIn(): void
  zoomOut(): void
  reset(): void
  setPanEnabled(enabled: boolean): void
  isPanEnabled(): boolean
}

interface ViewportOps {
  zoomIn(): void
  zoomOut(): void
  reset(): void
}

const controllers = new WeakMap<HTMLElement, DiagramViewportController>()
const STEP_IN = 1.12
const STEP_OUT = 1 / STEP_IN

export function createDiagramViewportController(
  wrapper: HTMLElement,
  ops: ViewportOps,
): DiagramViewportController {
  let pan = wrapper.dataset.vmdePanEnabled === 'true'
  return {
    ...ops,
    setPanEnabled(enabled) {
      pan = enabled
      wrapper.dataset.vmdePanEnabled = String(enabled)
    },
    isPanEnabled: () => pan,
  }
}

export function registerDiagramViewportController(
  wrapper: HTMLElement,
  controller: DiagramViewportController,
): DiagramViewportController {
  controllers.set(wrapper, controller)
  return controller
}

export function viewportAdapterLangs(): string[] {
  return engineLangs((engine) => engine.zoom !== 'none')
}

function languageOf(wrapper: HTMLElement): string | null {
  for (const name of wrapper.classList) {
    if (!name.startsWith('language-')) continue
    const lang = name.slice('language-'.length)
    if (engineByLang(lang)?.zoom !== 'none') return lang
  }
  return null
}

function markmapController(wrapper: HTMLElement): DiagramViewportController {
  const mm = () =>
    (
      wrapper.querySelector('svg') as
        | (SVGSVGElement & {
            __vmdeMm?: {
              rescale?: (factor: number) => unknown
              fit?: () => unknown
            }
          })
        | null
    )?.__vmdeMm
  return createDiagramViewportController(wrapper, {
    zoomIn: () => mm()?.rescale?.(STEP_IN),
    zoomOut: () => mm()?.rescale?.(STEP_OUT),
    reset: () => mm()?.fit?.(),
  })
}

interface LeafletWrapper extends HTMLElement {
  __vmdeMap?: {
    zoomIn(): void
    zoomOut(): void
    stop?(): void
    setView(
      center: unknown,
      zoom: number,
      options?: { animate: boolean; reset: boolean },
    ): void
  }
  __vmdeMapInitialView?: { center: unknown; zoom: number }
}

function leafletController(wrapper: LeafletWrapper): DiagramViewportController {
  return createDiagramViewportController(wrapper, {
    zoomIn: () => wrapper.__vmdeMap?.zoomIn(),
    zoomOut: () => wrapper.__vmdeMap?.zoomOut(),
    reset: () => {
      const initial = wrapper.__vmdeMapInitialView
      if (initial) {
        wrapper.__vmdeMap?.stop?.()
        wrapper.__vmdeMap?.setView(initial.center, initial.zoom, {
          animate: false,
          reset: true,
        })
      }
    },
  })
}

function syntheticMindmapZoom(wrapper: HTMLElement, zoomIn: boolean): void {
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
      deltaY: zoomIn ? -100 : 100,
    }),
  )
}

function mindmapController(wrapper: HTMLElement): DiagramViewportController {
  return createDiagramViewportController(wrapper, {
    zoomIn: () => syntheticMindmapZoom(wrapper, true),
    zoomOut: () => syntheticMindmapZoom(wrapper, false),
    reset: () => {
      const win = window as any
      const ec = win.echarts
      const name = ec && win.__vmdeEchartsResolve?.(ec)
      reconstructMindmaps(win, wrapper, name, true)
    },
  })
}

export function controllerForDiagram(
  wrapper: HTMLElement,
): DiagramViewportController | null {
  const existing = controllers.get(wrapper)
  if (existing) return existing
  const lang = languageOf(wrapper)
  if (!lang) return null
  let controller: DiagramViewportController | null = null
  if (
    lang === 'markmap' &&
    (
      wrapper.querySelector('svg') as
        | (SVGSVGElement & { __vmdeMm?: unknown })
        | null
    )?.__vmdeMm
  )
    controller = markmapController(wrapper)
  else if (
    (lang === 'geojson' || lang === 'topojson') &&
    (wrapper as LeafletWrapper).__vmdeMap
  )
    controller = leafletController(wrapper)
  else if (
    lang === 'mindmap' &&
    wrapper.getAttribute('data-processed') === 'true' &&
    wrapper.querySelector('canvas')
  )
    controller = mindmapController(wrapper)
  // Static controllers are registered by diagram-zoom.ts once their SVG exists; returning null
  // here lets the shared observer retry after the asynchronous renderer attaches it.
  if (controller) controllers.set(wrapper, controller)
  return controller
}

function diagramPanEnabled(target: Element): boolean {
  const wrapper = target.closest<HTMLElement>(
    viewportAdapterLangs()
      .map((lang) => `.language-${lang}`)
      .join(', '),
  )
  return wrapper
    ? (controllerForDiagram(wrapper)?.isPanEnabled() ?? false)
    : false
}

;(
  window as typeof window & {
    __vmdeDiagramPanEnabled?: (target: Element) => boolean
  }
).__vmdeDiagramPanEnabled = diagramPanEnabled
