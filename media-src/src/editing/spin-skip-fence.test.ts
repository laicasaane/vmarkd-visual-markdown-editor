// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { shouldSkipFenceSpin, shouldSkipProseSpin } from './spin-skip-fence'

// Build a collapsed Range whose caret sits inside the given container, after appending text to it.
function caretIn(container: HTMLElement): Range {
  const t = document.createTextNode('graph TD; A-->B;')
  container.appendChild(t)
  const r = document.createRange()
  r.setStart(t, t.length)
  r.collapse(true)
  return r
}

function fenceSource(): { range: Range } {
  const root = document.createElement('div')
  root.innerHTML =
    '<div class="vditor-ir__node" data-type="code-block">' +
    '<pre class="vditor-ir__marker--pre"><code class="language-mermaid"></code></pre>' +
    '<pre class="vditor-ir__preview" data-render="2"></pre></div>'
  document.body.appendChild(root)
  const code = root.querySelector(
    '.vditor-ir__marker--pre > code',
  ) as HTMLElement
  return { range: caretIn(code) }
}

const ev = (init: Partial<InputEvent>) =>
  ({ inputType: 'insertText', data: 'x', ...init }) as InputEvent

describe('shouldSkipFenceSpin (task 175 escape-hatch predicate)', () => {
  it('SKIPS a single plain char typed inside a fenced source body', () => {
    const { range } = fenceSource()
    expect(shouldSkipFenceSpin(range, ev({ data: 's' }))).toBe(true)
  })

  it('does NOT skip a backtick (could open/close the fence)', () => {
    const { range } = fenceSource()
    expect(shouldSkipFenceSpin(range, ev({ data: '`' }))).toBe(false)
  })

  it('does NOT skip Enter / insertParagraph', () => {
    const { range } = fenceSource()
    expect(
      shouldSkipFenceSpin(
        range,
        ev({ inputType: 'insertParagraph', data: null }),
      ),
    ).toBe(false)
  })

  it('does NOT skip paste or delete', () => {
    const { range } = fenceSource()
    expect(
      shouldSkipFenceSpin(range, ev({ inputType: 'insertFromPaste' })),
    ).toBe(false)
    expect(
      shouldSkipFenceSpin(
        range,
        ev({ inputType: 'deleteContentBackward', data: null }),
      ),
    ).toBe(false)
  })

  it('does NOT skip composed / multi-char input (IME)', () => {
    const { range } = fenceSource()
    expect(shouldSkipFenceSpin(range, ev({ data: 'です' }))).toBe(false)
  })

  it.each(['é', 'ก', '界', '😀'])(
    'SKIPS one inert Unicode code point inside a fenced source: %s',
    (data) => {
      const { range } = fenceSource()
      expect(shouldSkipFenceSpin(range, ev({ data }))).toBe(true)
    },
  )

  it('does NOT skip a multi-code-point emoji sequence', () => {
    const { range } = fenceSource()
    expect(shouldSkipFenceSpin(range, ev({ data: '👩‍💻' }))).toBe(false)
  })

  it('does NOT skip when the range is not collapsed (selection replace)', () => {
    const { range } = fenceSource()
    range.setEnd(range.startContainer, 0) // make it span
    // a non-collapsed range
    const r2 = document.createRange()
    r2.selectNodeContents(range.startContainer)
    expect(shouldSkipFenceSpin(r2, ev({ data: 's' }))).toBe(false)
  })

  it('does NOT skip in prose (caret outside any fenced source)', () => {
    const p = document.createElement('p')
    p.textContent = 'the quick brown fox'
    document.body.appendChild(p)
    const r = document.createRange()
    r.setStart(p.firstChild as Text, 5)
    r.collapse(true)
    expect(shouldSkipFenceSpin(r, ev({ data: 'x' }))).toBe(false)
  })

  it('does NOT skip with no event', () => {
    const { range } = fenceSource()
    expect(shouldSkipFenceSpin(range, undefined)).toBe(false)
  })
})

describe('shouldSkipProseSpin (task 180 prose escape-hatch predicate)', () => {
  // a caret after `text` (offset = len) inside the given tag
  function caretInProse(tag: string, text = 'hello world'): Range {
    const el = document.createElement(tag)
    el.setAttribute('data-block', '0')
    el.textContent = text
    document.body.appendChild(el)
    const r = document.createRange()
    r.setStart(el.firstChild as Text, text.length)
    r.collapse(true)
    return r
  }

  it('SKIPS a letter typed in a paragraph', () => {
    expect(shouldSkipProseSpin(caretInProse('p'), ev({ data: 'x' }))).toBe(true)
  })
  it('SKIPS a letter in a heading / list item (content, not structural)', () => {
    expect(shouldSkipProseSpin(caretInProse('h2'), ev({ data: 'x' }))).toBe(
      true,
    )
    expect(shouldSkipProseSpin(caretInProse('li'), ev({ data: 'x' }))).toBe(
      true,
    )
  })
  it.each(['é', 'ก', '界', '\u0301', '٣', '😀'])(
    'SKIPS one inert Unicode prose code point: %s',
    (data) => {
      expect(shouldSkipProseSpin(caretInProse('p'), ev({ data }))).toBe(true)
    },
  )
  it('SKIPS an inter-word space (preceded by a letter)', () => {
    expect(
      shouldSkipProseSpin(caretInProse('p', 'hello'), ev({ data: ' ' })),
    ).toBe(true)
  })
  it('SKIPS an in-word digit (preceded by alphanumeric)', () => {
    expect(
      shouldSkipProseSpin(caretInProse('p', 'v2'), ev({ data: '3' })),
    ).toBe(true)
  })
  it('recognizes Unicode alphanumeric content before a mid-token space/digit', () => {
    expect(
      shouldSkipProseSpin(caretInProse('p', 'ไทย'), ev({ data: ' ' })),
    ).toBe(true)
    expect(
      shouldSkipProseSpin(caretInProse('p', 'café'), ev({ data: '3' })),
    ).toBe(true)
  })
  it('does NOT skip markdown-active chars (#, *, backtick, [, |, >)', () => {
    for (const data of ['#', '*', '`', '[', ']', '|', '>', '_', '~', '!']) {
      expect(shouldSkipProseSpin(caretInProse('p'), ev({ data }))).toBe(false)
    }
  })
  it('does NOT skip a space NOT preceded by alphanumeric (marker-committing position)', () => {
    // caret right after a leading '#': "#" + space would commit a heading → must spin
    expect(shouldSkipProseSpin(caretInProse('p', '#'), ev({ data: ' ' }))).toBe(
      false,
    )
  })
  it('does NOT skip a space/digit at offset 0', () => {
    const el = document.createElement('p')
    el.textContent = 'x'
    document.body.appendChild(el)
    const r = document.createRange()
    r.setStart(el.firstChild as Text, 0)
    r.collapse(true)
    expect(shouldSkipProseSpin(r, ev({ data: ' ' }))).toBe(false)
    expect(shouldSkipProseSpin(r, ev({ data: '1' }))).toBe(false)
  })
  it('does NOT skip inside a fenced source (that is task 175)', () => {
    const { range } = fenceSource()
    expect(shouldSkipProseSpin(range, ev({ data: 'x' }))).toBe(false)
  })
  it('does NOT skip Enter / paste / multi-char', () => {
    expect(
      shouldSkipProseSpin(
        caretInProse('p'),
        ev({ inputType: 'insertParagraph', data: null }),
      ),
    ).toBe(false)
    expect(shouldSkipProseSpin(caretInProse('p'), ev({ data: 'です' }))).toBe(
      false,
    )
    expect(
      shouldSkipProseSpin(caretInProse('p'), ev({ data: 'e\u0301' })),
    ).toBe(false)
    expect(shouldSkipProseSpin(caretInProse('p'), ev({ data: '👩‍💻' }))).toBe(
      false,
    )
  })
})
