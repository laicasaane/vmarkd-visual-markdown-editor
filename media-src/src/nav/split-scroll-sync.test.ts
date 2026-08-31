// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  rangeForSourceOffset,
  scanSourceHeadings,
  sourceHeadingOffsets,
} from './split-scroll-sync'

describe('split source heading discovery', () => {
  it('finds headings in the current one-wrapper nested-span SV DOM', () => {
    const source = document.createElement('div')
    source.className = 'vditor-sv'
    source.innerHTML = `<div><span># One</span>\nbody\n<span>## Two</span>\n</div>`
    const offsets = sourceHeadingOffsets(source)
    expect(offsets.map(({ level, text }) => ({ level, text }))).toEqual([
      { level: 1, text: 'One' },
      { level: 2, text: 'Two' },
    ])
    const range = rangeForSourceOffset(source, offsets[1].offset, 6)!
    expect(range.toString()).toBe('## Two')
  })

  it('supports multiple direct source blocks without relying on that shape', () => {
    const source = document.createElement('div')
    source.innerHTML = '<div><span># One</span></div><div><b>## Two</b></div>'
    expect(sourceHeadingOffsets(source).map(({ text }) => text)).toEqual([
      'One',
      'Two',
    ])
  })

  it('excludes heading-looking lines in backtick, tilde, and list-indented fences', () => {
    const markdown = [
      '# Real',
      '```md',
      '# fenced',
      '```',
      '  ~~~',
      '## also fenced',
      '  ~~~',
      '    ```d2',
      '# nested fence',
      '    ```',
      '## Real two',
    ].join('\n')
    expect(scanSourceHeadings(markdown).map(({ text }) => text)).toEqual([
      'Real',
      'Real two',
    ])
  })

  it('preserves duplicate text, mixed levels, CRLF offsets, and a terminal newline in order', () => {
    const markdown = '# Same\r\n### Same\r\n###### Tail\r\n'
    expect(scanSourceHeadings(markdown)).toEqual([
      { offset: 0, length: 6, level: 1, text: 'Same' },
      { offset: 8, length: 8, level: 3, text: 'Same' },
      { offset: 18, length: 11, level: 6, text: 'Tail' },
    ])
  })

  it('fails safely for a DOM offset that cannot resolve', () => {
    const source = document.createElement('div')
    source.textContent = '# One'
    expect(rangeForSourceOffset(source, 999, 2)).toBeNull()
  })

  it('reuses cached scans until source text changes or the DOM is replaced', async () => {
    const source = document.createElement('div')
    source.innerHTML = '<div># One\nbody</div>'
    const first = sourceHeadingOffsets(source)
    expect(sourceHeadingOffsets(source)).toBe(first)
    source.firstElementChild!.append('\n## Two')
    await Promise.resolve()
    const changed = sourceHeadingOffsets(source)
    expect(changed).not.toBe(first)
    expect(changed).toHaveLength(2)
    const replacement = source.cloneNode(true) as HTMLElement
    expect(sourceHeadingOffsets(replacement)).not.toBe(changed)
  })
})
