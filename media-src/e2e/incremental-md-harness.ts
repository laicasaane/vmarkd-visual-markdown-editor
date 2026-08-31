import '../src/boot/preload'
import Vditor from 'vditor/src/index'
import { createIncrementalMd } from '../src/bridge/incremental-md'
import { useIncrementalSerialize } from '../src/bridge/edit-sync-tuning'
import { createEditSync, type EditSync } from '../src/bridge/edit-sync'
import { sourceComplexitySignature } from '../../src/shared/incremental-admission'

// preload.ts's initVsCodeApi() call (task 470) picks up the spec's acquireVsCodeApi stub.
// Real Vditor (IR) + the task-69 incremental serializer, driven the same way main.ts
// drives it. The spec performs REAL edits (typing, Enter, Backspace, paste) — so the
// DOM comes from Vditor's own SpinVditorIRDOM, the one thing the Node spike could not
// cover — and after each edit compares the incremental markdown to the authoritative
// `editor.getValue()` (full VditorIRDOM2Md). They must be byte-identical.
//
// `?large=1` seeds a ≥ INCREMENTAL_MIN_BLOCKS document so the real gate
// (`serializeForHost`, mirrored below) routes through the incremental path.

let editor: Vditor
let editSync: EditSync | undefined

const incremental = createIncrementalMd((html: string) =>
  (editor as any).vditor.lute.VditorIRDOM2Md(html),
)
const irTopBlocks = (): string[] => {
  const el = (editor as any).vditor.ir.element as HTMLElement
  return Array.from(el.children, (c) => (c as HTMLElement).outerHTML)
}

// Mirror of main.ts serializeForHost: gate on block count, incremental when large.
const serializeForHost = (): { md: string; usedIncremental: boolean } => {
  const el = (editor as any).vditor.ir.element as HTMLElement
  const used = useIncrementalSerialize(
    editor.getCurrentMode?.(),
    el.children.length,
  )
  return {
    md: used ? incremental.update(irTopBlocks()) : editor.getValue(),
    usedIncremental: used,
  }
}

// Exposed to the spec: the engine compared directly (bypasses the gate)…
;(window as any).__incrementalVsFull = () => {
  const incr = incremental.update(irTopBlocks())
  const full = editor.getValue()
  const blocks = irTopBlocks()
  return {
    incr,
    full,
    equal: incr === full,
    blockCount: blocks.length,
  }
}
// …and the gated path (what the editor actually posts to the host).
;(window as any).__serializeForHost = () => {
  const r = serializeForHost()
  const full = editor.getValue()
  return { ...r, full, equal: r.md === full }
}
;(window as any).__invalidate = () => incremental.invalidate()

const isLarge = new URLSearchParams(location.search).get('large') === '1'
const smallDoc = [
  '# Title',
  '',
  'Intro paragraph with **bold** and `code`.',
  '',
  '- one',
  '- two',
  '- three',
  '',
  '> a quote',
  '',
  '```js',
  'const x = 1',
  '```',
  '',
  '| A | B |',
  '| --- | --- |',
  '| 1 | 2 |',
  '',
  'Closing paragraph.',
  '',
].join('\n')
// 800 paragraphs → 800 top-level blocks, comfortably over the gate (700).
const largeDoc = `${Array.from(
  { length: 800 },
  (_, i) => `Paragraph number ${i} with a little text to serialize.`,
).join('\n\n')}\n`
const complexDoc = (() => {
  const lines: string[] = ['# Complex sub-700 corpus', '']
  for (let section = 0; section < 75; section++) {
    lines.push(`## Section ${section}`, '')
    for (let paragraph = 0; paragraph < 5; paragraph++)
      lines.push(
        `Paragraph ${section}.${paragraph} has **bold**, *emphasis*, [link](./note.md), and \`code\`.`,
        '',
      )
    lines.push(
      `- list ${section} first`,
      `  - list ${section} nested one`,
      `  - list ${section} nested two`,
      `- list ${section} peer`,
      '',
    )
    if (section % 5 === 0)
      lines.push(
        `| Section ${section} | Value |`,
        '| --- | --- |',
        '| alpha | beta |',
        '',
      )
  }
  return `${lines.join('\n')}\n`
})()

const params = new URLSearchParams(location.search)
const isComplex = params.get('complex') === '1'
const cancelSeed = params.get('cancel') === '1'
const value = isComplex ? complexDoc : isLarge ? largeDoc : smallDoc

editor = new Vditor('app', {
  cache: { enable: false },
  mode: 'ir',
  cdn: `${location.origin}/vditor`,
  value,
  // Vditor 3.11 calls this unconditionally while rendering the wysiwyg
  // toolbar; without it init throws (see main.ts).
  customWysiwygToolbar: () => {
    /* required stub — see comment above */
  },
  input() {
    editSync?.markUserInput()
    editSync?.schedule()
  },
  after() {
    ;(window as any).vditor = editor
    ;(window as any).vditorTest = editor
    if (isComplex) {
      ;(window as any).__vmdeE2EReadiness = { harness: true }
      const canonical = editor.getValue()
      editSync = createEditSync({
        isSuppressed: () => false,
        docMode: {
          cvActive: false,
          streamActive: false,
          docChars: value.length,
        },
        incrementalSeed: {
          markdown: canonical,
          source: sourceComplexitySignature(value),
          reason: 'source-structure',
          hostMs: 0,
        },
      })
      ;(window as any).__task537EditSync = editSync
      ;(window as any).__task537ExternalUpdate = (next: string) => {
        editor.setValue(next)
        editSync?.reseed({
          markdown: editor.getValue(),
          source: sourceComplexitySignature(next),
          reason: 'source-structure',
          hostMs: 0,
        })
      }
      editSync.startIncrementalSeed()
      ;(window as any).__task537PartialSnapshot = editSync.snapshotMarkdown()
      if (cancelSeed) queueMicrotask(() => editSync?.invalidate())
    }
    ;(window as any).__ready = true
  },
})
