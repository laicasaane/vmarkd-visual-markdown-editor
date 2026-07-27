// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { installSelectedUrl, selectedUrl, takeExplicitEdit } from './link-url'

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
