// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

// `openInPreview` drives the Preview toolbar button rather than calling an API, because Vditor has
// no constructor option or public setter for the Preview overlay (see the module header). That makes
// the two guards the whole contract: no button → do nothing, button ALREADY current → do nothing.
// The second one is the load-bearing case — Preview is a TOGGLE, so clicking it when the overlay is
// already up would turn it OFF, i.e. the exact opposite of what `defaultMode: "preview"` asks for.
// This file exists because `openInPreview` was reachable only from a real-VS-Code e2e (task 282),
// whose coverage does not merge into the unit report, so the coverage ratchet counted it as 0%.
const h = vi.hoisted(() => ({ inner: undefined as unknown }))
vi.mock('./inner-vditor', () => ({ innerVditor: () => h.inner }))

import { openInPreview } from './open-preview'

/** A stand-in for Vditor's `toolbar.elements.preview` wrapper, whose first child is the button. */
function toolbarWith(button: HTMLElement | null): unknown {
  const wrapper = document.createElement('div')
  if (button) wrapper.appendChild(button)
  return { toolbar: { elements: { preview: wrapper } } }
}

function previewButton(current: boolean): HTMLElement {
  const btn = document.createElement('button')
  if (current) btn.classList.add('vditor-menu--current')
  return btn
}

describe('openInPreview', () => {
  beforeEach(() => {
    h.inner = undefined
  })

  it('clicks the Preview button when the overlay is not already showing', () => {
    const btn = previewButton(false)
    const clicks = vi.fn()
    btn.addEventListener('click', clicks)
    h.inner = toolbarWith(btn)

    openInPreview()

    expect(clicks).toHaveBeenCalledTimes(1)
    // Vditor's own handler is bound higher up the toolbar, so the event has to bubble to reach it.
    expect(clicks.mock.calls[0][0].bubbles).toBe(true)
  })

  it('does NOT click when the button is already current — Preview is a toggle, not a setter', () => {
    const btn = previewButton(true)
    const clicks = vi.fn()
    btn.addEventListener('click', clicks)
    h.inner = toolbarWith(btn)

    openInPreview()

    expect(clicks).not.toHaveBeenCalled()
  })

  it('is a no-op when there is no Vditor instance yet', () => {
    h.inner = undefined
    expect(() => openInPreview()).not.toThrow()
  })

  it('is a no-op when the toolbar has no Preview button (custom toolbar)', () => {
    h.inner = toolbarWith(null)
    expect(() => openInPreview()).not.toThrow()
  })
})
