import { describe, it, expect } from 'vitest'
import { selectionForLine } from '../../src/session/reveal-range'

describe('selectionForLine', () => {
  // Robust mapping for reveal-in-source: the webview reports the caret's line +
  // that line's text (measured against vditor.getValue()). The on-disk doc may
  // differ by Vditor's on-load reflow (blank lines after headings, quote
  // normalization), so prefer matching the line CONTENT in the real doc and fall
  // back to the reported line number.
  const doc =
    '# Title\n\nNo blank after heading.\nTight paragraph two.\n> a quote\n'

  it('finds the line by its content even when the reported index is off', () => {
    // webview said line 2 (its space had a blank line), but on disk the text is
    // on line 2 as well here; use a case where indices differ:
    const sel = selectionForLine(doc, 99, 'Tight paragraph two.')
    expect(sel.line).toBe(3) // actual line of that text in `doc`
    expect(sel.startChar).toBe(0)
    expect(sel.endChar).toBe('Tight paragraph two.'.length)
  })

  it('matches a heading line including its marker', () => {
    const sel = selectionForLine(doc, 0, '# Title')
    expect(sel.line).toBe(0)
    expect(sel.endChar).toBe('# Title'.length)
  })

  it('falls back to the reported line number when the content is not found', () => {
    const sel = selectionForLine(doc, 4, 'not present in the doc')
    expect(sel.line).toBe(4) // reported line, clamped
    expect(sel.endChar).toBe('> a quote'.length)
  })

  it('prefers an exact unique line match over a substring', () => {
    const t = 'alpha\nalphabet\nalpha\n'
    // reported line 2 → bias the search to the nearest matching line
    const sel = selectionForLine(t, 2, 'alpha')
    expect(sel.line).toBe(2) // the line-2 "alpha", not line 0
    expect(sel.endChar).toBe('alpha'.length)
  })

  it('clamps the fallback line to the last line', () => {
    const sel = selectionForLine('one\ntwo\n', 99, 'missing')
    expect(sel.line).toBe(2)
  })

  it('treats an empty lineText as a pure line-number selection', () => {
    const sel = selectionForLine('a\nb\nc\n', 1, '')
    expect(sel.line).toBe(1)
    expect(sel.endChar).toBe(1) // "b"
  })
})
