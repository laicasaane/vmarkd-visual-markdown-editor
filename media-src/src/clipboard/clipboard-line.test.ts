// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { expandToLine, installClipboardLine } from './clipboard-line'

function editorWith(html: string): HTMLElement {
  document.body.innerHTML = `<div class="vditor-ir__wrap" id="ed">${html}</div>`
  return document.getElementById('ed') as HTMLElement
}

/** Collapsed caret at `offset` inside the first text node of `selector`. */
function caretIn(root: ParentNode, selector: string, offset = 1) {
  const el = root.querySelector(selector) as HTMLElement
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const text = walker.nextNode() as Text
  const range = document.createRange()
  range.setStart(text, offset)
  range.collapse(true)
  const sel = window.getSelection()
  if (!sel) throw new Error('no selection')
  sel.removeAllRanges()
  sel.addRange(range)
}

function selectedText(): string {
  return window.getSelection()?.toString() ?? ''
}

beforeEach(() => {
  window.getSelection()?.removeAllRanges()
  document.body.innerHTML = ''
})

describe('expandToLine', () => {
  it('grows a collapsed caret to the whole paragraph', () => {
    const ed = editorWith('<p>first line</p><p>second line</p>')
    caretIn(ed, 'p')
    expect(expandToLine(ed)).toBe(true)
    expect(selectedText()).toBe('first line')
  })

  it('takes the paragraph the caret is actually in, not the first one', () => {
    const ed = editorWith('<p>first line</p><p>second line</p>')
    caretIn(ed, 'p:nth-of-type(2)')
    expect(expandToLine(ed)).toBe(true)
    expect(selectedText()).toBe('second line')
  })

  it.each([
    ['h2', '<h2>a heading</h2>', 'a heading'],
    ['li', '<ul><li>a bullet</li></ul>', 'a bullet'],
    ['blockquote', '<blockquote>quoted</blockquote>', 'quoted'],
    ['pre', '<pre><code>code line</code></pre>', 'code line'],
  ])('treats a %s as a line', (sel, html, expected) => {
    const ed = editorWith(html)
    caretIn(ed, sel === 'pre' ? 'code' : sel)
    expect(expandToLine(ed)).toBe(true)
    expect(selectedText()).toBe(expected)
  })

  it('takes the innermost block — a list item, not the whole list', () => {
    const ed = editorWith('<ul><li>one</li><li>two</li></ul>')
    caretIn(ed, 'li:nth-of-type(2)')
    expandToLine(ed)
    expect(selectedText()).toBe('two')
  })

  it('leaves a real selection exactly as the user made it', () => {
    const ed = editorWith('<p>hello world</p>')
    const text = ed.querySelector('p')?.firstChild as Text
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 5)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    expect(expandToLine(ed)).toBe(true)
    expect(selectedText(), 'the user selection is untouched').toBe('hello')
  })
})

describe('expandToLine — when it must refuse (so a cut deletes nothing)', () => {
  it('refuses on an empty block rather than selecting nothing', () => {
    const ed = editorWith('<p></p>')
    const range = document.createRange()
    range.selectNodeContents(ed.querySelector('p') as HTMLElement)
    range.collapse(true)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    expect(expandToLine(ed)).toBe(false)
  })

  it('refuses when the caret is outside this editor', () => {
    const ed = editorWith('<p>inside</p>')
    document.body.insertAdjacentHTML('beforeend', '<p id="out">outside</p>')
    caretIn(document, '#out')
    expect(expandToLine(ed)).toBe(false)
  })

  it('refuses when there is no selection at all', () => {
    const ed = editorWith('<p>text</p>')
    window.getSelection()?.removeAllRanges()
    expect(expandToLine(ed)).toBe(false)
  })

  it('refuses when there is no editor element', () => {
    editorWith('<p>text</p>')
    caretIn(document, 'p')
    expect(expandToLine(null)).toBe(false)
  })
})

describe('installClipboardLine', () => {
  it('exposes the helper under the name the Vditor patches call', () => {
    const win = window as unknown as Window & typeof globalThis
    installClipboardLine(win)
    const ed = editorWith('<p>a line</p>')
    caretIn(ed, 'p')
    const fn = (win as unknown as Record<string, unknown>)
      .__vmarkdExpandToLine as (el: HTMLElement | null) => boolean
    expect(fn(ed)).toBe(true)
    expect(selectedText()).toBe('a line')
  })

  it('reports TRUE on an internal error so Vditor keeps its own behaviour', () => {
    const win = window as unknown as Window & typeof globalThis
    installClipboardLine(win)
    const ed = editorWith('<p>a line</p>')
    caretIn(ed, 'p')
    const fn = (win as unknown as Record<string, unknown>)
      .__vmarkdExpandToLine as (el: unknown) => boolean
    // A collapsed caret gets as far as the containment check, where this argument throws.
    expect(fn({ contains: () => throwing() })).toBe(true)
  })
})

function throwing(): never {
  throw new Error('boom')
}

describe('the keydown expansion', () => {
  const press = (key: string, init: Partial<KeyboardEventInit> = {}) =>
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        ctrlKey: true,
        bubbles: true,
        ...init,
      }),
    )

  function irEditor(): HTMLElement {
    document.body.innerHTML =
      '<div class="vditor-ir"><div id="ed" contenteditable="true"><p>a line</p><p>other</p></div></div>'
    const ed = document.getElementById('ed') as HTMLElement
    ed.focus()
    return ed
  }

  beforeEach(() => {
    installClipboardLine(window as unknown as Window & typeof globalThis)
  })

  it('expands a collapsed caret on Ctrl+C', () => {
    const ed = irEditor()
    caretIn(ed, 'p')
    press('c')
    expect(selectedText()).toBe('a line')
  })

  it('expands a collapsed caret on Ctrl+X so Vditor cuts the whole block', () => {
    const ed = irEditor()
    caretIn(ed, 'p')
    press('x')
    expect(selectedText()).toBe('a line')
  })
})

describe('the cut intent recorded on keydown', () => {
  // The cut handler cannot read the live selection: VS Code's webview clipboard bridge answers
  // Ctrl+X by calling document.execCommand("cut") from a host-message handler, and by the time the
  // `cut` event arrives the selection reports collapsed === false even when the caret was collapsed.
  // Measured in a real VS Code — that is why the guard let a stealth backspace through. The
  // keystroke is the only unambiguous moment, so the answer is recorded there and read once.
  const press = (key: string, init: Partial<KeyboardEventInit> = {}) =>
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        ctrlKey: true,
        bubbles: true,
        ...init,
      }),
    )

  function irEditor(): HTMLElement {
    document.body.innerHTML =
      '<div class="vditor-ir"><div id="ed" contenteditable="true"><p>a line</p><p>other</p></div></div>'
    const ed = document.getElementById('ed') as HTMLElement
    ed.focus()
    return ed
  }

  const take = () =>
    (
      window as unknown as Record<string, () => boolean | undefined>
    ).__vmarkdTakeCutIntent()

  beforeEach(() => {
    installClipboardLine(window as unknown as Window & typeof globalThis)
    ;(window as unknown as Record<string, unknown>).__vmarkdCutIntent =
      undefined
  })

  it('records FALSE after expanding a collapsed caret, so the cut deletes the block', () => {
    const ed = irEditor()
    caretIn(ed, 'p')
    press('x')
    expect(take()).toBe(false)
  })

  it('records FALSE for a real selection, so the cut deletes as usual', () => {
    const ed = irEditor()
    const text = ed.querySelector('p')?.firstChild as Text
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 3)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    press('x')
    expect(take()).toBe(false)
  })

  it('is READ-ONCE — a second cut falls back to the live selection', () => {
    const ed = irEditor()
    caretIn(ed, 'p')
    press('x')
    expect(take()).toBe(false)
    expect(take(), 'a context-menu cut must not reuse a keystroke answer').toBe(
      undefined,
    )
  })

  it('goes stale, so an old keystroke cannot govern a much later cut', () => {
    const ed = irEditor()
    caretIn(ed, 'p')
    press('x')
    ;(
      window as unknown as Record<string, { collapsed: boolean; at: number }>
    ).__vmarkdCutIntent = { collapsed: true, at: Date.now() - 60_000 }
    expect(take()).toBe(undefined)
  })

  it('records nothing for Ctrl+C — only the cut path consumes this', () => {
    const ed = irEditor()
    caretIn(ed, 'p')
    press('c')
    expect(take()).toBe(undefined)
  })

  it('records nothing for Ctrl+Alt+X or a bare X', () => {
    const ed = irEditor()
    caretIn(ed, 'p')
    press('x', { altKey: true })
    expect(take()).toBe(undefined)
    press('x', { ctrlKey: false })
    expect(take()).toBe(undefined)
  })

  it('leaves a real selection alone on Ctrl+C', () => {
    const ed = irEditor()
    const text = ed.querySelector('p')?.firstChild as Text
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 1)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    press('c')
    expect(selectedText()).toBe('a')
  })

  it('ignores Ctrl+Alt+C and a bare C', () => {
    const ed = irEditor()
    caretIn(ed, 'p')
    press('c', { altKey: true })
    expect(selectedText()).toBe('')
    press('c', { ctrlKey: false })
    expect(selectedText()).toBe('')
  })
})
