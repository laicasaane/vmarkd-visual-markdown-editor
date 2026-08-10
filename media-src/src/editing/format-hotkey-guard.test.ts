import { describe, it, expect, vi } from 'vitest'
import {
  isPromotedFormatHotkey,
  normalizeEventKey,
  setupFormatHotkeyGuard,
} from './format-hotkey-guard'

const ev = (o: Partial<KeyboardEvent>) =>
  ({
    key: 'b',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...o,
  }) as KeyboardEvent

describe('normalizeEventKey', () => {
  it('normalizes Ctrl+B (non-mac) to "ctrl+b"', () => {
    expect(normalizeEventKey(ev({ key: 'b', ctrlKey: true }), false)).toBe(
      'ctrl+b',
    )
  })
  it('normalizes Cmd+B (mac) to "cmd+b"', () => {
    expect(normalizeEventKey(ev({ key: 'b', metaKey: true }), true)).toBe(
      'cmd+b',
    )
  })
  it('includes shift: Ctrl+Shift+7 -> "ctrl+shift+7"', () => {
    expect(
      normalizeEventKey(ev({ key: '7', ctrlKey: true, shiftKey: true }), false),
    ).toBe('ctrl+shift+7')
  })
  it('preserves symbol keys: Ctrl+] -> "ctrl+]"', () => {
    expect(normalizeEventKey(ev({ key: ']', ctrlKey: true }), false)).toBe(
      'ctrl+]',
    )
  })
  it('returns null with no primary modifier', () => {
    expect(normalizeEventKey(ev({ key: 'b' }), false)).toBeNull()
  })
  it('returns null when Alt is held (never part of FORMAT_HOTKEYS)', () => {
    expect(
      normalizeEventKey(ev({ key: 'b', ctrlKey: true, altKey: true }), false),
    ).toBeNull()
  })
  it('returns null for Ctrl+B on mac (wrong modifier for the platform)', () => {
    expect(normalizeEventKey(ev({ key: 'b', ctrlKey: true }), true)).toBeNull()
  })
})

describe('isPromotedFormatHotkey', () => {
  it('matches a kept-key row (Ctrl+B / Cmd+B)', () => {
    expect(isPromotedFormatHotkey(ev({ key: 'b', ctrlKey: true }), false)).toBe(
      true,
    )
    expect(isPromotedFormatHotkey(ev({ key: 'b', metaKey: true }), true)).toBe(
      true,
    )
  })
  it('matches a remapped row (Ctrl+Shift+7)', () => {
    expect(
      isPromotedFormatHotkey(
        ev({ key: '7', ctrlKey: true, shiftKey: true }),
        false,
      ),
    ).toBe(true)
  })
  it('matches the native-execCommand keys this module exists for (Ctrl+I, Ctrl+U)', () => {
    expect(isPromotedFormatHotkey(ev({ key: 'i', ctrlKey: true }), false)).toBe(
      true,
    )
    expect(isPromotedFormatHotkey(ev({ key: 'u', ctrlKey: true }), false)).toBe(
      true,
    )
  })
  it('does not match a non-promoted chord (Ctrl+S)', () => {
    expect(isPromotedFormatHotkey(ev({ key: 's', ctrlKey: true }), false)).toBe(
      false,
    )
  })
  it('does not match undo/redo (no keybinding — undo-keybind.ts owns those)', () => {
    expect(isPromotedFormatHotkey(ev({ key: 'z', ctrlKey: true }), false)).toBe(
      false,
    )
    expect(isPromotedFormatHotkey(ev({ key: 'y', ctrlKey: true }), false)).toBe(
      false,
    )
  })
})

describe('setupFormatHotkeyGuard', () => {
  function makeWin(platform: string) {
    // Default before setupFormatHotkeyGuard's addEventListener call replaces it below.
    let handler: (e: any) => void = () => undefined
    let capture: boolean | undefined
    return {
      navigator: { platform },
      addEventListener: (type: string, h: any, useCapture?: boolean) => {
        if (type === 'keydown') {
          handler = h
          capture = useCapture
        }
      },
      fire(e: any) {
        handler(e)
      },
      get capturePhase() {
        return capture
      },
    }
  }

  it('registers on the capture phase', () => {
    const win = makeWin('Linux x86_64')
    setupFormatHotkeyGuard(win as unknown as Window & typeof globalThis)
    expect(win.capturePhase).toBe(true)
  })

  it('preventDefault()s a promoted key and takes no other action (no click, no engine call)', () => {
    const win = makeWin('Linux x86_64')
    setupFormatHotkeyGuard(win as unknown as Window & typeof globalThis)
    const preventDefault = vi.fn()
    win.fire(ev({ key: 'b', ctrlKey: true, preventDefault } as any))
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('leaves a non-promoted key alone', () => {
    const win = makeWin('Linux x86_64')
    setupFormatHotkeyGuard(win as unknown as Window & typeof globalThis)
    const preventDefault = vi.fn()
    win.fire(ev({ key: 's', ctrlKey: true, preventDefault } as any))
    expect(preventDefault).not.toHaveBeenCalled()
  })
})
