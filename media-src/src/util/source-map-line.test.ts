import { describe, it, expect } from 'vitest'
import {
  blockIndexForSourceLine,
  lineAndTextForOffset,
  markdownBlockRanges,
  sourceLineForReveal,
} from './source-map'

// Pure: offset → { line, lineText } in the SAME string. Reveal-in-source sends
// both to the host so it can match by content (robust to Vditor's on-load
// reflow) instead of trusting a raw offset across two text spaces.
describe('lineAndTextForOffset', () => {
  const md = '# Title\n\nFirst para.\nSecond para.\n'

  it('returns the line and its text for an offset', () => {
    // offset of "Second" = after "# Title\n\nFirst para.\n"
    const off = md.indexOf('Second')
    expect(lineAndTextForOffset(md, off)).toEqual({
      line: 3,
      lineText: 'Second para.',
    })
  })

  it('returns the heading line with its marker', () => {
    expect(lineAndTextForOffset(md, 2)).toEqual({
      line: 0,
      lineText: '# Title',
    })
  })

  it('clamps a negative offset to line 0', () => {
    expect(lineAndTextForOffset(md, -5).line).toBe(0)
  })

  it('clamps an out-of-range offset to the last line', () => {
    const res = lineAndTextForOffset(md, 9999)
    expect(res.line).toBe(4) // trailing empty line after the final \n
    expect(res.lineText).toBe('')
  })
})

describe('source line → Markdown block', () => {
  const md = [
    '---',
    'title: Demo',
    '---',
    '',
    '# Heading',
    '',
    'soft paragraph line one',
    'soft paragraph line two',
    '',
    '> quoted line',
    '>',
    '> quote tail',
    '',
    '- first item',
    '  - nested item',
    '    continuation',
    '',
    '| A | B |',
    '| --- | --- |',
    '| one | two |',
    '',
    '```mermaid',
    'graph TD',
    '  A --> B',
    '```',
    '',
    'Setext heading',
    '===',
    '',
    'tail',
  ].join('\n')

  it('groups front matter, soft paragraphs, quotes, lists, tables, fences, and setext headings', () => {
    expect(markdownBlockRanges(md)).toEqual([
      { startLine: 0, endLine: 2 },
      { startLine: 4, endLine: 4 },
      { startLine: 6, endLine: 7 },
      { startLine: 9, endLine: 11 },
      { startLine: 13, endLine: 15 },
      { startLine: 17, endLine: 19 },
      { startLine: 21, endLine: 24 },
      { startLine: 26, endLine: 27 },
      { startLine: 29, endLine: 29 },
    ])
  })

  it.each([
    [1, 0],
    [4, 1],
    [7, 2],
    [10, 3],
    [15, 4],
    [18, 5],
    [23, 6],
    [27, 7],
    [29, 8],
  ])('maps line %i to owning block %i', (line, block) => {
    expect(blockIndexForSourceLine(md, line)).toBe(block)
  })

  it('returns null for blank, negative, and out-of-range lines', () => {
    expect(blockIndexForSourceLine(md, 3)).toBeNull()
    expect(blockIndexForSourceLine(md, -1)).toBeNull()
    expect(blockIndexForSourceLine(md, 999)).toBeNull()
  })

  it('keeps indented code and thematic breaks as distinct blocks', () => {
    const source = 'before\n\n    alpha\n    beta\n\n---\n\nafter'
    expect(markdownBlockRanges(source)).toEqual([
      { startLine: 0, endLine: 0 },
      { startLine: 2, endLine: 3 },
      { startLine: 5, endLine: 5 },
      { startLine: 7, endLine: 7 },
    ])
  })

  it('recovers the nearest canonical line by text after blank-line/table normalization', () => {
    const canonical =
      'start\n\n| A   | B |\n| --- | - |\n| one | two |\n\ntarget'
    expect(sourceLineForReveal(canonical, 8, 'target')).toBe(6)
    expect(sourceLineForReveal(canonical, 3, '| A | B |')).toBe(2)
    expect(sourceLineForReveal(canonical, 2, 'missing')).toBeNull()
  })
})
