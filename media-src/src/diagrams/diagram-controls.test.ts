// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import {
  mountDiagramControls,
  observeDiagramControls,
} from './diagram-controls'

function controller() {
  let pan = false
  return {
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    reset: vi.fn(),
    setPanEnabled: vi.fn((enabled: boolean) => {
      pan = enabled
    }),
    isPanEnabled: vi.fn(() => pan),
  }
}

describe('diagram controls', () => {
  it('mounts one semantic four-button bar in fixed order', () => {
    const wrapper = document.createElement('div')
    const c = controller()
    const bar = mountDiagramControls(wrapper, c)
    const buttons = Array.from(bar.querySelectorAll('button'))

    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Pan diagram',
      'Zoom out',
      'Zoom in',
      'Reset view',
    ])
    expect(buttons.every((button) => button.type === 'button')).toBe(true)
    expect(bar.getAttribute('data-render')).toBe('1')
    expect(bar.querySelectorAll('[aria-hidden="true"]').length).toBe(4)
    expect(mountDiagramControls(wrapper, c)).toBe(bar)
  })

  it('dispatches actions, keeps reset last, and preserves Pan across reset', () => {
    const wrapper = document.createElement('div')
    const c = controller()
    const fullscreen = { isActive: vi.fn(() => false), toggle: vi.fn() }
    const bar = mountDiagramControls(wrapper, c, fullscreen)
    const buttons = Array.from(bar.querySelectorAll('button'))
    buttons[0].click()
    buttons[1].click()
    buttons[2].click()
    buttons[3].click()
    buttons[4].click()

    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Pan diagram',
      'Zoom out',
      'Zoom in',
      'Fullscreen diagram',
      'Reset view',
    ])
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true')
    expect(c.zoomOut).toHaveBeenCalledOnce()
    expect(c.zoomIn).toHaveBeenCalledOnce()
    expect(fullscreen.toggle).toHaveBeenCalledOnce()
    expect(c.reset).toHaveBeenCalledOnce()
    expect(c.isPanEnabled()).toBe(true)
  })

  it('decorates rebuilt zoomable renderers idempotently and skips inert engines', async () => {
    const app = document.createElement('div')
    app.innerHTML = `<div class="vditor-preview">
      <div class="language-markmap"><svg></svg></div>
      <div class="language-plantuml"><svg></svg></div>
    </div>`
    document.body.replaceChildren(app)
    ;(
      app.querySelector('.language-markmap svg') as SVGSVGElement & {
        __vmdeMm?: unknown
      }
    ).__vmdeMm = {}
    const dispose = observeDiagramControls(app)
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(app.querySelectorAll('.vmde-diagram-controls')).toHaveLength(1)
    const original = app.querySelector<HTMLElement>('.vmde-diagram-controls')!
    const inertClone = original.cloneNode(true) as HTMLElement
    original.replaceWith(inertClone)
    app
      .querySelector('.language-markmap')!
      .appendChild(document.createElement('canvas'))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(app.querySelectorAll('.vmde-diagram-controls')).toHaveLength(1)
    expect(app.querySelector('.vmde-diagram-controls')).not.toBe(inertClone)
    dispose()
  })
})
