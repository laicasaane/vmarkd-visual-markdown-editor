import { describe, expect, it } from 'vitest'
import { rewrapMarkdownRange } from './rewrap-markdown'

function rewrap(
  markdown: string,
  column: number,
  startOffset = 0,
  endOffset = markdown.length,
  caretOffset = endOffset,
) {
  return rewrapMarkdownRange(
    markdown,
    startOffset,
    endOffset,
    caretOffset,
    column,
  )
}

describe('rewrapMarkdownRange', () => {
  it('rewraps prose at word boundaries and keeps a trailing newline', () => {
    const markdown = 'alpha beta gamma delta epsilon\n'

    expect(rewrap(markdown, 16)).toEqual({
      markdown: 'alpha beta gamma\ndelta epsilon\n',
      caretOffset: 31,
      changed: true,
    })
  })

  it('expands a collapsed caret to its paragraph and maps the caret through wrapping', () => {
    const markdown = 'untouched\n\nalpha beta gamma delta\n\ntail\n'
    const caretOffset = markdown.indexOf('gamma') + 2

    expect(rewrap(markdown, 12, caretOffset, caretOffset, caretOffset)).toEqual(
      {
        markdown: 'untouched\n\nalpha beta\ngamma delta\n\ntail\n',
        caretOffset: 24,
        changed: true,
      },
    )
  })

  it('uses Unicode display width without splitting a wide word', () => {
    const markdown = 'ab 中文 cd ef\n'

    expect(rewrap(markdown, 8)).toMatchObject({
      markdown: 'ab 中文\ncd ef\n',
      changed: true,
    })
  })

  it('preserves list, nested-list, quote, and callout prefixes', () => {
    const cases = [
      ['- alpha beta gamma delta\n', '- alpha beta\n  gamma\n  delta\n'],
      ['  1. alpha beta gamma\n', '  1. alpha\n     beta\n     gamma\n'],
      ['> alpha beta gamma delta\n', '> alpha beta\n> gamma\n> delta\n'],
      ['> - alpha beta gamma\n', '> - alpha\n>   beta\n>   gamma\n'],
      ['> [!NOTE] alpha beta gamma\n', '> [!NOTE] alpha\n> beta gamma\n'],
    ] as const

    for (const [markdown, expected] of cases) {
      expect(rewrap(markdown, 12).markdown).toBe(expected)
    }
  })

  it('merges only soft physical newlines', () => {
    const markdown = [
      'soft alpha',
      'soft beta gamma',
      'hard alpha  ',
      'hard beta gamma',
      'slash alpha\\',
      'slash beta gamma',
      '',
    ].join('\n')

    expect(rewrap(markdown, 18).markdown).toBe(
      [
        'soft alpha soft',
        'beta gamma hard',
        'alpha  ',
        'hard beta gamma',
        'slash alpha\\',
        'slash beta gamma',
        '',
      ].join('\n'),
    )
  })

  it('is idempotent', () => {
    const markdown = '> - alpha beta gamma delta epsilon\n'
    const once = rewrap(markdown, 15)
    const twice = rewrap(once.markdown, 15)

    expect(twice).toEqual({
      markdown: once.markdown,
      caretOffset: once.caretOffset,
      changed: false,
    })
  })

  it.each([
    ['fenced code', '```js\nconst value = alpha beta gamma\n```\n'],
    ['indented code', '    alpha beta gamma delta\n'],
    ['front matter', '---\ntitle: alpha beta gamma\n---\n'],
    ['math block', '$$\nalpha beta gamma\n$$\n'],
    ['table', '| alpha | beta |\n| --- | --- |\n'],
    ['raw HTML', '<div>alpha beta gamma</div>\n'],
    ['link reference definition', '[ref]: https://example.com/a-long-path\n'],
  ])('safely no-ops for %s', (_name, markdown) => {
    expect(rewrap(markdown, 10)).toEqual({
      markdown,
      caretOffset: markdown.length,
      changed: false,
    })
  })

  it('does not rewrite an ambiguous selection spanning prose and an excluded block', () => {
    const markdown = 'alpha beta gamma\n\n```txt\nalpha beta gamma\n```\n'

    expect(rewrap(markdown, 10)).toEqual({
      markdown,
      caretOffset: markdown.length,
      changed: false,
    })
  })
})
