import Vditor from 'vditor/src/index'
import { installPreviewMorph } from '../src/editing/preview-morph'
import { installPreviewState } from '../src/editing/preview-state'

const content = [
  '# Preview performance',
  '',
  ...Array.from({ length: 120 }, (_, index) => [
    `Paragraph ${index} keeps the preview document realistically multi-block.`,
    '',
    index % 30 === 0 ? `- list ${index}\n- list ${index + 1}` : '',
    '',
  ]).flat(),
  '| A | B |',
  '| - | - |',
  '| 1 | 2 |',
  '',
  '```ts',
  'const preview = true',
  '```',
].join('\n')

const counters = {
  snapshot: 0,
  md2html: 0,
  morph: 0,
  firstMorphMs: -1,
}
let started = 0
let firstNodes: Node[] = []

const editor = new Vditor('app', {
  cache: { enable: false },
  mode: 'ir',
  height: 420,
  cdn: `${location.origin}/vditor`,
  value: content,
  preview: { delay: 500 },
  toolbar: ['preview'],
  customWysiwygToolbar: () => {
    /* Vditor calls this while constructing WYSIWYG controls. */
  },
  after() {
    ;(window as any).vditor = editor
    installPreviewMorph()
    const originalMorph = (window as any).__vmdeMorphPreview
    ;(window as any).__vmdeMorphPreview = (
      element: HTMLElement,
      html: string,
    ) => {
      counters.morph++
      if (started && counters.firstMorphMs < 0)
        counters.firstMorphMs = performance.now() - started
      originalMorph(element, html)
    }
    const inner = (editor as unknown as { vditor: IVditor }).vditor
    const originalMd2HTML = inner.lute.Md2HTML.bind(inner.lute)
    inner.lute.Md2HTML = (markdown: string) => {
      counters.md2html++
      return originalMd2HTML(markdown)
    }
    installPreviewState(inner, () => {
      counters.snapshot++
      return editor.getValue()
    })
    document.addEventListener('input', () =>
      (window as any).__vmdeInvalidatePreview?.('content'),
    )

    const previewButton = () => inner.toolbar.elements.preview.children[0]
    ;(window as any).__togglePreview = () => {
      started = performance.now()
      counters.firstMorphMs = -1
      previewButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }
    ;(window as any).__captureIdentity = () => {
      firstNodes = Array.from(inner.preview.previewElement.childNodes)
    }
    ;(window as any).__identityPreserved = () => {
      const next = Array.from(inner.preview.previewElement.childNodes)
      return (
        next.length === firstNodes.length &&
        next.every((node, index) => node === firstNodes[index])
      )
    }
    ;(window as any).__editIr = () => {
      const paragraph = inner.ir.element.querySelector('p') as HTMLElement
      const text = paragraph.firstChild ?? paragraph
      const range = document.createRange()
      range.selectNodeContents(text)
      range.collapse(false)
      const selection = getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      paragraph.focus()
      document.execCommand('insertText', false, ' changed')
    }
    ;(window as any).__startLiveRefresh = () => {
      counters.snapshot = 0
      counters.md2html = 0
      counters.morph = 0
      counters.firstMorphMs = -1
      started = performance.now()
      ;(window as any).__vmdeInvalidatePreview?.('config')
      inner.preview.render(inner)
    }
    ;(window as any).__resetCounters = () => {
      counters.snapshot = 0
      counters.md2html = 0
      counters.morph = 0
      counters.firstMorphMs = -1
    }
    ;(window as any).__previewStats = () => ({
      ...counters,
      visible: inner.preview.element.style.display === 'block',
      text: inner.preview.previewElement.textContent ?? '',
      value: editor.getValue(),
    })
    ;(window as any).__ready = true
  },
})
