// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountDiagramControls } from './diagram-controls'
import {
  exitDiagramFullscreen,
  fullscreenActionFor,
} from './diagram-fullscreen'

const controller = () => {
  let pan = true
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

afterEach(() => {
  exitDiagramFullscreen()
  document.body.replaceChildren()
})

describe('diagram fullscreen overlay', () => {
  it('moves the same wrapper, bar, controller state, and fixed-order fullscreen action into the overlay', () => {
    document.body.innerHTML =
      '<main><p>before</p><div class="language-d2"><svg /></div><p>after</p></main>'
    const wrapper = document.querySelector<HTMLElement>('.language-d2')!
    const c = controller()
    const action = fullscreenActionFor(wrapper)
    const bar = mountDiagramControls(wrapper, c, action)
    const buttons = Array.from(bar.querySelectorAll('button'))

    buttons[3].click()

    const overlay = document.querySelector<HTMLElement>(
      '.vmde-diagram-fullscreen-overlay',
    )!
    expect(overlay.getAttribute('role')).toBe('dialog')
    expect(overlay.getAttribute('aria-modal')).toBe('true')
    expect(overlay.contains(wrapper)).toBe(true)
    expect(wrapper.querySelector('.vmde-diagram-controls')).toBe(bar)
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Pan diagram',
      'Zoom out',
      'Zoom in',
      'Exit fullscreen',
      'Reset view',
    ])
    expect(c.isPanEnabled()).toBe(true)
  })

  it('restores the exact DOM position and exits on Escape without rebuilding the bar', () => {
    document.body.innerHTML =
      '<main><p id="before">before</p><div class="language-d2"><svg /></div><p id="after">after</p></main>'
    const wrapper = document.querySelector<HTMLElement>('.language-d2')!
    const c = controller()
    const bar = mountDiagramControls(wrapper, c, fullscreenActionFor(wrapper))
    const fullscreen = bar.querySelector<HTMLButtonElement>(
      '[aria-label="Fullscreen diagram"]',
    )!
    fullscreen.click()
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    )

    expect(
      document.querySelector('.vmde-diagram-fullscreen-overlay'),
    ).toBeNull()
    expect(document.querySelector('main')?.children[1]).toBe(wrapper)
    expect(wrapper.querySelector('.vmde-diagram-controls')).toBe(bar)
    expect(fullscreen.getAttribute('aria-label')).toBe('Fullscreen diagram')
  })
})
