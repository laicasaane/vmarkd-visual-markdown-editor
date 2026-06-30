// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { shouldSkipFenceSpin } from './spin-skip-fence'

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
