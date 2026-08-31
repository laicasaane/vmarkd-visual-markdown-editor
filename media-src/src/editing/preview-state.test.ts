// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { createPreviewState, runPreviewEntry } from './preview-state'

describe('Preview render revision state', () => {
  it('reuses only a successfully committed current connected pane for the same instance', () => {
    const instance = {}
    const pane = document.createElement('div')
    document.body.appendChild(pane)
    const state = createPreviewState(instance)
    expect(state.canReuse(instance, pane)).toBe(false)
    state.markRendered(instance, pane)
    expect(state.canReuse(instance, pane)).toBe(true)
    expect(state.canReuse({}, pane)).toBe(false)
    pane.remove()
    expect(state.canReuse(instance, pane)).toBe(false)
  })

  it('invalidates content and render configuration independently and recommits once', () => {
    const instance = {}
    const pane = document.createElement('div')
    document.body.appendChild(pane)
    const state = createPreviewState(instance)
    state.markRendered(instance, pane)
    state.invalidateContent()
    expect(state.canReuse(instance, pane)).toBe(false)
    state.markRendered(instance, pane)
    expect(state.canReuse(instance, pane)).toBe(true)
    state.invalidateConfig()
    expect(state.canReuse(instance, pane)).toBe(false)
  })

  it('skips every render callback on reuse and renders once after invalidation', () => {
    const instance = {}
    const pane = document.createElement('div')
    pane.innerHTML = '<p>stable</p>'
    document.body.appendChild(pane)
    const child = pane.firstChild
    const state = createPreviewState(instance)
    const render = vi.fn()
    const reused = vi.fn()
    state.markRendered(instance, pane)

    expect(runPreviewEntry(state, instance, pane, render, reused)).toBe(true)
    expect(render).not.toHaveBeenCalled()
    expect(reused).toHaveBeenCalledOnce()
    expect(pane.firstChild).toBe(child)

    state.invalidateContent()
    expect(runPreviewEntry(state, instance, pane, render, reused)).toBe(false)
    expect(render).toHaveBeenCalledOnce()
  })
})
