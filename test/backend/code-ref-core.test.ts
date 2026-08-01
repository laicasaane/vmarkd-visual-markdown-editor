import { describe, expect, it } from 'vitest'
import { findCodeRefs, matchWholeCodeRef } from '../../src/shared/code-ref-core'

// Task 229 — L1 tokenizer decision table. Pure text→matches, no resolution/DOM (see
// code-ref-core.ts's module doc for why the guards below live in the regex, and why some
// ambiguous shapes are deliberately left to the resolution gate instead).
describe('findCodeRefs', () => {
  it('matches a simple workspace-relative path:line', () => {
    expect(findCodeRefs('See src/edit-sync.ts:42 for details.')).toEqual([
      {
        source: 'src/edit-sync.ts:42',
        path: 'src/edit-sync.ts',
        line: 42,
        col: undefined,
        index: 4,
      },
    ])
  })

  it('matches path:line:col', () => {
    const [m] = findCodeRefs('src/edit-sync.ts:42:7')
    expect(m).toMatchObject({
      source: 'src/edit-sync.ts:42:7',
      path: 'src/edit-sync.ts',
      line: 42,
      col: 7,
    })
  })

  it('matches a bare filename with no directory component', () => {
    expect(findCodeRefs('README.md:5')[0]?.path).toBe('README.md')
  })

  it('matches a multi-dot filename (foo.d.ts)', () => {
    expect(findCodeRefs('foo.d.ts:100')[0]?.path).toBe('foo.d.ts')
  })

  it('finds multiple refs in the same string', () => {
    const matches = findCodeRefs('see src/a.ts:10 and src/b.ts:20')
    expect(matches.map((m) => m.source)).toEqual(['src/a.ts:10', 'src/b.ts:20'])
  })

  it('trims cleanly at trailing punctuation', () => {
    expect(findCodeRefs('(see src/foo.ts:42).')[0]?.source).toBe(
      'src/foo.ts:42',
    )
  })

  // ── Guards: things that must NOT match ──────────────────────────────────────────────
  it('does not match a bare time-of-day ("1:30" has no file extension)', () => {
    expect(findCodeRefs('Meeting at 1:30 tomorrow.')).toEqual([])
  })

  it('does not match a 3-segment timestamp', () => {
    expect(findCodeRefs('a chapter reference like 12:30:45 timestamp')).toEqual(
      [],
    )
  })

  it('does not match a URL with a port (scheme boundary blocks it)', () => {
    expect(
      findCodeRefs('Visit http://localhost:8080/path for the dashboard.'),
    ).toEqual([])
    expect(
      findCodeRefs('Visit http://example.com:8080 for the dashboard.'),
    ).toEqual([])
  })

  it('does not match a Windows drive path', () => {
    expect(findCodeRefs('C:\\Users\\me\\file.txt is a windows path.')).toEqual(
      [],
    )
  })

  it('does not match a Windows-style relative path (backslash separator)', () => {
    expect(findCodeRefs('src\\foo.ts:42 windows-style relative path.')).toEqual(
      [],
    )
  })

  it('does not match an absolute POSIX path (not workspace-relative)', () => {
    expect(findCodeRefs('/abs/path/file.ts:9 is absolute.')).toEqual([])
  })

  it('does not match a number with no extension before the colon', () => {
    expect(findCodeRefs('port only 8080:9090 no ext')).toEqual([])
  })

  it('does not match a filename with no line number at all', () => {
    expect(findCodeRefs('nothing.ts has no line')).toEqual([])
  })

  it('does not match a full-line fence marker', () => {
    expect(findCodeRefs('```')).toEqual([])
  })
})

describe('matchWholeCodeRef', () => {
  it('matches when the WHOLE trimmed text is one code reference', () => {
    expect(matchWholeCodeRef('src/edit-sync.ts:42')).toMatchObject({
      path: 'src/edit-sync.ts',
      line: 42,
    })
    // inline-code textContent commonly carries surrounding whitespace from the DOM
    expect(matchWholeCodeRef('  src/edit-sync.ts:42  ')).toMatchObject({
      path: 'src/edit-sync.ts',
    })
  })

  it('rejects when the ref is only PART of the text (no substring decoration inside code)', () => {
    expect(matchWholeCodeRef('see src/edit-sync.ts:42 here')).toBeNull()
  })

  it('rejects text with no ref at all', () => {
    expect(matchWholeCodeRef('const x = 1')).toBeNull()
  })

  it('rejects two refs in one code span', () => {
    expect(matchWholeCodeRef('src/a.ts:1 src/b.ts:2')).toBeNull()
  })

  it("strips the U+200B caret-anchor Vditor's WYSIWYG inline code carries (measured spike)", () => {
    expect(matchWholeCodeRef('\u200Bsrc/edit-sync.ts:42')).toMatchObject({
      path: 'src/edit-sync.ts',
      line: 42,
    })
    expect(matchWholeCodeRef('\u200Bsrc/edit-sync.ts:42\u200B')).toMatchObject({
      path: 'src/edit-sync.ts',
    })
  })
})
