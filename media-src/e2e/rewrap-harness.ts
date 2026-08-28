import '../src/boot/preload'
import Vditor from 'vditor/src/index'
import {
  runRewrapCommand,
  setupRewrapKeybind,
} from '../src/editing/rewrap-command'
import { getCursorSourceOffset } from '../src/util/source-map'

const requestedMode = new URLSearchParams(location.search).get('mode')
const mode =
  requestedMode === 'sv' || requestedMode === 'wysiwyg' ? requestedMode : 'ir'
let syncs = 0
let error = ''

const run = () =>
  runRewrapCommand(window, {
    column: 12,
    setApplying: () => {
      // Harness has no competing host update to suppress.
    },
    invalidate: () => {
      // Harness does not install the production incremental serializer.
    },
    scheduleSync: () => {
      syncs++
    },
    onError: (reason) => {
      error = String(reason)
    },
  })

const editor = new Vditor('app', {
  cache: { enable: false },
  mode,
  cdn: `${location.origin}/vditor`,
  value: 'alpha beta gamma delta epsilon\n\nTail paragraph.\n',
  toolbar: ['edit-mode', 'undo', 'redo'],
  customWysiwygToolbar: () => {
    // Vditor 3.11 requires the hook even when the harness adds no custom controls.
  },
  after() {
    ;(window as unknown as { vditor: Vditor }).vditor = editor
    setupRewrapKeybind(window, run)
    ;(window as any).__rewrap = {
      editor,
      initial: editor.getValue(),
      run,
      state: () => ({ syncs, error }),
      cursorOffset: () => {
        if (editor.vditor.currentMode !== 'sv') {
          return getCursorSourceOffset(editor)
        }
        const root = editor.vditor.sv.element
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return -1
        const caret = selection.getRangeAt(0)
        const before = caret.cloneRange()
        before.selectNodeContents(root)
        before.setEnd(caret.startContainer, caret.startOffset)
        return before.toString().length
      },
    }
    ;(window as any).__ready = true
  },
})
