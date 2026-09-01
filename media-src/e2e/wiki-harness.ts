import '../src/boot/preload'
// Source import keeps the wiki harness on the same anchored Vditor patches as production.
import Vditor from 'vditor/src/index'
import {
  setupCustomRenderer,
  wikiHintItems,
  wikiTextToHtml,
} from '../src/links/custom-renderer'
import {
  patchLuteSerialize,
  setKnownPagesRef,
} from '../src/links/wiki-serialize'
import { fixLinkClick } from '../src/links/link-click-fix'
import {
  installLinkOpenGate,
  applyLinkOpenSetting,
} from '../src/links/link-open-policy'

// preload.ts's initVsCodeApi() call (task 470) picks up the spec's acquireVsCodeApi stub.
const knownPages = new Set<string>()

const value = [
  '# Wiki test page',
  '',
  'A link to [[Home]] and one to [[Missing Page]].',
  '',
  'A pipe link: [[Target|Display Label]].',
  '',
  'Multiple on one line: [[Alpha]] and [[Beta]] and [[Gamma]].',
  '',
  'Inline with text before [[Page A]] and after.',
  '',
  'Nested in bold: **see [[Bold Link]]**.',
  '',
  '### Navigate a document or a knowledge base',
  '',
  '- A built-in outline panel and a Markdown Outline tree in the Explorer sidebar.',
  '- Hoist one heading section into a focused IR/WYSIWYG view, then return through',
  '  its `Doc › …` breadcrumb without changing the complete file on disk.',
  '- Wiki-style `[[links]]` with completion, navigation, ambiguity handling, and',
  '  one-click creation of missing pages.',
  '- Document search with `Ctrl/Cmd+F`, heading highlights, and optional heading-level',
  '  markers.',
  '- Live word count, estimated reading time, current mode, and large-file status.',
  '',
].join('\n')

for (const k of [
  'home',
  'alpha',
  'beta',
  'target',
  'getting-started',
  'sub/deep-page',
])
  knownPages.add(k)

// 'sub/Deep Page' models a path-qualified display name (duplicate-basename case):
// the host sends the relative path so the autocomplete entry is distinguishable
// and the inserted [[sub/Deep Page]] resolves to exactly one file.
const hintPages = new Set([
  'Home',
  'Alpha',
  'Beta',
  'Target',
  'Getting Started',
  'sub/Deep Page',
])
;(window as any).__knownPages = knownPages
;(window as any).__wikiTextToHtml = wikiTextToHtml
;(window as any).__originalValue = value

;(window as any).__setKnownPages = (keys: string[]) => {
  knownPages.clear()
  for (const k of keys) knownPages.add(k)
}

;(window as any).__reRender = () => {
  const v = (window as any).vditor
  const md = v.getValue()
  v.setValue(md.includes('[[') ? md : value)
}

// Capture postMessage calls so the spec can assert on navigation messages.
const messages: any[] = []
;(window as any).__messages = messages
const origPostMessage = (window as any).__vscodeApi?.postMessage
if (origPostMessage) {
  ;(window as any).__vscodeApi.postMessage = (msg: any) => {
    messages.push(msg)
    origPostMessage(msg)
  }
}

// Install link-open policy (default: modifier mode = Ctrl+click to follow).
installLinkOpenGate()
applyLinkOpenSetting(true)

function wikiHintExtend(value: string) {
  return wikiHintItems(value, hintPages)
}
;(window as any).__wikiHintExtend = wikiHintExtend

const editor = new Vditor('app', {
  cache: { enable: false },
  mode: 'ir',
  cdn: `${location.origin}/vditor`,
  value,
  toolbar: ['preview'],
  hint: {
    parse: false,
    extend: [
      { key: '[[', hint: wikiHintExtend },
      {
        key: '\u200B[',
        hint: (text) => wikiHintItems(text, hintPages, ' '),
      },
    ],
  },
  after() {
    ;(window as any).vditor = editor
    setupCustomRenderer(editor, { enabled: true, knownPages })
    setKnownPagesRef(knownPages)
    patchLuteSerialize(editor)
    editor.setValue(value)

    // Wire up click handling (fixLinkClick installs the wiki + link handlers).
    fixLinkClick()

    // Re-intercept postMessage after fixLinkClick may have re-acquired the API.
    const api = (window as any).__vscodeApi
    if (api && !api.__patched) {
      const orig = api.postMessage.bind(api)
      api.postMessage = (msg: any) => {
        messages.push(msg)
        return orig(msg)
      }
      api.__patched = true
    }

    ;(window as any).__ready = true
  },
})
