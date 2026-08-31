import '../src/boot/preload'
import Vditor from 'vditor/src/index'
import { fixResponsiveTables } from '../src/chrome/responsive-tables'
import { installSectionFold } from '../src/nav/section-fold'
import { observeDiagramZoom } from '../src/diagrams/diagram-zoom'
import { observeDiagramControls } from '../src/diagrams/diagram-controls'
import { installDiagramRuntime } from '../src/diagrams/diagram-runtime'
import {
  applyCacheHits,
  setRenderCacheConfig,
} from '../src/diagrams/render-cache-client'
import { installMutationRecordProbe } from '../src/util/mutation-impact'
import { Disposables } from '../src/util/disposables'
import type { WebviewMessage } from '../../src/shared/protocol'

const cdn = `${location.origin}/vditor`
const prose = Array.from(
  { length: 30 },
  (_, index) => `Paragraph ${index} keeps unrelated blocks in the document.`,
).join('\n\n')
const markdown = [
  prose,
  '',
  '# Mutation locality',
  '',
  'TARGET mutation local helper paragraph.',
  '',
  '## Nested content',
  '',
  '- parent',
  '  - child',
  '- peer',
  '',
  '| Name | Value |',
  '| --- | --- |',
  '| one | two |',
  '',
  '| Other | Value |',
  '| --- | --- |',
  '| three | four |',
  '',
  '```mermaid',
  'graph TD; A[Start] --> B[Finish]',
  '```',
  '',
  '```d2',
  'client -> server',
  '```',
  '',
].join('\n')

const app = document.getElementById('app')!
const observers = new Disposables()
const editor = new Vditor(app, {
  cdn,
  mode: 'ir',
  value: markdown,
  cache: { enable: false },
  height: 640,
  toolbar: ['edit-mode'],
  customWysiwygToolbar: () => undefined,
  after() {
    ;(window as any).vditor = editor
    ;(window as any).__vmdeE2EReadiness = { harness: true }
    setRenderCacheConfig({
      version: 'test',
      themeKey: 'light|test',
      cdn,
      mode: 'light',
    })
    observers.set('mutation-probe', installMutationRecordProbe(app))
    fixResponsiveTables()
    observers.set('section-fold', installSectionFold(editor))
    observers.set('diagram-zoom', observeDiagramZoom(app))
    observers.set('diagram-controls', observeDiagramControls(app))
    installDiagramRuntime({
      app,
      win: window,
      observers,
      postCacheMessage(message: WebviewMessage) {
        if (message.command !== 'diagram-cache-get') return
        setTimeout(() => applyCacheHits(message.requestId, {}), 0)
      },
    })
    ;(window as any).__mutationLocal = { editor, markdown }
    ;(window as any).__ready = true
  },
})
