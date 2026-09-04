import '../src/boot/preload'
import Vditor from 'vditor/src/index'
import { observeDetails } from '../src/editing/details'
import { fixResponsiveTables } from '../src/chrome/responsive-tables'
import { setupHistoryKeybind } from '../src/editing/undo-keybind'
import { createToolbar } from '../src/chrome/toolbar'
import {
  configureDetailsToggle,
  installDetailsToggleControls,
} from '../src/editing/details-toggle'
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
const tableCase = params.get('table') === '1'
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
  'Toolbar body **exact**.',
  '',
  '- toolbar item',
  '',
].join('\n')
const tableInitial = [
  '<details>',
  '<summary>Table details</summary>',
  '',
  'Before table.',
  '',
  '| Key | Value |',
  '| --- | --- |',
  '| one | two |',
  '',
  '```text',
  'after table',
  '```',
  '',
  '</details>',
  '',
].join('\n')

let disposeDetails: (() => void) | undefined
let disposeSnippetUndo: (() => void) | undefined
let disposeToggle: (() => void) | undefined
let syncs = 0
const editor = new Vditor('app', {
  cache: { enable: false },
  cdn: `${location.origin}/vditor`,
  mode,
  value: snippet ? '' : tableCase ? tableInitial : initial,
  toolbar: createToolbar(),
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
    fixResponsiveTables()
    disposeDetails?.()
    disposeDetails = observeDetails(document.getElementById('app'))
    setupHistoryKeybind(window)
    disposeSnippetUndo?.()
    disposeSnippetUndo = installSnippetHintUndoBoundary(document, () => {
      const inner = editor.vditor
      inner.undo.addToUndoStack(inner)
    })
    configureDetailsToggle({
      setApplying: () => undefined,
      postExact: () => {
        syncs++
      },
      snapshotMarkdown: () => editor.getValue(),
      onError: (error) => {
        throw error
      },
    })
    disposeToggle?.()
    disposeToggle = installDetailsToggleControls()
    ;(window as any).__details = {
      editor,
      expected: snippet
        ? DETAILS_SNIPPET_MARKDOWN
        : tableCase
          ? tableInitial
          : initial,
      syncs: () => syncs,
    }
    ;(window as any).__ready = true
  },
})
