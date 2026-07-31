import { describe, expect, it } from 'vitest'
import { nextRovingIndex } from './roving-tabindex'

// nextRovingIndex is the only pure piece of roving-tabindex.ts (the rest touches
// HTMLElement.tabIndex/.focus() and is exercised by escape-toolbar's and outline-keyboard's own
// e2e instead — this repo's unit layer runs under `environment: 'node'`, no DOM).
describe('nextRovingIndex', () => {
  it('moves forward by one', () => {
    expect(nextRovingIndex(0, 1, 3)).toBe(1)
  })

  it('moves backward by one', () => {
    expect(nextRovingIndex(1, -1, 3)).toBe(0)
  })

  it('wraps forward past the last index', () => {
    expect(nextRovingIndex(2, 1, 3)).toBe(0)
  })

  it('wraps backward past the first index', () => {
    expect(nextRovingIndex(0, -1, 3)).toBe(2)
  })

  it('treats a negative current (nothing focused yet) as index 0', () => {
    expect(nextRovingIndex(-1, 1, 3)).toBe(1)
    expect(nextRovingIndex(-1, -1, 3)).toBe(2)
  })

  it('returns -1 for an empty list', () => {
    expect(nextRovingIndex(0, 1, 0)).toBe(-1)
    expect(nextRovingIndex(-1, -1, 0)).toBe(-1)
  })

  it('wraps in place for a single-item list', () => {
    expect(nextRovingIndex(0, 1, 1)).toBe(0)
    expect(nextRovingIndex(0, -1, 1)).toBe(0)
  })
})
