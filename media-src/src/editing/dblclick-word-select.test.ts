// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installDblclickWordSelectFix } from './dblclick-word-select'

function selectRange(
  startNode: Node,
  startOffset: number,
  endNode: Node,
  endOffset: number,
) {
  const r = document.createRange()
  r.setStart(startNode, startOffset)
  r.setEnd(endNode, endOffset)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(r)
  return sel
}

function fireDblclick() {
  document.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
}

function fireMousedown(detail: number) {
  document.dispatchEvent(new MouseEvent('mousedown', { detail, bubbles: true }))
}

function fireMouseup() {
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
}

// jsdom does not dispatch `selectionchange` on its own when a Selection mutates — fire it by hand,
// same as the real browser would right after the native selection changes.
function fireSelectionchange() {
  document.dispatchEvent(new Event('selectionchange'))
}

let dispose: (() => void) | null = null

beforeEach(() => {
  document.body.replaceChildren()
  dispose = installDblclickWordSelectFix()
})

afterEach(() => {
  dispose?.()
  window.getSelection()?.removeAllRanges()
})

describe('installDblclickWordSelectFix', () => {
  it('trims a trailing space from an over-inclusive selection (the reported Windows bug)', () => {
    const el = document.createElement('p')
    el.textContent = 'hello world foo'
    document.body.appendChild(el)
    const text = el.firstChild!
    // Native over-selection on Windows: "world " (word + trailing space), same text node.
    const sel = selectRange(text, 6, text, 12)
    expect(sel.toString()).toBe('world ')
    fireDblclick()
    expect(window.getSelection()!.toString()).toBe('world')
  })

  it('trims multiple trailing whitespace characters', () => {
    const el = document.createElement('p')
    el.textContent = 'hello world   foo'
    document.body.appendChild(el)
    const text = el.firstChild!
    selectRange(text, 6, text, 14) // "world   "
    fireDblclick()
    expect(window.getSelection()!.toString()).toBe('world')
  })

  it('does not trim leading whitespace', () => {
    const el = document.createElement('p')
    el.textContent = 'hello  world foo'
    document.body.appendChild(el)
    const text = el.firstChild!
    selectRange(text, 5, text, 12) // "  world"
    fireDblclick()
    expect(window.getSelection()!.toString()).toBe('  world')
  })

  it('is a no-op when the selection already stops at the word boundary (Linux/Mac today)', () => {
    const el = document.createElement('p')
    el.textContent = 'hello world foo'
    document.body.appendChild(el)
    const text = el.firstChild!
    selectRange(text, 6, text, 11) // "world", no trailing space
    fireDblclick()
    expect(window.getSelection()!.toString()).toBe('world')
  })

  it('does not collapse a dblclick that selected only whitespace', () => {
    const el = document.createElement('p')
    el.textContent = 'hello   world'
    document.body.appendChild(el)
    const text = el.firstChild!
    selectRange(text, 5, text, 8) // pure whitespace run
    fireDblclick()
    expect(window.getSelection()!.toString()).toBe('   ')
  })

  it('trims correctly when the trailing space is in a DIFFERENT text node than the start', () => {
    // Simulates a word split across nodes by an inline marker (e.g. bold's ** expanding in IR):
    // startContainer is one text node, endContainer (holding the trailing space) is a sibling's.
    const el = document.createElement('p')
    const startText = document.createTextNode('word')
    const endText = document.createTextNode(' next')
    el.append(startText, endText)
    document.body.appendChild(el)
    selectRange(startText, 0, endText, 1) // "word" + " " from the sibling node
    fireDblclick()
    const sel = window.getSelection()!
    expect(sel.toString()).toBe('word')
  })

  it('ignores a selection whose endContainer is not a text node', () => {
    const el = document.createElement('div')
    el.innerHTML = '<p>one</p><p>two</p>'
    document.body.appendChild(el)
    const sel = selectRange(el, 0, el, 2) // element-offset range, not a text node
    fireDblclick()
    expect(window.getSelection()!.toString()).toBe(sel.toString())
  })

  it('leaves the selection alone if the end node was detached before the fix can re-apply it', () => {
    const el = document.createElement('p')
    el.textContent = 'world '
    document.body.appendChild(el)
    const text = el.firstChild as Text
    selectRange(text, 0, text, 6)
    el.remove() // simulate a Vditor DOM rebuild racing the same dblclick
    fireDblclick()
    // No throw, and nothing crashed re-applying a range into a detached node.
    expect(() => window.getSelection()!.toString()).not.toThrow()
  })

  it('does nothing when there is no selection', () => {
    expect(() => fireDblclick()).not.toThrow()
  })

  it('does nothing for a collapsed selection', () => {
    const el = document.createElement('p')
    el.textContent = 'hello'
    document.body.appendChild(el)
    const text = el.firstChild!
    selectRange(text, 2, text, 2)
    fireDblclick()
    expect(window.getSelection()!.isCollapsed).toBe(true)
  })

  it('dispose() removes the listener', () => {
    dispose?.()
    dispose = null
    const el = document.createElement('p')
    el.textContent = 'world '
    document.body.appendChild(el)
    const text = el.firstChild!
    selectRange(text, 0, text, 6)
    fireDblclick()
    expect(window.getSelection()!.toString()).toBe('world ')
  })

  it('is idempotent — installing twice does not double-trim or leak the old listener', () => {
    const disposeAgain = installDblclickWordSelectFix()
    const el = document.createElement('p')
    el.textContent = 'world '
    document.body.appendChild(el)
    const text = el.firstChild!
    selectRange(text, 0, text, 6)
    fireDblclick()
    expect(window.getSelection()!.toString()).toBe('world')
    disposeAgain()
  })
})

// The earliest-hook path (task 485, round 2): trimming only on `dblclick` visibly flashed the
// untrimmed selection for a frame before correcting it (user-reported). `selectionchange` fires
// earlier in the browser's input pipeline, so arm on the double-click's own `mousedown` and trim on
// the very next `selectionchange` — no `dblclick` involved at all in these tests.
describe('earliest-hook trim (mousedown detail=2 → selectionchange)', () => {
  it('trims on the first selectionchange after a double-click mousedown, before any dblclick fires', () => {
    const el = document.createElement('p')
    el.textContent = 'hello world foo'
    document.body.appendChild(el)
    const text = el.firstChild!
    fireMousedown(2)
    selectRange(text, 6, text, 12) // "world "
    fireSelectionchange()
    expect(window.getSelection()!.toString()).toBe('world')
  })

  it('does not arm on a single-click mousedown (detail=1)', () => {
    const el = document.createElement('p')
    el.textContent = 'hello world foo'
    document.body.appendChild(el)
    const text = el.firstChild!
    fireMousedown(1)
    selectRange(text, 6, text, 12) // "world " — not a double-click, must survive untouched
    fireSelectionchange()
    expect(window.getSelection()!.toString()).toBe('world ')
  })

  it('does not arm on a triple-click mousedown (detail=3) — line/paragraph selection is left alone', () => {
    const el = document.createElement('p')
    el.textContent = 'hello world foo '
    document.body.appendChild(el)
    const text = el.firstChild!
    fireMousedown(3)
    selectRange(text, 0, text, 16) // whole line, incl. its own trailing space
    fireSelectionchange()
    expect(window.getSelection()!.toString()).toBe('hello world foo ')
  })

  it('mouseup disarms — a selectionchange arriving after mouseup is not trimmed by this path', () => {
    const el = document.createElement('p')
    el.textContent = 'hello world foo'
    document.body.appendChild(el)
    const text = el.firstChild!
    fireMousedown(2)
    fireMouseup() // disarmed before the (late) selectionchange below
    selectRange(text, 6, text, 12) // "world "
    fireSelectionchange()
    expect(window.getSelection()!.toString()).toBe('world ')
  })

  it('disarms after trimming — a second, unrelated selectionchange in the same gesture is left alone', () => {
    const el = document.createElement('p')
    el.textContent = 'hello  world foo'
    document.body.appendChild(el)
    const text = el.firstChild!
    fireMousedown(2)
    selectRange(text, 7, text, 12) // "world", trims to nothing (already correct)
    fireSelectionchange()
    selectRange(text, 5, text, 12) // "  world" — leading whitespace, must never be touched
    fireSelectionchange()
    expect(window.getSelection()!.toString()).toBe('  world')
  })
})
