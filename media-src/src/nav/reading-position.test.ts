import { describe, expect, it } from 'vitest'
import { shouldRestoreReadingPosition } from './reading-position'

const saved = {
  anchor: { hash: 'abc', index: 3, headingPath: ['Guide'] },
  scrollOffset: 12,
}

describe('reading-position restore precedence', () => {
  it('restores a saved position when enabled and no higher-priority intent exists', () => {
    expect(
      shouldRestoreReadingPosition({
        enabled: true,
        state: saved,
        prepaintIntent: 0,
        explicitReveal: false,
      }),
    ).toBe(true)
  })

  it('lets prepaint user intent win over memory', () => {
    expect(
      shouldRestoreReadingPosition({
        enabled: true,
        state: saved,
        prepaintIntent: 140,
        explicitReveal: false,
      }),
    ).toBe(false)
  })

  it('lets an explicit source reveal win over memory', () => {
    expect(
      shouldRestoreReadingPosition({
        enabled: true,
        state: saved,
        prepaintIntent: 0,
        explicitReveal: true,
      }),
    ).toBe(false)
  })

  it('does not persist or restore when the setting is disabled', () => {
    expect(
      shouldRestoreReadingPosition({
        enabled: false,
        state: saved,
        prepaintIntent: 0,
        explicitReveal: false,
      }),
    ).toBe(false)
  })
})
