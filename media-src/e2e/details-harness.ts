import '../src/boot/preload'
import Vditor from 'vditor/src/index'
import { observeDetails } from '../src/editing/details'
import { setupHistoryKeybind } from '../src/editing/undo-keybind'
import {
  createSnippetHintExtension,
  DETAILS_SNIPPET_MARKDOWN,
  escapeSnippetSource,
  installSnippetHintUndoBoundary,
} from '../src/editing/snippet-templates'

const params = new URLSearchParams(location.search)
const requestedMode = params.get('mode')
const mode =
  requestedMode === 'wysiwyg' || requestedMode === 'sv' ? requestedMode : 'ir'
const snippet = params.get('snippet') === '1'
const initial = [
  '<details>',
  '<summary>More <em>info</em></summary>',
  '',
  'Body **bold**.',
  '',
  '- item',
  '',
  '</details>',
  '',
  '<details open>',
  '<summary>Open initially</summary>',
  '',
  'Visible body.',
  '',
  '</details>',
  '',
].join('\n')

let disposeDetails: (() => void) | undefined
let disposeSnippetUndo: (() => void) | undefined
const editor = new Vditor('app', {
  cache: { enable: false },
  cdn: `${location.origin}/vditor`,
  mode,
  value: snippet ? '' : initial,
  toolbar: ['preview', 'undo', 'redo'],
  hint: {
    parse: false,
    extend: [
      createSnippetHintExtension((markdown) => {
        const inner = editor.vditor
        if (inner.currentMode === 'sv') return escapeSnippetSource(markdown)
        return inner.currentMode === 'wysiwyg'
          ? inner.lute.SpinVditorDOM(markdown)
          : inner.lute.SpinVditorIRDOM(markdown)
      }),
    ],
  },
  customWysiwygToolbar: () => undefined,
  after() {
    ;(window as unknown as { vditor: Vditor }).vditor = editor
    disposeDetails?.()
    disposeDetails = observeDetails(document.getElementById('app'))
    setupHistoryKeybind(window)
    disposeSnippetUndo?.()
    disposeSnippetUndo = installSnippetHintUndoBoundary(document, () => {
      const inner = editor.vditor
      inner.undo.addToUndoStack(inner)
    })
    ;(window as any).__details = {
      editor,
      expected: snippet ? DETAILS_SNIPPET_MARKDOWN : initial,
    }
    ;(window as any).__ready = true
  },
})
