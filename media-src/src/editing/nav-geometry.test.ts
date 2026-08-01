// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { caretLineRect, topLevelBlock } from './nav-geometry'

// jsdom has no layout engine at all: Range has neither getBoundingClientRect nor getClientRects
// (both throw "is not a function" — verified, not assumed), and Element.getBoundingClientRect
// always returns an all-zero rect (see caret.ts's header comment for the same finding in a
// different module). caretLineRect's whole job is falling back through exactly that kind of
// zero-height signal, so real jsdom Range objects can't exercise it — build a minimal fake that
// implements only the members caretLineRect touches (getBoundingClientRect, startContainer,
// startOffset, cloneRange → setEnd/setStart/getClientRects), backed by REAL DOM nodes for the
// container/parent-element lookups jsdom does support. Assertions compare returned rects by
// REFERENCE (toBe against a captured object), not by deep-equality on a fabricated DOMRect —
// DOMRect carries a toJSON method, and two structurally-identical-but-distinct function values
// are not toEqual-equal, which would make a naive deep comparison flaky for the wrong reason.
function rect(height: number): DOMRect {
  return { height } as DOMRect
}

function fakeRange(opts: {
  ownRect: DOMRect
  startContainer: Node
  startOffset: number
  cloneRects?: DOMRect[] // undefined = cloneRange()'s getClientRects() throws
}) {
  const setEnd = vi.fn()
  const setStart = vi.fn()
  const clone = {
    setEnd,
    setStart,
    getClientRects: () => {
      if (!opts.cloneRects) throw new Error('no layout engine')
      return opts.cloneRects
    },
  }
  const range = {
    getBoundingClientRect: () => opts.ownRect,
    startContainer: opts.startContainer,
    startOffset: opts.startOffset,
    cloneRange: () => clone,
  }
  return { range: range as unknown as Range, setEnd, setStart }
}

describe('caretLineRect', () => {
  it('returns the range’s own rect directly when it already has height', () => {
    const own = rect(16)
    const { range } = fakeRange({
      ownRect: own,
      startContainer: document.createTextNode('hello'),
      startOffset: 2,
    })
    expect(caretLineRect(range)).toBe(own)
  })

  it('forward fallback: offset before the end of the text expands via setEnd', () => {
    const text = document.createTextNode('hello') // length 5
    const last = rect(14)
    const { range, setEnd, setStart } = fakeRange({
      ownRect: rect(0),
      startContainer: text,
      startOffset: 2, // < length → forward branch
      cloneRects: [rect(0), last],
    })
    expect(caretLineRect(range)).toBe(last) // the LAST rect of the expanded range
    expect(setEnd).toHaveBeenCalledWith(text, 3) // offset + 1
    expect(setStart).not.toHaveBeenCalled()
  })

  it('backward fallback: offset at the end of the text expands via setStart', () => {
    const text = document.createTextNode('hello') // length 5
    const last = rect(14)
    const { range, setEnd, setStart } = fakeRange({
      ownRect: rect(0),
      startContainer: text,
      startOffset: 5, // === length → not < length, and > 0 → backward branch
      cloneRects: [last],
    })
    expect(caretLineRect(range)).toBe(last)
    expect(setStart).toHaveBeenCalledWith(text, 4) // offset - 1
    expect(setEnd).not.toHaveBeenCalled()
  })

  it('element-box last resort: startContainer is an element (no text-node branch at all)', () => {
    const parent = document.createElement('div')
    const el = document.createElement('p')
    parent.appendChild(el)
    const elRect = rect(22)
    el.getBoundingClientRect = () => elRect
    const { range } = fakeRange({
      ownRect: rect(0),
      startContainer: el,
      startOffset: 0,
    })
    expect(caretLineRect(range)).toBe(elRect)
  })

  it('element-box last resort: text node whose expanded range yields no client rects', () => {
    const parent = document.createElement('div')
    const text = document.createTextNode('hi')
    parent.appendChild(text)
    const parentRect = rect(18)
    parent.getBoundingClientRect = () => parentRect
    const { range } = fakeRange({
      ownRect: rect(0),
      startContainer: text,
      startOffset: 0,
      cloneRects: [], // measurable expansion failed — falls through to the parent element's box
    })
    expect(caretLineRect(range)).toBe(parentRect)
  })

  it('element-box last resort: cloneRange/getClientRects throwing is swallowed, not propagated', () => {
    const parent = document.createElement('div')
    const text = document.createTextNode('hi')
    parent.appendChild(text)
    const parentRect = rect(9)
    parent.getBoundingClientRect = () => parentRect
    // cloneRects left undefined → the fake's getClientRects throws, exercising the try/catch
    const { range } = fakeRange({
      ownRect: rect(0),
      startContainer: text,
      startOffset: 0,
    })
    expect(() => caretLineRect(range)).not.toThrow()
    expect(caretLineRect(range)).toBe(parentRect)
  })

  it('returns null when there is no text node and no element to fall back to', () => {
    // A startContainer that is a text node detached from any element parent — the last-resort
    // `el` lookup (t.parentElement) has nothing to measure.
    const text = document.createTextNode('orphan')
    const { range } = fakeRange({
      ownRect: rect(0),
      startContainer: text,
      startOffset: 0,
      cloneRects: [],
    })
    expect(caretLineRect(range)).toBeNull()
  })
})

describe('topLevelBlock', () => {
  function editorWith(innerHTML: string): HTMLElement {
    const el = document.createElement('div')
    el.innerHTML = innerHTML
    document.body.replaceChildren(el)
    return el
  }

  it('returns the direct child of the editor that contains a deeply nested text node', () => {
    const editor = editorWith(
      '<blockquote><p>a <strong>quote</strong></p></blockquote>',
    )
    const deepText = editor.querySelector('strong')!.firstChild!
    const block = topLevelBlock(editor, deepText)
    expect(block).toBe(editor.firstElementChild)
    expect(block?.tagName).toBe('BLOCKQUOTE')
  })

  it('returns the node itself when it is already the top-level block', () => {
    const editor = editorWith('<p>text</p>')
    const p = editor.firstElementChild!
    expect(topLevelBlock(editor, p)).toBe(p)
  })

  it('resolves an element start node the same way as a text node (parentElement branch)', () => {
    const editor = editorWith('<p><em>x</em></p>')
    const em = editor.querySelector('em')!
    expect(topLevelBlock(editor, em)).toBe(editor.firstElementChild)
  })

  it('returns null when the node is outside the editor entirely', () => {
    const editor = editorWith('<p>text</p>')
    const outsider = document.createElement('span')
    document.body.appendChild(outsider) // a sibling of editor, not inside it
    expect(topLevelBlock(editor, outsider)).toBeNull()
  })

  it('returns null for a fully detached node (no parent chain at all)', () => {
    const editor = editorWith('<p>text</p>')
    const detached = document.createTextNode('nowhere')
    expect(topLevelBlock(editor, detached)).toBeNull()
  })
})
