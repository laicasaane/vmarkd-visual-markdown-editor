import { describe, expect, it } from 'vitest'
import { createEscapeArmState } from './escape-arm'

describe('createEscapeArmState', () => {
  it('starts disarmed', () => {
    const s = createEscapeArmState()
    expect(s.isArmed()).toBe(false)
  })

  it('escape arms it', () => {
    const s = createEscapeArmState()
    expect(s.handle('escape')).toBe('armed')
    expect(s.isArmed()).toBe(true)
  })

  it('tab while armed is consumed and disarms (one-shot)', () => {
    const s = createEscapeArmState()
    s.handle('escape')
    expect(s.handle('tab')).toBe('consumed')
    expect(s.isArmed()).toBe(false)
  })

  it('a second tab after the one-shot fires falls through (not armed anymore)', () => {
    const s = createEscapeArmState()
    s.handle('escape')
    s.handle('tab') // consumes the arm
    expect(s.handle('tab')).toBe('none')
  })

  it('tab while NOT armed is a no-op — ordinary Tab-to-indent must be untouched', () => {
    const s = createEscapeArmState()
    expect(s.handle('tab')).toBe('none')
    expect(s.isArmed()).toBe(false)
  })

  it('any other key while armed disarms without consuming', () => {
    const s = createEscapeArmState()
    s.handle('escape')
    expect(s.handle('other')).toBe('disarmed')
    expect(s.isArmed()).toBe(false)
  })

  it('other key while not armed is a no-op', () => {
    const s = createEscapeArmState()
    expect(s.handle('other')).toBe('none')
  })

  it('a bare modifier keydown (ignore) never arms or disarms', () => {
    const s = createEscapeArmState()
    expect(s.handle('ignore')).toBe('none')
    expect(s.isArmed()).toBe(false)

    s.handle('escape')
    expect(s.handle('ignore')).toBe('none')
    expect(s.isArmed()).toBe(true) // still armed — the modifier didn't cancel it
  })

  it('escape while already armed stays armed (idempotent re-arm)', () => {
    const s = createEscapeArmState()
    s.handle('escape')
    expect(s.handle('escape')).toBe('armed')
    expect(s.isArmed()).toBe(true)
  })

  it('reset force-disarms', () => {
    const s = createEscapeArmState()
    s.handle('escape')
    s.reset()
    expect(s.isArmed()).toBe(false)
    expect(s.handle('tab')).toBe('none')
  })

  it('two independent instances do not share state', () => {
    const a = createEscapeArmState()
    const b = createEscapeArmState()
    a.handle('escape')
    expect(a.isArmed()).toBe(true)
    expect(b.isArmed()).toBe(false)
  })
})
