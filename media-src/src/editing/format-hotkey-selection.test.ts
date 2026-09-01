// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  restoreFormatHotkeySelection,
  setupFormatHotkeyGuard,
} from './format-hotkey-guard'

describe('format hotkey selection bridge', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="editor" contenteditable="true">Hello world.</div>'
    const editor = document.getElementById('editor') as HTMLElement
    ;(window as any).vditor = {
      vditor: { currentMode: 'ir', ir: { element: editor } },
    }
  })

  it('restores the exact keydown selection after the host command bridge collapses it', () => {
    const editor = document.getElementById('editor') as HTMLElement
    const text = editor.firstChild as Text
    const selected = document.createRange()
    selected.setStart(text, 6)
    selected.setEnd(text, 11)
    const selection = getSelection()!
    selection.removeAllRanges()
    selection.addRange(selected)
    setupFormatHotkeyGuard(window)

    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'b',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )
    const collapsed = document.createRange()
    collapsed.setStart(text, 6)
    collapsed.collapse(true)
    selection.removeAllRanges()
    selection.addRange(collapsed)

    expect(restoreFormatHotkeySelection('bold')).toBe(true)
    expect(selection.toString()).toBe('world')
  })
})
