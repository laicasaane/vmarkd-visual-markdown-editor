// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { installEditorCaretTracking } from './editor-caret'
import { installFocusRestore } from './focus-restore'

/**
 * A minimal stand-in for the live editor: `activeModeElement` reads
 * `vditor.vditor[currentMode].element`, so that is all the shape this needs.
 */
function mountEditor(html = '<p id="para">hello world</p>'): HTMLElement {
  document.body.innerHTML = `<div class="vditor-ir"><pre id="ed" contenteditable="true">${html}</pre></div>`
  const editor = document.getElementById('ed') as HTMLElement
  ;(window as unknown as Record<string, unknown>).vditor = {
    vditor: { currentMode: 'ir', ir: { element: editor } },
  }
  return editor
}

/** Collapsed caret at `offset` in the first text node under `el`. */
function caretIn(el: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const text = walker.nextNode() as Text
  const range = document.createRange()
  range.setStart(text, offset)
  range.collapse(true)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

/**
 * Fire the window focus event and let the rAF the handler defers on run. jsdom implements
 * requestAnimationFrame as a timer, so awaiting two macrotasks is enough.
 */
async function refocusWindow() {
  window.dispatchEvent(new Event('focus'))
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 20))
}

beforeEach(() => {
  document.body.innerHTML = ''
  window.getSelection()?.removeAllRanges()
  ;(window as unknown as Record<string, unknown>).vditor = undefined
})

describe('installFocusRestore', () => {
  it('gives focus back to the editor when it returns to a bare BODY', async () => {
    const editor = mountEditor()
    caretIn(editor, 5)
    installFocusRestore(window)
    // The measured post-return state: the selection survived, focus did not.
    ;(document.body as HTMLElement).focus()
    expect(document.activeElement).not.toBe(editor)

    await refocusWindow()
    expect(document.activeElement).toBe(editor)
  })

  it('keeps the surviving caret where it is instead of resetting it to the start', async () => {
    const editor = mountEditor()
    caretIn(editor, 5)
    installFocusRestore(window)
    ;(document.body as HTMLElement).focus()

    await refocusWindow()
    const range = window.getSelection()!.getRangeAt(0)
    expect(range.startOffset).toBe(5)
    expect(range.collapsed).toBe(true)
  })

  it('does nothing when focus is already inside the editor', async () => {
    const editor = mountEditor()
    installFocusRestore(window)
    // Focus FIRST, then place the caret: focusing a contenteditable collapses the selection to its
    // start (jsdom does, and Chromium is allowed to) — which is precisely why the restore snapshots
    // the Range before it calls focus().
    editor.focus()
    caretIn(editor, 3)

    await refocusWindow()
    expect(document.activeElement).toBe(editor)
    expect(window.getSelection()!.getRangeAt(0).startOffset).toBe(3)
  })

  it('does NOT steal focus from another focusable element in the webview', async () => {
    // A toolbar input, a dialog field: focus is there because the user put it there. Restoring the
    // caret must never be a reason to take it away.
    const editor = mountEditor()
    caretIn(editor, 2)
    const input = document.createElement('input')
    document.body.appendChild(input)
    installFocusRestore(window)
    input.focus()

    await refocusWindow()
    expect(document.activeElement).toBe(input)
  })

  it('falls back to the tracked caret when no Range survived at all', async () => {
    // The webview was re-created rather than retained (or focus was never in the editor), so there
    // is nothing to snapshot. editor-caret.ts keeps the last in-editor caret for exactly this case.
    const editor = mountEditor()
    installEditorCaretTracking()
    caretIn(editor, 7)
    document.dispatchEvent(new Event('selectionchange'))
    installFocusRestore(window)

    window.getSelection()!.removeAllRanges()
    ;(document.body as HTMLElement).focus()

    await refocusWindow()
    expect(document.activeElement).toBe(editor)
    const sel = window.getSelection()!
    expect(sel.rangeCount, 'a caret was put back').toBe(1)
    expect(sel.getRangeAt(0).startOffset).toBe(7)
  })

  it('does NOT grab focus at open, when the caret was never in the editor', async () => {
    // The handler also runs on the webview's FIRST focus after open. Taking focus there would be a
    // new behaviour rather than a repair — the user has not aimed any keys at the editor yet, and
    // Space/PageDown over a freshly opened document is meant to scroll it.
    mountEditor()
    installFocusRestore(window)
    ;(document.body as HTMLElement).focus()

    await refocusWindow()
    expect(document.activeElement).toBe(document.body)
  })

  it('is inert when no editor is mounted', async () => {
    document.body.innerHTML = '<div>no vditor here</div>'
    installFocusRestore(window)
    await expect(refocusWindow()).resolves.toBeUndefined()
  })
})
