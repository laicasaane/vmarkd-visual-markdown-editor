import '../src/boot/preload'
import Vditor from 'vditor/src/index'
import {
  runRewrapCommand,
  runRewrapDocumentCommand,
  setupRewrapKeybind,
} from '../src/editing/rewrap-command'
import { setupHistoryKeybind } from '../src/editing/undo-keybind'
import { createAutoWrapController } from '../src/editing/auto-wrap'
import { getCursorSourceOffset } from '../src/util/source-map'

const params = new URLSearchParams(location.search)
const requestedMode = params.get('mode')
const mode =
  requestedMode === 'sv' || requestedMode === 'wysiwyg' ? requestedMode : 'ir'
const auto = params.get('auto') === '1'
const wholeDocument = params.get('whole') === '1'
const requestedColumn = Number(params.get('column') ?? 12)
const column =
  Number.isFinite(requestedColumn) && requestedColumn > 0 ? requestedColumn : 12
;(window as any).__vmdeLiveLineBreaks = auto
let syncs = 0
let error = ''

const run = () =>
  runRewrapCommand(window, {
    column,
    setApplying: () => {
      // Harness has no competing host update to suppress.
    },
    invalidate: () => {
      // Harness does not install the production incremental serializer.
    },
    scheduleSync: () => {
      syncs++
    },
    syncExact: () => {
      syncs++
    },
    onError: (reason) => {
      error = String(reason)
    },
  })

const runDocument = () =>
  runRewrapDocumentCommand(window, {
    column: 18,
    setApplying: () => {
      // Harness has no competing host update to suppress.
    },
    invalidate: () => {
      // Harness does not install the production incremental serializer.
    },
    scheduleSync: () => {
      syncs++
    },
    syncExact: () => {
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
  value: wholeDocument
    ? [
        '---',
        'title: protected alpha beta gamma',
        '---',
        '# Heading',
        '',
        'first alpha beta gamma delta epsilon',
        '',
        'middle alpha beta gamma delta epsilon',
        '',
        '> quote alpha beta gamma delta',
        '',
        '- list alpha beta gamma delta',
        '',
        'hard alpha  ',
        'hard beta gamma',
        '',
        '```js',
        'const protected = "alpha beta gamma delta"',
        '```',
        '',
        '| alpha | beta |',
        '| --- | --- |',
        '',
        '$$',
        'alpha beta gamma',
        '$$',
        '',
        'tail alpha beta gamma delta epsilon',
      ].join('\n')
    : auto
      ? [
          'alpha beta gamma delta epsilon',
          '',
          'two-space alpha  ',
          'two-space beta',
          '',
          'backslash alpha\\',
          'backslash beta',
          '',
        ].join('\n')
      : 'alpha beta gamma delta epsilon\n\nTail paragraph.\n',
  toolbar: ['edit-mode', 'undo', 'redo'],
  customWysiwygToolbar: () => {
    // Vditor 3.11 requires the hook even when the harness adds no custom controls.
  },
  after() {
    ;(window as unknown as { vditor: Vditor }).vditor = editor
    setupHistoryKeybind(window)
    setupRewrapKeybind(window, run)
    if (auto) {
      const controller = createAutoWrapController({
        captureTarget: () => {
          const inner = editor.vditor
          const root = inner[inner.currentMode].element as HTMLElement
          const selection = window.getSelection()
          if (!selection?.anchorNode || !root.contains(selection.anchorNode)) {
            return null
          }
          return {
            mode: inner.currentMode,
            root,
            node: selection.anchorNode,
            offset: selection.anchorOffset,
            markdown: editor.getValue(),
          }
        },
        isTargetCurrent: (target) => {
          const inner = editor.vditor
          const selection = window.getSelection()
          return (
            inner.currentMode === target.mode &&
            inner[inner.currentMode].element === target.root &&
            target.root.isConnected &&
            selection?.anchorNode === target.node &&
            selection.anchorOffset === target.offset &&
            editor.getValue() === target.markdown
          )
        },
        apply: run,
        onError: (reason) => {
          error = String(reason)
        },
      })
      controller.updateConfig({ enabled: true, delayMs: 500, column })
      document.addEventListener('input', (event) => {
        const input = event as InputEvent
        controller.handleInput({
          inputType: input.inputType,
          isComposing: input.isComposing,
        })
      })
      document.addEventListener('compositionstart', () => {
        controller.handleCompositionStart()
      })
      document.addEventListener('compositionend', () => {
        controller.handleCompositionEnd()
      })
    }
    ;(window as any).__rewrap = {
      editor,
      initial: editor.getValue(),
      run,
      runDocument,
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
