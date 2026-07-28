// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from 'vitest'
import { enrichMarkdownLabels } from './d2'

beforeEach(() => {
  document.body.innerHTML = ''
})

// Task 154: |md| label enrichment — Lute render + offscreen measure BEFORE layout.
// NOTE: getD2Lute caches module-level, so the no-Lute test MUST run first in this file.
describe('enrichMarkdownLabels (task 154)', () => {
  const mdShape = () => ({
    id: 'a',
    idVal: 'a',
    label: '# T',
    shape: 'text',
    language: 'markdown',
    special: { isSequence: false, isGrid: false },
  })
  const graphOf = (shapes: object[]) => ({ shapes, edges: [] })

  test('without window.Lute the graph is left untouched (plain-text fallback)', async () => {
    delete (window as { Lute?: unknown }).Lute
    const graph = graphOf([mdShape()]) as never
    await enrichMarkdownLabels(graph)
    expect(
      (graph as { shapes: { mdHtml?: string }[] }).shapes[0].mdHtml,
    ).toBeUndefined()
  })

  test('attaches Lute-rendered mdHtml + a floored mdSize to |md| text shapes only', async () => {
    ;(window as { Lute?: unknown }).Lute = {
      New: () => ({ Md2HTML: (md: string) => `<h1>${md.trim()}</h1>` }),
    }
    const graph = graphOf([
      mdShape(),
      {
        id: 'b',
        idVal: 'b',
        label: 'plain',
        shape: 'text',
        special: { isSequence: false, isGrid: false },
      },
      {
        id: 'c',
        idVal: 'c',
        label: 'lbl',
        shape: 'rectangle',
        language: 'markdown',
        special: { isSequence: false, isGrid: false },
      },
    ]) as never
    await enrichMarkdownLabels(graph)
    const shapes = (
      graph as {
        shapes: { mdHtml?: string; mdSize?: { w: number; h: number } }[]
      }
    ).shapes
    expect(shapes[0].mdHtml).toBe('<h1># T</h1>')
    // jsdom has no layout — getBoundingClientRect is 0 — the measure floors kick in.
    expect(shapes[0].mdSize).toEqual({ w: 24, h: 16 })
    // A plain text shape and a non-text shape must NOT be enriched.
    expect(shapes[1].mdHtml).toBeUndefined()
    expect(shapes[2].mdHtml).toBeUndefined()
  })
})
