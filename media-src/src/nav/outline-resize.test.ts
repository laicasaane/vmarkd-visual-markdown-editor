import { describe, expect, it } from 'vitest'
import {
  MIN_WIDTH,
  clampOutlineWidth,
  keyboardWidthDelta,
} from './outline-resize'

describe('clampOutlineWidth', () => {
  it('passes through a width within bounds', () => {
    expect(clampOutlineWidth(250, 2000)).toBe(250)
  })

  it('floors at MIN_WIDTH', () => {
    expect(clampOutlineWidth(10, 2000)).toBe(MIN_WIDTH)
  })

  it('caps at 50% of the viewport', () => {
    expect(clampOutlineWidth(5000, 2000)).toBe(1000)
  })

  it('floors the viewport-relative max to a whole pixel', () => {
    expect(clampOutlineWidth(5000, 1001)).toBe(500) // floor(1001 * 0.5) = 500
  })
})

describe('keyboardWidthDelta', () => {
  it('ArrowRight shrinks a RIGHT-side outline (the boundary moves toward its own edge)', () => {
    expect(keyboardWidthDelta('ArrowRight', 'right', 10)).toBe(-10)
  })

  it('ArrowLeft grows a RIGHT-side outline (the boundary moves away from its own edge)', () => {
    expect(keyboardWidthDelta('ArrowLeft', 'right', 10)).toBe(10)
  })

  it('ArrowRight grows a LEFT-side outline', () => {
    expect(keyboardWidthDelta('ArrowRight', 'left', 10)).toBe(10)
  })

  it('ArrowLeft shrinks a LEFT-side outline', () => {
    expect(keyboardWidthDelta('ArrowLeft', 'left', 10)).toBe(-10)
  })

  it('matches the drag path sign convention for both sides (magnitude = step)', () => {
    for (const position of ['left', 'right'] as const) {
      expect(Math.abs(keyboardWidthDelta('ArrowRight', position, 7))).toBe(7)
      expect(Math.abs(keyboardWidthDelta('ArrowLeft', position, 7))).toBe(7)
      // Left and Right are always opposite in sign for a given side.
      expect(keyboardWidthDelta('ArrowRight', position, 7)).toBe(
        -keyboardWidthDelta('ArrowLeft', position, 7),
      )
    }
  })
})
