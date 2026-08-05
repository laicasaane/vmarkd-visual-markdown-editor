import { describe, expect, it } from 'vitest'
import { clamp } from '../../src/shared/clamp'

describe('clamp', () => {
  it('passes a value already inside the bounds through unchanged', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  it('floors at lo', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
  })

  it('caps at hi', () => {
    expect(clamp(15, 0, 10)).toBe(10)
  })

  it('is inclusive at both boundaries', () => {
    expect(clamp(0, 0, 10)).toBe(0)
    expect(clamp(10, 0, 10)).toBe(10)
  })

  // The tie-break the shared helper documents and outline-resize.ts deliberately does NOT want —
  // see src/shared/clamp.ts's header and task 499.
  it('returns lo when lo > hi (documented, not validated)', () => {
    expect(clamp(5, 10, 0)).toBe(10)
  })

  it('propagates NaN', () => {
    expect(clamp(Number.NaN, 0, 10)).toBeNaN()
  })
})
