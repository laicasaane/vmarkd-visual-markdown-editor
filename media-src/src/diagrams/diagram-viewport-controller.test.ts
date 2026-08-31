// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { engineLangs } from '../diagram-kit/engine-registry'
import {
  controllerForDiagram,
  viewportAdapterLangs,
} from './diagram-viewport-controller'

describe('diagram viewport adapters', () => {
  it('covers every and only zoom-capable engine descriptor', () => {
    expect(viewportAdapterLangs()).toEqual(
      engineLangs((engine) => engine.zoom !== 'none'),
    )
  })

  it('routes Markmap through its retained viewport authority', () => {
    document.body.innerHTML =
      '<div class="vditor-preview"><div class="language-markmap"><svg></svg></div></div>'
    const wrapper = document.querySelector<HTMLElement>('.language-markmap')!
    const mm = { rescale: vi.fn(), fit: vi.fn() }
    ;(
      wrapper.querySelector('svg') as SVGSVGElement & { __vmdeMm?: unknown }
    ).__vmdeMm = mm
    const controller = controllerForDiagram(wrapper)!

    controller.zoomIn()
    controller.zoomOut()
    controller.setPanEnabled(true)
    controller.reset()

    expect(mm.rescale).toHaveBeenNthCalledWith(1, 1.12)
    expect(mm.rescale).toHaveBeenNthCalledWith(2, 1 / 1.12)
    expect(mm.fit).toHaveBeenCalledOnce()
    expect(controller.isPanEnabled()).toBe(true)
  })

  it('routes Leaflet through the stashed map and preserves Pan on reset', () => {
    const wrapper = document.createElement('div') as HTMLElement & {
      __vmdeMap?: any
      __vmdeMapInitialView?: any
    }
    wrapper.className = 'language-geojson'
    wrapper.__vmdeMap = {
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      stop: vi.fn(),
      setView: vi.fn(),
    }
    wrapper.__vmdeMapInitialView = { center: [1, 2], zoom: 4 }
    const controller = controllerForDiagram(wrapper)!
    controller.setPanEnabled(true)
    controller.zoomIn()
    controller.zoomOut()
    controller.reset()

    expect(wrapper.__vmdeMap.zoomIn).toHaveBeenCalledOnce()
    expect(wrapper.__vmdeMap.zoomOut).toHaveBeenCalledOnce()
    expect(wrapper.__vmdeMap.stop).toHaveBeenCalledOnce()
    expect(wrapper.__vmdeMap.setView).toHaveBeenCalledWith([1, 2], 4, {
      animate: false,
      reset: true,
    })
    expect(controller.isPanEnabled()).toBe(true)
  })

  it('reconstructs an ECharts mindmap on Reset instead of treating it as a no-op', () => {
    document.body.innerHTML =
      '<div class="vditor-preview"><div class="language-mindmap" data-processed="true" data-code="%7B%22name%22%3A%22root%22%7D"><canvas></canvas></div></div>'
    const wrapper = document.querySelector<HTMLElement>('.language-mindmap')!
    Object.defineProperty(wrapper, 'clientWidth', { value: 320 })
    const setOption = vi.fn()
    const dispose = vi.fn()
    ;(window as any).echarts = {
      getInstanceByDom: vi.fn(() => ({ dispose })),
      init: vi.fn(() => ({ setOption })),
    }
    ;(window as any).__vmdeEchartsResolve = vi.fn(() => 'vmde-theme')
    const controller = controllerForDiagram(wrapper)!
    controller.setPanEnabled(true)
    controller.reset()

    expect(dispose).toHaveBeenCalledOnce()
    expect((window as any).echarts.init).toHaveBeenCalled()
    expect(setOption).toHaveBeenCalled()
    expect(controller.isPanEnabled()).toBe(true)
  })

  it('rejects inert and unknown engines', () => {
    const inert = document.createElement('div')
    inert.className = 'language-plantuml'
    const unknown = document.createElement('div')
    unknown.className = 'language-unknown'
    expect(controllerForDiagram(inert)).toBeNull()
    expect(controllerForDiagram(unknown)).toBeNull()
  })
})
