import Vditor from 'vditor/src/index'
import { installUndoBoundaries } from '../src/editing/undo-boundaries'

const editor = new Vditor('app', {
  cache: { enable: false },
  mode: 'ir',
  height: 320,
  cdn: `${location.origin}/vditor`,
  value: '',
  undoDelay: 800,
  toolbar: ['bold', 'undo', 'redo'],
  customWysiwygToolbar: () => {
    /* Vditor calls this while constructing WYSIWYG controls. */
  },
  after() {
    ;(window as any).vditor = editor
    installUndoBoundaries(editor)
    const inner = (editor as unknown as { vditor: IVditor }).vditor
    const root = inner.ir.element
    const focusEnd = () => {
      root.focus()
      const range = document.createRange()
      range.selectNodeContents(root)
      range.collapse(false)
      const selection = getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
    }
    ;(window as any).__focusEnd = focusEnd
    ;(window as any).__value = () => editor.getValue()
    ;(window as any).__undo = () => inner.undo.undo(inner)
    ;(window as any).__redo = () => inner.undo.redo(inner)
    ;(window as any).__stack = () => ({
      undo: inner.undo[inner.currentMode].undoStack.length,
      redo: inner.undo[inner.currentMode].redoStack.length,
    })
    ;(window as any).__paste = (text: string) => {
      focusEnd()
      const data = new DataTransfer()
      data.setData('text/plain', text)
      return root.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      )
    }
    ;(window as any).__selectText = (needle: string) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const index = (node.textContent ?? '').indexOf(needle)
        if (index < 0) continue
        const range = document.createRange()
        range.setStart(node, index)
        range.setEnd(node, index + needle.length)
        const selection = getSelection()!
        selection.removeAllRanges()
        selection.addRange(range)
        return true
      }
      return false
    }
    focusEnd()
    ;(window as any).__ready = true
  },
})
