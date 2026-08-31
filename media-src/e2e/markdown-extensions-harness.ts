import '../src/boot/preload'
import Vditor from 'vditor/src/index'
import { setupInlineTocNavigation } from '../src/nav/outline'

const params = new URLSearchParams(location.search)
const mode =
  params.get('mode') === 'wysiwyg' || params.get('mode') === 'sv'
    ? (params.get('mode') as 'wysiwyg' | 'sv')
    : 'ir'
const enabled = params.get('enabled') === '1'
const filler = Array.from(
  { length: 40 },
  (_, index) => `Navigation spacer paragraph ${index + 1}.`,
).join('\n\n')
const markdown = [
  '[toc]',
  '',
  '# One',
  '',
  '==marked== x^2^ H~2~O ~~strike~~',
  '',
  filler,
  '',
  '## Two',
  '',
].join('\n')

const editor = new Vditor('app', {
  cache: { enable: false },
  cdn: `${location.origin}/vditor`,
  mode,
  value: markdown,
  // Match the real webview's fixed-height editor. Vditor's built-in ToC click
  // handler scrolls the active editor surface only when height is not `auto`.
  height: '100%',
  minHeight: '100%',
  toolbar: ['preview', 'edit-mode'],
  preview: {
    markdown: {
      toc: enabled,
      mark: enabled,
      sup: enabled,
      sub: enabled,
    },
  },
  customWysiwygToolbar: () => undefined,
  after() {
    ;(window as unknown as { vditor: Vditor }).vditor = editor
    ;(window as any).__extensions = { editor, markdown }
    setupInlineTocNavigation()
    ;(window as any).__ready = true
  },
})
