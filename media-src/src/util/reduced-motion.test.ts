import { describe, expect, it } from 'vitest'
import { prefersReducedMotion, scrollBehavior } from './reduced-motion'

const media = (matches: boolean) =>
  ({ matchMedia: () => ({ matches }) }) as unknown as Pick<Window, 'matchMedia'>

describe('reduced motion preference', () => {
  it('uses instant scrolling when the OS requests reduced motion', () => {
    expect(prefersReducedMotion(media(true))).toBe(true)
    expect(scrollBehavior(media(true))).toBe('auto')
  })

  it('keeps smooth scrolling otherwise', () => {
    expect(prefersReducedMotion(media(false))).toBe(false)
    expect(scrollBehavior(media(false))).toBe('smooth')
  })
})
