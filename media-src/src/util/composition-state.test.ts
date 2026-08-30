// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  guardComposition,
  installCompositionState,
  isCompositionActive,
  subscribeCompositionState,
} from './caret-gesture'

let dispose: (() => void) | undefined

afterEach(() => {
  dispose?.()
  dispose = undefined
})

describe('composition state', () => {
  it('guards both modern composing keydowns and the legacy keyCode 229 signal', () => {
    expect(guardComposition({ isComposing: true, keyCode: 65 })).toBe(true)
    expect(guardComposition({ isComposing: false, keyCode: 229 })).toBe(true)
    expect(guardComposition({ isComposing: false, keyCode: 65 })).toBe(false)
  })

  it('shares composition lifecycle state and the overlay-suppression attribute', () => {
    dispose = installCompositionState(document)

    document.dispatchEvent(new CompositionEvent('compositionstart'))

    expect(isCompositionActive()).toBe(true)
    expect(document.documentElement.hasAttribute('data-vmde-composing')).toBe(
      true,
    )
    expect(guardComposition({ isComposing: false, keyCode: 65 })).toBe(true)

    document.dispatchEvent(new CompositionEvent('compositionend'))

    expect(isCompositionActive()).toBe(false)
    expect(document.documentElement.hasAttribute('data-vmde-composing')).toBe(
      false,
    )
  })

  it('notifies selection-driven work once composition settles', () => {
    dispose = installCompositionState(document)
    const listener = vi.fn()
    const unsubscribe = subscribeCompositionState(listener)

    document.dispatchEvent(new CompositionEvent('compositionstart'))
    document.dispatchEvent(new CompositionEvent('compositionend'))

    expect(listener.mock.calls).toEqual([[true], [false]])
    unsubscribe()
  })
})
