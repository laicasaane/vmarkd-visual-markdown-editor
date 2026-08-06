import '../src/boot/preload'
import Vditor from 'vditor'
import { setupOutlineFlash } from '../src/nav/outline'
import { installOutlineKeyboard } from '../src/nav/outline-keyboard'
import { setupOutlineResize } from '../src/nav/outline-resize'

// Real Vditor (IR) with headings + the outline panel enabled on the right, and
// the outline-click flash wired up — mirrors how main.ts sets it for tasks
// 07/08/13. Globals let the spec read/drive the outline and headings.
const value = [
  '# First heading',
  '',
  'Paragraph under the first heading.',
  '',
  '## Second heading',
  '',
  'Paragraph under the second heading.',
  '',
  '### Third heading',
  '',
  'Paragraph under the third heading.',
  '',
].join('\n')

const editor = new Vditor('app', {
  cache: { enable: false },
  mode: 'ir',
  cdn: `${location.origin}/vditor`,
  value,
  outline: { enable: true, position: 'right' },
  // Vditor 3.11 calls this unconditionally while rendering the wysiwyg
  // toolbar; without it init throws (see main.ts).
  customWysiwygToolbar: () => {
    /* required stub — see comment above */
  },
  after() {
    ;(window as any).vditor = editor
    ;(window as any).vditorTest = editor
    setupOutlineFlash(editor)
    const oel = (editor as any).vditor?.outline?.element as
      | HTMLElement
      | undefined
    // Spec reads the persisted width off this global (mirrors main.ts's real onResize, which
    // posts `save-outline-width` to the host — nothing to intercept in a page context).
    ;(window as any).__lastOutlineWidth = undefined
    if (oel) {
      setupOutlineResize(oel, 'right', (w) => {
        ;(window as any).__lastOutlineWidth = w
      })
    }
    installOutlineKeyboard(editor)
    ;(window as any).__ready = true
  },
})
