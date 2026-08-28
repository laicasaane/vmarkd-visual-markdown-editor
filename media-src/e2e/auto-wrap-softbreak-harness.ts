import '../src/boot/preload'
import Vditor from 'vditor/src/index'
;(window as any).__vmarkdLiveLineBreaks = true

const markdown = [
  'soft alpha',
  'soft beta',
  '',
  'two-space alpha  ',
  'two-space beta',
  '',
  'backslash alpha\\',
  'backslash beta',
].join('\n')

const editor = new Vditor('app', {
  cache: { enable: false },
  mode: 'ir',
  cdn: `${location.origin}/vditor`,
  value: '',
  toolbar: [],
  after() {
    ;(window as any).__autoWrapSoftbreak = {
      markdown,
      probe(mode: 'ir' | 'wysiwyg', softBreak2HardBreak: boolean) {
        const lute = editor.vditor.lute
        lute.SetSoftBreak2HardBreak(softBreak2HardBreak)
        const render =
          mode === 'ir'
            ? lute.Md2VditorIRDOM.bind(lute)
            : lute.Md2VditorDOM.bind(lute)
        const serialize =
          mode === 'ir'
            ? lute.VditorIRDOM2Md.bind(lute)
            : lute.VditorDOM2Md.bind(lute)
        const spin =
          mode === 'ir'
            ? lute.SpinVditorIRDOM.bind(lute)
            : lute.SpinVditorDOM.bind(lute)
        const dom = render(markdown)
        const serialized = serialize(dom)
        const spunDom = spin(dom)
        return {
          dom,
          serialized,
          spunDom,
          spunSerialized: serialize(spunDom),
        }
      },
    }
    ;(window as any).__ready = true
  },
})
