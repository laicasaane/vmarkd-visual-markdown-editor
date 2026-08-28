import '../src/boot/preload'
import Vditor from 'vditor/src/index'
import { applyPreviewReflowSetting } from '../src/boot/live-config'

const value = `# Soft paragraph

alpha
beta

# Spaces hard break

gamma${'  '}
delta

# Backslash hard break

epsilon\\
zeta

# Soft blockquote

> eta
> theta
`

applyPreviewReflowSetting(
  new URLSearchParams(location.search).get('reflow') === '1',
)

const editor = new Vditor('app', {
  cache: { enable: false },
  cdn: `${location.origin}/vditor`,
  mode: 'ir',
  preview: { delay: 0 },
  value,
  after() {
    ;(window as any).vditor = editor
    const initialBytes = editor.getValue()
    const inner = editor.vditor
    inner.preview.element.style.display = 'block'
    inner.preview.render(inner)
    ;(window as any).__softbreak = {
      value,
      initialBytes,
      editor,
      setReflow(enabled: boolean) {
        applyPreviewReflowSetting(enabled)
      },
    }
    ;(window as any).__ready = true
  },
})
