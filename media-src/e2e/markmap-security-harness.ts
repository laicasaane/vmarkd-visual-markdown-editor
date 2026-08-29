import '../src/boot/preload'
import Vditor from 'vditor/src/index'
import { installDiagramZoomGate } from '../src/diagrams/diagram-zoom-gate'

const repeatedEmails = Array.from(
  { length: 16 },
  () => 'user@example.invalid',
).join(' ')
const longMailto = `mailto:${'a'.repeat(256)}@example.invalid`

const editor = new Vditor('app', {
  cache: { enable: false },
  mode: 'ir',
  cdn: `${location.origin}/vditor`,
  value: [
    '```markmap',
    '# Security-safe Markmap',
    '## Ordinary heading',
    '- Alpha',
    '- Beta',
    '## Repeated email-like text',
    `- ${repeatedEmails}`,
    '## Bounded long mailto',
    `- ${longMailto}`,
    '```',
  ].join('\n'),
  customWysiwygToolbar: () => {
    /* required by Vditor 3.11 harness initialization */
  },
  after() {
    installDiagramZoomGate()
    ;(window as any).vditor = editor
    ;(window as any).__ready = true
  },
})
