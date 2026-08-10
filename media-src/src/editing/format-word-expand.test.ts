// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  caretTextOffset,
  expandCollapsedSelectionToWord,
  installFormatWordExpand,
  isInsideInlineFormat,
  wordRangeInText,
} from './format-word-expand'

describe('wordRangeInText', () => {
  it('expands from inside a word to its whitespace-delimited boundaries', () => {
    expect(wordRangeInText('hello world', 7)).toEqual([6, 11])
  })
  it('expands from the start edge of a word', () => {
    expect(wordRangeInText('hello world', 6)).toEqual([6, 11])
  })
  it('expands from the end edge of a word', () => {
    expect(wordRangeInText('hello world', 5)).toEqual([0, 5])
  })
  it('expands a lone word at either of its edges', () => {
    expect(wordRangeInText('hello', 0)).toEqual([0, 5])
    expect(wordRangeInText('hello', 5)).toEqual([0, 5])
  })
  it('treats an unbroken run (no whitespace) as one word', () => {
    expect(wordRangeInText('helloworld', 5)).toEqual([0, 10])
  })
  it('expands a caret immediately after a word (before the following space) — Word-consistent', () => {
    // "hello| world" — the caret sits between the last letter and the space; Word bolds "hello".
    expect(wordRangeInText('hello world', 5)).toEqual([0, 5])
  })
  it('returns null for a caret parked in the middle of a space run', () => {
    expect(wordRangeInText('aa  bb', 3)).toBeNull() // offset 3 = the second of the two spaces
    expect(wordRangeInText('hello  world', 6)).toBeNull()
  })
  it('returns null for an empty text node', () => {
    expect(wordRangeInText('', 0)).toBeNull()
  })
  it('returns null for an out-of-range offset', () => {
    expect(wordRangeInText('hello', -1)).toBeNull()
    expect(wordRangeInText('hello', 6)).toBeNull()
  })
})

// A minimal editable + toolbar in the jsdom page; `window.vditor` is stubbed to what
// activeModeElement(window.vditor) needs (current mode -> its element).
function setupEditorPage() {
  const editor = document.createElement('div')
  editor.setAttribute('contenteditable', 'true')
  editor.textContent = 'hello world'
  document.body.appendChild(editor)

  const toolbar = document.createElement('div')
  toolbar.setAttribute('role', 'toolbar')
  for (const type of ['bold', 'italic', 'strike', 'quote']) {
    const b = document.createElement('button')
    b.setAttribute('data-type', type)
    toolbar.appendChild(b)
  }
  document.body.appendChild(toolbar)

  ;(window as unknown as { vditor?: unknown }).vditor = {
    vditor: { currentMode: 'ir', ir: { element: editor } },
  }
  return { editor, toolbar, textNode: editor.firstChild as Text }
}

function placeCaret(node: Node, offset: number) {
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
  return sel!
}

afterEach(() => {
  document.body.replaceChildren()
  ;(window as unknown as { vditor?: unknown }).vditor = undefined
})

describe('expandCollapsedSelectionToWord', () => {
  it('expands a collapsed caret inside a word', () => {
    const { editor, textNode } = setupEditorPage()
    const sel = placeCaret(textNode, 7) // inside "world"
    expect(expandCollapsedSelectionToWord(sel, editor)).toBe(true)
    expect(sel.isCollapsed).toBe(false)
    expect(sel.toString()).toBe('world')
  })

  it("expands an empty range built WITHOUT collapse() — Vditor's caret representation", () => {
    // MEASURED in the real webview (task 506): Vditor's caret restoration leaves the caret as a
    // non-collapsed EMPTY range (`setStart` + `setEnd` at the same offset, no `collapse()`; the
    // only way to tell it apart from a real selection is `range.toString() === ''`). This must
    // expand too, or the feature dies in the real editor. (jsdom collapses start===end ranges
    // automatically, so `isCollapsed` here is true — the empty-text semantics are what matter.)
    const { editor, textNode } = setupEditorPage()
    const range = document.createRange()
    range.setStart(textNode, 7) // inside "world"
    range.setEnd(textNode, 7) // no collapse()
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    expect(range.toString()).toBe('')
    expect(expandCollapsedSelectionToWord(sel, editor)).toBe(true)
    expect(sel.toString()).toBe('world')
  })

  it('re-joins a word split across adjacent text nodes (Vditor splits at the caret) and trims trailing punctuation', () => {
    // Real-webview shape (task 506): Vditor splits the containing text node at the caret, so a
    // caret mid-word sits at the boundary of e.g. "Hello wo" | "rld.". The word must re-join across
    // the direct text siblings, and the trailing "." must stay OUTSIDE the wrap.
    const editor = document.createElement('div')
    editor.append('Hello wo', 'rld.') // two adjacent text nodes = "Hello world."
    document.body.appendChild(editor)
    const first = editor.firstChild as Text
    const sel = placeCaret(first, 8) // end of "Hello wo" — inside "world"
    expect(expandCollapsedSelectionToWord(sel, editor)).toBe(true)
    expect(sel.toString()).toBe('world')
  })

  it('trims trailing punctuation from a single-node word (caret in "world" of "Hello world.")', () => {
    const editor = document.createElement('div')
    editor.textContent = 'Hello world.'
    document.body.appendChild(editor)
    const textNode = editor.firstChild as Text
    const sel = placeCaret(textNode, 8) // between 'o' and 'r' of "world"
    expect(expandCollapsedSelectionToWord(sel, editor)).toBe(true)
    expect(sel.toString()).toBe('world')
  })

  it('leaves a non-collapsed selection alone', () => {
    const { editor, textNode } = setupEditorPage()
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, 5)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    expect(expandCollapsedSelectionToWord(sel, editor)).toBe(false)
    expect(sel.toString()).toBe('hello')
  })

  it('leaves an element-container caret alone (no text node)', () => {
    const { editor } = setupEditorPage()
    const sel = placeCaret(editor, 0)
    expect(expandCollapsedSelectionToWord(sel, editor)).toBe(false)
  })

  it('leaves a caret outside the editor alone', () => {
    const { editor } = setupEditorPage()
    const other = document.createElement('div')
    other.textContent = 'elsewhere'
    document.body.appendChild(other)
    const sel = placeCaret(other.firstChild as Text, 2)
    expect(expandCollapsedSelectionToWord(sel, editor)).toBe(false)
  })

  it('leaves a caret parked in the middle of a space run alone', () => {
    const editor = document.createElement('div')
    editor.textContent = 'hello  world'
    document.body.appendChild(editor)
    const textNode = editor.firstChild as Text
    const sel = placeCaret(textNode, 6) // between the two spaces
    expect(expandCollapsedSelectionToWord(sel, editor)).toBe(false)
    expect(sel.isCollapsed).toBe(true)
  })
})

describe('installFormatWordExpand', () => {
  it('registers a capture-phase click listener', () => {
    const add = vi.spyOn(window.document, 'addEventListener')
    const teardown = installFormatWordExpand()
    expect(add).toHaveBeenCalledWith(
      'click',
      expect.any(Function),
      true, // capture — must run before Vditor's bubble-phase MenuItem handler
    )
    teardown()
  })

  it('word-expands before a bold/italic/strike button click (real click)', () => {
    const { editor, toolbar, textNode } = setupEditorPage()
    const teardown = installFormatWordExpand()
    placeCaret(textNode, 7) // inside "world"
    toolbar.querySelector('button[data-type="bold"]')!.click()
    const sel = window.getSelection()!
    expect(editor.contains(sel.anchorNode)).toBe(true)
    expect(sel.toString()).toBe('world')
    teardown()
  })

  it('word-expands for the hotkey path — a synthetic click dispatched on the button', () => {
    const { toolbar, textNode } = setupEditorPage()
    const teardown = installFormatWordExpand()
    placeCaret(textNode, 0) // start edge of "hello"
    const button = toolbar.querySelector('button[data-type="strike"]')!
    button.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    )
    const sel = window.getSelection()!
    expect(sel.toString()).toBe('hello')
    teardown()
  })

  it('ignores clicks on non-word-format buttons (quote)', () => {
    const { toolbar, textNode } = setupEditorPage()
    const teardown = installFormatWordExpand()
    const sel = placeCaret(textNode, 7)
    toolbar.querySelector('button[data-type="quote"]')!.click()
    expect(sel.toString()).toBe('') // still collapsed — quote is not in WORD_FORMAT_BUTTONS
    expect(sel.isCollapsed).toBe(true)
    teardown()
  })

  it('does not disturb an existing non-collapsed selection', () => {
    const { toolbar, textNode } = setupEditorPage()
    const teardown = installFormatWordExpand()
    const range = document.createRange()
    range.setStart(textNode, 6)
    range.setEnd(textNode, 11)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    toolbar.querySelector('button[data-type="italic"]')!.click()
    expect(sel.toString()).toBe('world')
    teardown()
  })

  it('stops expanding after teardown', () => {
    const { editor, toolbar, textNode } = setupEditorPage()
    const teardown = installFormatWordExpand()
    teardown()
    const sel = placeCaret(textNode, 7)
    toolbar.querySelector('button[data-type="bold"]')!.click()
    expect(sel.isCollapsed).toBe(true) // listener removed — selection untouched
    expect(editor.contains(sel.anchorNode)).toBe(true)
  })

  it('schedules the caret restore (setTimeout 0) after a word-format click', () => {
    const { toolbar, textNode } = setupEditorPage()
    const teardown = installFormatWordExpand()
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout')
    placeCaret(textNode, 7) // inside "world"
    toolbar.querySelector('button[data-type="bold"]')!.click()
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 0)
    teardown()
  })

  it('does not schedule a caret restore when the selection is already a real one', () => {
    const { toolbar, textNode } = setupEditorPage()
    const teardown = installFormatWordExpand()
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout')
    const range = document.createRange()
    range.setStart(textNode, 6)
    range.setEnd(textNode, 11)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    const callsBefore = setTimeoutSpy.mock.calls.length
    toolbar.querySelector('button[data-type="italic"]')!.click()
    // No expansion → no restore to schedule. Measured as a delta: jsdom/vitest call setTimeout
    // for their own reasons, so an absolute "not called" assertion is noise-prone.
    expect(setTimeoutSpy.mock.calls.length).toBe(callsBefore)
    teardown()
  })
})

describe('caretTextOffset', () => {
  it('returns the absolute char offset of the caret within the editor', () => {
    const { editor, textNode } = setupEditorPage() // "hello world"
    expect(caretTextOffset(editor, placeCaret(textNode, 0))).toBe(0)
    expect(caretTextOffset(editor, placeCaret(textNode, 7))).toBe(7)
    expect(caretTextOffset(editor, placeCaret(textNode, 11))).toBe(11)
  })

  it('returns -1 for a selection outside the editor', () => {
    const { editor } = setupEditorPage()
    const other = document.createElement('div')
    other.textContent = 'x'
    document.body.appendChild(other)
    expect(
      caretTextOffset(editor, placeCaret(other.firstChild as Text, 0)),
    ).toBe(-1)
  })
})

describe('isInsideInlineFormat', () => {
  it('detects a caret inside a bolded word', () => {
    const editor = document.createElement('div')
    editor.innerHTML = 'Hello <strong data-type="strong">world</strong>.'
    document.body.appendChild(editor)
    const strong = editor.querySelector('strong')!.firstChild as Text
    expect(isInsideInlineFormat(strong, 'bold')).toBe(true)
    expect(isInsideInlineFormat(strong, 'italic')).toBe(false)
  })

  it('is false for plain text', () => {
    const editor = document.createElement('div')
    editor.textContent = 'plain'
    document.body.appendChild(editor)
    expect(isInsideInlineFormat(editor.firstChild as Text, 'bold')).toBe(false)
  })
})
