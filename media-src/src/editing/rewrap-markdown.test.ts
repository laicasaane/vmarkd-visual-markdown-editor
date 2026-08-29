import { describe, expect, it } from 'vitest'
import { rewrapMarkdownDocument, rewrapMarkdownRange } from './rewrap-markdown'

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

  it('keeps marker-only quote lines as boundaries around the caret paragraph', () => {
    const markdown = [
      '> **Selected option:** A',
      '>',
      '> **Required `MonoView` members:**',
      '>',
      '> **Required `UIToolkitView` members:**',
      '>',
      '> **Lifecycle constraints:** **Notes:** Add to plan file instead of proposal',
      '>',
      '> **Following paragraph:** unchanged',
    ].join('\n')
    const expected = [
      '> **Selected option:** A',
      '>',
      '> **Required `MonoView` members:**',
      '>',
      '> **Required `UIToolkitView` members:**',
      '>',
      '> **Lifecycle constraints:** **Notes:** Add to plan file',
      '> instead of proposal',
      '>',
      '> **Following paragraph:** unchanged',
    ].join('\n')
    const caretOffset = markdown.indexOf('proposal') + 'proposal'.length
    const expectedCaretOffset = expected.indexOf('proposal') + 'proposal'.length

    expect(rewrap(markdown, 60, caretOffset, caretOffset, caretOffset)).toEqual(
      {
        markdown: expected,
        caretOffset: expectedCaretOffset,
        changed: true,
      },
    )
  })

  it.each([
    [
      'unordered list',
      '- keep unchanged\n- alpha beta gamma delta\n- tail unchanged',
      '- keep unchanged\n- alpha beta\n  gamma delta\n- tail unchanged',
      14,
    ],
    [
      'ordered list',
      '1. keep unchanged\n2. alpha beta gamma delta\n3. tail unchanged',
      '1. keep unchanged\n2. alpha beta\n   gamma delta\n3. tail unchanged',
      15,
    ],
    [
      'task list',
      '- [ ] keep unchanged\n- [x] alpha beta gamma delta\n- [ ] tail unchanged',
      '- [ ] keep unchanged\n- [x] alpha\n      beta\n      gamma\n      delta\n- [ ] tail unchanged',
      12,
    ],
    [
      'nested mixed list',
      '- outer\n  1. keep unchanged\n  2. alpha beta gamma delta\n  3. tail unchanged\n- done',
      '- outer\n  1. keep unchanged\n  2. alpha beta\n     gamma delta\n  3. tail unchanged\n- done',
      16,
    ],
    [
      'nested blockquote',
      '> > keep unchanged\n> >\n> > alpha beta gamma delta\n> >\n> > tail unchanged',
      '> > keep unchanged\n> >\n> > alpha beta\n> > gamma delta\n> >\n> > tail unchanged',
      16,
    ],
  ])(
    'rewraps only the caret item in a %s',
    (_name, markdown, expected, column) => {
      const caretOffset = markdown.indexOf('gamma') + 2

      expect(
        rewrap(markdown, column, caretOffset, caretOffset, caretOffset),
      ).toMatchObject({
        markdown: expected,
        changed: true,
      })

      const wrappedCaret = expected.indexOf('gamma') + 2
      expect(
        rewrap(expected, column, wrappedCaret, wrappedCaret, wrappedCaret),
      ).toMatchObject({
        markdown: expected,
        changed: false,
      })
    },
  )

  it('rewraps every list item covered by an explicit selection', () => {
    const markdown = '- alpha beta gamma delta\n- epsilon zeta eta theta\n'
    const expected =
      '- alpha beta\n  gamma delta\n- epsilon zeta\n  eta theta\n'

    expect(rewrap(markdown, 14)).toMatchObject({
      markdown: expected,
      changed: true,
    })
  })

  it('preserves a loose-list continuation paragraph owner', () => {
    const markdown = [
      '- first item',
      '',
      '  second paragraph alpha beta gamma delta',
    ].join('\n')
    const expected = [
      '- first item',
      '',
      '  second paragraph',
      '  alpha beta gamma',
      '  delta',
    ].join('\n')
    const caretOffset = markdown.indexOf('gamma') + 2

    expect(
      rewrap(markdown, 18, caretOffset, caretOffset, caretOffset),
    ).toMatchObject({
      markdown: expected,
      changed: true,
    })
  })

  it('preserves a marker-only callout header while wrapping its body paragraph', () => {
    const markdown = [
      '> [!NOTE]',
      '> alpha beta gamma delta epsilon',
      '>',
      '> tail unchanged',
    ].join('\n')
    const expected = [
      '> [!NOTE]',
      '> alpha beta gamma',
      '> delta epsilon',
      '>',
      '> tail unchanged',
    ].join('\n')
    const caretOffset = markdown.indexOf('epsilon') + 3

    expect(
      rewrap(markdown, 18, caretOffset, caretOffset, caretOffset),
    ).toMatchObject({
      markdown: expected,
      changed: true,
    })
  })

  it('does not merge a nested blockquote into its parent paragraph', () => {
    const markdown = [
      '> outer alpha beta',
      '> > nested gamma delta',
      '> tail epsilon',
    ].join('\n')
    const expected = [
      '> outer alpha',
      '> beta',
      '> > nested gamma delta',
      '> tail epsilon',
    ].join('\n')
    const caretOffset = markdown.indexOf('beta') + 2

    expect(
      rewrap(markdown, 14, caretOffset, caretOffset, caretOffset),
    ).toMatchObject({
      markdown: expected,
      changed: true,
    })
  })

  it.each([
    [
      'quoted fenced code',
      '> ```js\n> const value = alpha beta gamma delta\n> ```',
    ],
    ['nested quoted math', '> > $$\n> > alpha beta gamma delta\n> > $$'],
    ['quoted indented code', '>     alpha beta gamma delta'],
  ])('does not rewrite %s', (_name, markdown) => {
    const caretOffset = markdown.indexOf('gamma') + 2

    expect(rewrap(markdown, 12, caretOffset, caretOffset, caretOffset)).toEqual(
      {
        markdown,
        caretOffset,
        changed: false,
      },
    )
  })

  it.each([
    [
      'quoted fence content beginning with another quote marker',
      '> ```\n> > alpha beta gamma delta\n> ```',
    ],
    [
      'ordered-list-indented fence',
      '  1. item\n     ```\n     alpha beta gamma delta\n     ```\n  2. tail',
    ],
    [
      'raw HTML block with blank lines',
      '<pre>\n\nalpha beta gamma delta\n\n</pre>',
    ],
  ])('keeps %s byte-identical', (_name, markdown) => {
    const caretOffset = markdown.indexOf('gamma') + 2

    expect(rewrap(markdown, 12, caretOffset, caretOffset, caretOffset)).toEqual(
      {
        markdown,
        caretOffset,
        changed: false,
      },
    )
  })

  it.each(['* * *', '- - -', '_ _ _', '> * * *'])(
    'does not rewrite thematic break %s',
    (markdown) => {
      expect(rewrap(markdown, 2)).toEqual({
        markdown,
        caretOffset: markdown.length,
        changed: false,
      })
    },
  )

  it.each(['- * * *', '- - - -', '> - _ _ _'])(
    'does not rewrite list-contained thematic break %s',
    (markdown) => {
      expect(rewrap(markdown, 4)).toEqual({
        markdown,
        caretOffset: markdown.length,
        changed: false,
      })
    },
  )

  it('does not rewrite list-contained indented code', () => {
    const markdown = '-     code alpha beta gamma delta'
    const caretOffset = markdown.indexOf('gamma') + 2

    expect(rewrap(markdown, 12, caretOffset, caretOffset, caretOffset)).toEqual(
      {
        markdown,
        caretOffset,
        changed: false,
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

describe('rewrapMarkdownDocument', () => {
  it.each([
    [
      'quoted fence content beginning with another quote marker',
      '> ```\n> > alpha beta gamma delta\n> ```',
    ],
    [
      'ordered-list-indented fence',
      '  1. item\n     ```\n     alpha beta gamma delta\n     ```\n  2. tail',
    ],
    [
      'raw HTML block with blank lines',
      '<pre>\n\nalpha beta gamma delta\n\n</pre>',
    ],
  ])('keeps %s byte-identical during document rewrap', (_name, markdown) => {
    expect(
      rewrapMarkdownDocument(markdown, markdown.indexOf('gamma'), 12),
    ).toEqual({
      markdown,
      caretOffset: markdown.indexOf('gamma'),
      changed: false,
    })
  })

  it('keeps each quote depth in its own document unit', () => {
    const markdown = [
      '> outer alpha beta',
      '> > nested gamma delta',
      '> tail epsilon',
    ].join('\n')
    const expected = [
      '> outer alpha',
      '> beta',
      '> > nested',
      '> > gamma',
      '> > delta',
      '> tail epsilon',
    ].join('\n')

    expect(
      rewrapMarkdownDocument(markdown, markdown.indexOf('gamma'), 14),
    ).toMatchObject({
      markdown: expected,
      changed: true,
    })
  })

  it('does not close a fence on a delimiter with trailing content', () => {
    const markdown = [
      '```',
      'alpha beta gamma',
      '```still code',
      'delta epsilon zeta',
      '```',
    ].join('\n')

    expect(
      rewrapMarkdownDocument(markdown, markdown.indexOf('delta'), 12),
    ).toEqual({
      markdown,
      caretOffset: markdown.indexOf('delta'),
      changed: false,
    })
  })

  it.each([
    [
      'top-level tab-indented closer',
      ['```', 'alpha', '\t```', 'beta gamma delta', '```'].join('\n'),
    ],
    [
      'list tab-indented closer',
      ['- ```', '  alpha', '\t```', '  beta gamma delta', '  ```'].join('\n'),
    ],
  ])('does not close a fence on %s', (_name, markdown) => {
    expect(
      rewrapMarkdownDocument(markdown, markdown.indexOf('gamma'), 12),
    ).toEqual({
      markdown,
      caretOffset: markdown.indexOf('gamma'),
      changed: false,
    })
  })

  it.each([
    [
      'fence',
      ['- ```', '  code', '', '  more alpha beta gamma', '  ```'].join('\n'),
    ],
    [
      'math',
      ['- $$', '  formula', '', '  more alpha beta gamma', '  $$'].join('\n'),
    ],
    [
      'raw HTML',
      ['- <pre>', '  code', '', '  more alpha beta gamma', '  </pre>'].join(
        '\n',
      ),
    ],
  ])('keeps blank-containing list %s byte-identical', (_name, markdown) => {
    expect(
      rewrapMarkdownDocument(markdown, markdown.indexOf('gamma'), 12),
    ).toEqual({
      markdown,
      caretOffset: markdown.indexOf('gamma'),
      changed: false,
    })
  })

  it('preserves a list-contained Setext heading', () => {
    const markdown = [
      '- A long list heading that stays one line',
      '  ---',
      '',
      'outside alpha beta gamma delta',
    ].join('\n')
    const expected = [
      '- A long list heading that stays one line',
      '  ---',
      '',
      'outside',
      'alpha beta',
      'gamma delta',
    ].join('\n')

    expect(
      rewrapMarkdownDocument(markdown, markdown.indexOf('outside'), 12),
    ).toMatchObject({
      markdown: expected,
      changed: true,
    })
  })

  it('preserves every physical line of a multiline Setext heading', () => {
    const markdown = [
      'alpha beta',
      'gamma delta',
      '---',
      '',
      'outside alpha beta gamma delta',
    ].join('\n')
    const expected = [
      'alpha beta',
      'gamma delta',
      '---',
      '',
      'outside',
      'alpha beta',
      'gamma delta',
    ].join('\n')

    expect(
      rewrapMarkdownDocument(markdown, markdown.indexOf('outside'), 12),
    ).toMatchObject({
      markdown: expected,
      changed: true,
    })
  })

  it('preserves a multiline link-reference definition', () => {
    const markdown = [
      '[ref]: /url',
      '  "a long reference title that stays intact"',
      '',
      'outside alpha beta gamma delta',
    ].join('\n')
    const expected = [
      '[ref]: /url',
      '  "a long reference title that stays intact"',
      '',
      'outside',
      'alpha beta',
      'gamma delta',
    ].join('\n')

    expect(
      rewrapMarkdownDocument(markdown, markdown.indexOf('outside'), 12),
    ).toMatchObject({
      markdown: expected,
      changed: true,
    })
  })

  it.each([
    [
      'next-line destination and title',
      ['[ref]:', '  /url', '  "title"'].join('\n'),
    ],
    ['unindented title', ['[ref]: /url', '"title"'].join('\n')],
    [
      'multiline title',
      ['[ref]: /url', '  "a long', '  reference title"'].join('\n'),
    ],
    [
      'next-line destination and same-line title',
      ['[ref]:', '  /url "long title words"'].join('\n'),
    ],
    [
      'angle destination with spaces and same-line title',
      ['[ref]:', '  <a b> "long title words"'].join('\n'),
    ],
    [
      'escaped closing bracket in its label',
      ['[foo\\]]: /url', '  "long title words"'].join('\n'),
    ],
    [
      'escaped quote in a multiline title',
      ['[ref]: /url', '  "first line \\"', '  second long title words"'].join(
        '\n',
      ),
    ],
    [
      'escaped parenthesis in a multiline title',
      ['[ref]: /url', '  (first line \\)', '  second long title words)'].join(
        '\n',
      ),
    ],
  ])('preserves link definition with %s', (_name, definition) => {
    const markdown = `${definition}\n\noutside alpha beta gamma delta`
    const expected = `${definition}\n\noutside\nalpha beta\ngamma delta`

    expect(
      rewrapMarkdownDocument(markdown, markdown.indexOf('outside'), 12),
    ).toMatchObject({
      markdown: expected,
      changed: true,
    })
  })

  it.each([
    ['fence', '> ```js\n> protected alpha beta gamma'],
    ['math block', '> $$\n> protected alpha beta gamma'],
  ])(
    'ends an unclosed quoted %s when its container ends',
    (_name, protectedBlock) => {
      const markdown = `${protectedBlock}\noutside alpha beta gamma delta`
      const expected = `${protectedBlock}\noutside\nalpha beta\ngamma delta`

      expect(
        rewrapMarkdownDocument(markdown, markdown.indexOf('outside'), 12),
      ).toMatchObject({
        markdown: expected,
        changed: true,
      })
    },
  )

  it.each(['```', '$$'])(
    'does not let indented code containing %s protect following prose',
    (delimiter) => {
      const markdown = [
        `    ${delimiter}`,
        '    protected alpha beta gamma',
        'outside alpha beta gamma delta',
      ].join('\n')
      const expected = [
        `    ${delimiter}`,
        '    protected alpha beta gamma',
        'outside',
        'alpha beta',
        'gamma delta',
      ].join('\n')

      expect(
        rewrapMarkdownDocument(markdown, markdown.indexOf('outside'), 12),
      ).toMatchObject({
        markdown: expected,
        changed: true,
      })
    },
  )

  it('preserves Setext heading pairs while wrapping surrounding prose', () => {
    const markdown = [
      'A long primary heading that must stay on one line',
      '===',
      '',
      'alpha beta gamma delta',
      '',
      'A long secondary heading that must stay on one line',
      '---',
    ].join('\n')
    const expected = [
      'A long primary heading that must stay on one line',
      '===',
      '',
      'alpha beta',
      'gamma delta',
      '',
      'A long secondary heading that must stay on one line',
      '---',
    ].join('\n')

    expect(
      rewrapMarkdownDocument(markdown, markdown.indexOf('gamma'), 12),
    ).toEqual({
      markdown: expected,
      caretOffset: expected.indexOf('gamma'),
      changed: true,
    })
  })

  it.each(['', '\n'])(
    'rewraps every eligible paragraph and preserves protected blocks with trailing newline %j',
    (trailing) => {
      const markdown =
        [
          '---',
          'title: alpha beta gamma',
          '---',
          '# Heading',
          '',
          'alpha beta gamma delta epsilon',
          '',
          '> quote alpha beta gamma delta',
          '',
          '- list alpha beta gamma delta',
          '',
          'hard alpha  ',
          'hard beta gamma',
          '',
          'slash alpha\\',
          'slash beta gamma',
          '',
          '中文 alpha beta gamma Supercalifragilistic',
          '',
          '```js',
          'const untouched = "alpha beta gamma delta"',
          '```',
          '',
          '| alpha | beta |',
          '| --- | --- |',
          '',
          '$$',
          'alpha beta gamma',
          '$$',
          '',
          'tail alpha beta gamma delta',
        ].join('\n') + trailing
      const expected =
        [
          '---',
          'title: alpha beta gamma',
          '---',
          '# Heading',
          '',
          'alpha beta gamma',
          'delta epsilon',
          '',
          '> quote alpha beta',
          '> gamma delta',
          '',
          '- list alpha beta',
          '  gamma delta',
          '',
          'hard alpha  ',
          'hard beta gamma',
          '',
          'slash alpha\\',
          'slash beta gamma',
          '',
          '中文 alpha beta',
          'gamma',
          'Supercalifragilistic',
          '',
          '```js',
          'const untouched = "alpha beta gamma delta"',
          '```',
          '',
          '| alpha | beta |',
          '| --- | --- |',
          '',
          '$$',
          'alpha beta gamma',
          '$$',
          '',
          'tail alpha beta',
          'gamma delta',
        ].join('\n') + trailing
      const caretOffset = markdown.indexOf('gamma delta epsilon') + 2

      const once = rewrapMarkdownDocument(markdown, caretOffset, 18)
      expect(once).toEqual({
        markdown: expected,
        caretOffset: expected.indexOf('gamma\ndelta epsilon') + 2,
        changed: true,
      })
      expect(
        rewrapMarkdownDocument(once.markdown, once.caretOffset, 18),
      ).toEqual({
        markdown: expected,
        caretOffset: once.caretOffset,
        changed: false,
      })
    },
  )
})
