// @vitest-environment jsdom

import fs from 'node:fs'
import vm from 'node:vm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildDefMap, chunkize } from './stream-chunk'

vi.mock('vditor/src/ts/ir/process', () => ({ processAfterRender: vi.fn() }))
vi.mock('vditor/src/ts/sv/process', () => ({ processAfterRender: vi.fn() }))
vi.mock('vditor/src/ts/util/processCode', () => ({
  processCodeRender: vi.fn(),
}))

import { renderSVChunk } from '../diagrams/stream-render'

interface RealLute {
  Md2VditorSVDOM(markdown: string): string
  SetVditorSV(enabled: boolean): void
}

const ROOT = process.cwd()
let lute: RealLute

beforeAll(() => {
  const source = fs.readFileSync(
    `${ROOT}/media/vditor/dist/js/lute/lute.min.js`,
    'utf8',
  )
  const sandbox: Record<string, unknown> = {
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console,
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'lute.min.js' })
  lute = (sandbox as { Lute: { New(): RealLute } }).Lute.New()
  lute.SetVditorSV(true)
})

function markerSignature(root: HTMLElement): string[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      '[data-type="li-marker"], .vditor-sv__marker--link',
    ),
    (node) =>
      `${node.dataset.type ?? ''}|${node.className}|${node.textContent}`,
  )
}

describe('renderSVChunk', () => {
  it('assembles the same source text and marker classes as one whole-document render', () => {
    const list = Array.from(
      { length: 45 },
      (_, index) => `- list item ${index + 1}\n\n  detail ${index + 1}`,
    ).join('\n\n')
    const markdown = [
      'Uses [late reference][late] before its definition.',
      '',
      'Opening prose.\n\n'.repeat(260),
      list,
      '',
      '| A | B |',
      '| - | - |',
      '| 1 | 2 |',
      '',
      '```js',
      'const protectedValue = true',
      '```',
      '',
      '[late]: https://example.com/late',
      '',
      'Tail without a trailing newline',
    ].join('\n')
    const chunks = chunkize(markdown)
    expect(chunks.length).toBeGreaterThan(1)

    const whole = document.createElement('div')
    whole.innerHTML = lute.Md2VditorSVDOM(markdown)
    const assembled = document.createElement('div')
    const defMap = buildDefMap(markdown)
    for (const chunk of chunks) {
      const holder = renderSVChunk(lute, chunk, defMap)
      assembled.append(...Array.from(holder.childNodes))
    }

    expect(assembled.textContent).toBe(whole.textContent)
    expect(markerSignature(assembled)).toEqual(markerSignature(whole))
    expect(assembled.textContent).not.toContain(MARKER_FOR_ASSERTION)
  })
})

const MARKER_FOR_ASSERTION = 'VMDE_STREAM_EXTERNAL_DEFS'
