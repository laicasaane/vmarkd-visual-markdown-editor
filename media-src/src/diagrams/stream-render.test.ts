// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  processIR: vi.fn(),
  processSV: vi.fn(),
  processCode: vi.fn(),
}))
vi.mock('vditor/src/ts/ir/process', () => ({
  processAfterRender: h.processIR,
}))
vi.mock('vditor/src/ts/sv/process', () => ({
  processAfterRender: h.processSV,
}))
vi.mock('vditor/src/ts/util/processCode', () => ({
  processCodeRender: h.processCode,
}))

import { streamRenderSV } from './stream-render'

describe('streamRenderSV', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(performance.now())
      return 1
    })
  })

  it('fills one SV source block progressively and finalizes preview once', async () => {
    const sv = document.createElement('pre')
    const outline = { render: vi.fn() }
    const lute = {
      Md2VditorSVDOM: (markdown: string) =>
        `<span data-type="text">${markdown.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</span>`,
    }
    const pub = { vditor: { lute, sv: { element: sv }, outline } }
    const order: string[] = []
    let metrics: unknown
    const markdown = `${'paragraph words\n\n'.repeat(320)}TAIL`

    await streamRenderSV(pub, markdown, {
      onFirstChunk: () => order.push('first'),
      beforeFinalize: () => order.push('helpers'),
      onMetrics: (value) => {
        metrics = value
      },
      onDone: () => order.push('done'),
    })

    expect(sv.children).toHaveLength(1)
    expect((sv.firstElementChild as HTMLElement).dataset.block).toBe('0')
    expect(sv.textContent).toContain('TAIL')
    expect(order).toEqual(['first', 'helpers', 'done'])
    expect(metrics).toMatchObject({ chunks: expect.any(Number) })
    expect((metrics as { chunks: number }).chunks).toBeGreaterThan(1)
    expect(h.processSV).toHaveBeenCalledOnce()
    expect(h.processSV).toHaveBeenCalledWith(pub.vditor, {
      enableAddUndoStack: true,
      enableHint: false,
      enableInput: false,
    })
    expect(outline.render).toHaveBeenCalledWith(pub.vditor)
  })

  it('falls back to setValue and still completes when SV internals are absent', async () => {
    const setValue = vi.fn()
    const onFirstChunk = vi.fn()
    const onDone = vi.fn()

    await streamRenderSV({ setValue }, 'fallback', { onFirstChunk, onDone })

    expect(setValue).toHaveBeenCalledWith('fallback')
    expect(onFirstChunk).toHaveBeenCalledOnce()
    expect(onDone).toHaveBeenCalledOnce()
  })
})
