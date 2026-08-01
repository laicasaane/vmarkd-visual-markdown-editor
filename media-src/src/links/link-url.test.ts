// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  applyPasteUrlSetting,
  installSelectedUrl,
  selectedUrl,
  takeExplicitEdit,
} from './link-url'

describe('selectedUrl', () => {
  it('takes an explicit http/https URL as the destination', () => {
    expect(selectedUrl('https://example.com/page')).toBe(
      'https://example.com/page',
    )
    expect(selectedUrl('http://example.com')).toBe('http://example.com')
  })

  it('takes a mailto: address', () => {
    expect(selectedUrl('mailto:someone@example.com')).toBe(
      'mailto:someone@example.com',
    )
  })

  it('gives a bare www. host an https destination', () => {
    // The label stays what the user selected; only the destination gets the scheme.
    expect(selectedUrl('www.example.com')).toBe('https://www.example.com')
  })

  it('trims surrounding whitespace from a double-click selection', () => {
    expect(selectedUrl('  https://example.com  ')).toBe('https://example.com')
  })

  it('refuses ordinary text', () => {
    // The important half: a false positive rewrites a destination the user never typed.
    expect(selectedUrl('the paper')).toBeNull()
    expect(selectedUrl('example')).toBeNull()
    expect(selectedUrl('')).toBeNull()
    expect(selectedUrl('   ')).toBeNull()
  })

  it('refuses a sentence that merely contains a URL', () => {
    expect(selectedUrl('see https://example.com for details')).toBeNull()
  })

  it('refuses a multi-line selection whose first line is a URL', () => {
    expect(selectedUrl('https://example.com\nand a second line')).toBeNull()
  })

  it('refuses a www-ish word with no dotted host', () => {
    expect(selectedUrl('www.example')).toBeNull()
  })

  it('installs itself as the global the Vditor patches call', () => {
    installSelectedUrl(window)
    const fn = (window as unknown as Record<string, unknown>)
      .__vmarkdSelectedUrl as (s: string) => string | null
    expect(fn('https://example.com')).toBe('https://example.com')
  })
})

describe('takeExplicitEdit', () => {
  it('is false until an explicit action marks it', () => {
    installSelectedUrl(window)
    expect(takeExplicitEdit(window)).toBe(false)
  })

  it('reports the mark exactly ONCE', () => {
    // Read-once matters: a stale flag would make the NEXT ordinary edit force a block rewrite,
    // which is the minimal-diff invariant this feature is carefully carving one exception out of.
    installSelectedUrl(window)
    ;(
      window as unknown as { __vmarkdExplicitEdit: () => void }
    ).__vmarkdExplicitEdit()
    expect(takeExplicitEdit(window)).toBe(true)
    expect(takeExplicitEdit(window)).toBe(false)
  })
})

describe('__vmarkdPasteUrlMd (task 392 — the no-selection paste)', () => {
  const pasteMd = (text: string, insideLink = false) => {
    installSelectedUrl(window)
    return (
      window as unknown as {
        __vmarkdPasteUrlMd: (t: string, l: boolean) => string | null
      }
    ).__vmarkdPasteUrlMd(text, insideLink)
  }

  it('turns a pasted URL into a link with the URL as both halves', () => {
    applyPasteUrlSetting(true)
    expect(pasteMd('https://example.com/a')).toBe(
      '[https://example.com/a](https://example.com/a)',
    )
  })

  it('keeps the pasted text as the label for a bare www. host', () => {
    // The label is what the user pasted; only the destination gains the scheme.
    applyPasteUrlSetting(true)
    expect(pasteMd('www.example.com')).toBe(
      '[www.example.com](https://www.example.com)',
    )
  })

  it('leaves ordinary text alone', () => {
    applyPasteUrlSetting(true)
    expect(pasteMd('just some words')).toBeNull()
    expect(pasteMd('https://example.com/a\nsecond line')).toBeNull()
  })

  it('stays literal when the caret is already inside a link', () => {
    // Pasting into a destination must not nest a link inside it.
    applyPasteUrlSetting(true)
    expect(pasteMd('https://example.com/a', true)).toBeNull()
  })

  it('is off when the setting is off', () => {
    applyPasteUrlSetting(false)
    expect(pasteMd('https://example.com/a')).toBeNull()
    applyPasteUrlSetting(true)
  })

  it('defaults to ON when the host sends no value', () => {
    applyPasteUrlSetting(undefined)
    expect(pasteMd('https://example.com/a')).toBe(
      '[https://example.com/a](https://example.com/a)',
    )
  })
})

describe('__vmarkdPasteUrlEnabled (task 224 residual gap — the SELECTED-text branch)', () => {
  const enabled = () => {
    installSelectedUrl(window)
    return (
      window as unknown as { __vmarkdPasteUrlEnabled: () => boolean }
    ).__vmarkdPasteUrlEnabled()
  }

  it('defaults to ON — the setting defaults true and this must not silently flip it', () => {
    // Guards against a fix that accidentally ships the accessor defaulting to false, which would
    // disable Vditor's own selection-wrap (a shipped feature) for every user who never touches the
    // setting.
    expect(enabled()).toBe(true)
  })

  it('tracks the same flag as applyPasteUrlSetting — one setting, both paste branches', () => {
    applyPasteUrlSetting(false)
    expect(enabled()).toBe(false)
    applyPasteUrlSetting(true)
    expect(enabled()).toBe(true)
  })

  it('treats an unset host value as ON, same as the collapsed-caret branch', () => {
    applyPasteUrlSetting(undefined)
    expect(enabled()).toBe(true)
  })
})

describe('takeExplicitEdit staleness', () => {
  it('drops a mark whose post never happened', async () => {
    // edit-sync can skip the post entirely (suppressed during an extension update / streaming).
    // A surviving mark would force a block rewrite on the NEXT, ordinary edit.
    installSelectedUrl(window)
    ;(
      window as unknown as { __vmarkdExplicitEditPending: number }
    ).__vmarkdExplicitEditPending = Date.now() - 60_000
    expect(takeExplicitEdit(window)).toBe(false)
  })

  it('keeps a mark that is only a debounce old', () => {
    installSelectedUrl(window)
    ;(
      window as unknown as { __vmarkdExplicitEditPending: number }
    ).__vmarkdExplicitEditPending = Date.now() - 300
    expect(takeExplicitEdit(window)).toBe(true)
  })
})
