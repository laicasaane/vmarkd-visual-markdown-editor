// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PumlTiming,
  pumlTimingEnabled,
  recordPumlTiming,
  type PumlTimingRecord,
} from './plantuml-timing'

function withVscode(post: (m: unknown) => void): void {
  ;(globalThis as { vscode?: unknown }).vscode = { postMessage: post }
}

afterEach(() => {
  ;(globalThis as { vscode?: unknown }).vscode = undefined
  ;(
    window as unknown as { __vmdePumlTimingEnabled?: boolean }
  ).__vmdePumlTimingEnabled = undefined
  delete (window as unknown as { __vmdePumlTimings?: unknown })
    .__vmdePumlTimings
  vi.restoreAllMocks()
})

// A fake clock so the accumulator's arithmetic is checked against exact numbers, not real wall-clock
// noise — each call to `clock()` returns the next value from `ticks`.
function fakeClock(...ticks: number[]): () => number {
  let i = 0
  return () => {
    const t = ticks[i]
    i = Math.min(i + 1, ticks.length - 1)
    return t
  }
}

describe('PumlTiming (task 430 phase accumulator)', () => {
  it('records the elapsed time between start() and end() for each phase', () => {
    // queueWait: 0->10 (10ms), engineImport: 10->35 (25ms)
    const t = new PumlTiming(fakeClock(0, 10, 10, 35))
    t.start('queueWait')
    t.end('queueWait')
    t.start('engineImport')
    t.end('engineImport')
    const b = t.breakdown()
    expect(b.queueWait).toBe(10)
    expect(b.engineImport).toBe(25)
  })

  it('a phase never started stays 0, not NaN/undefined', () => {
    const t = new PumlTiming(fakeClock(0, 1))
    t.start('queueWait')
    t.end('queueWait')
    const b = t.breakdown()
    expect(b.engineImport).toBe(0)
    expect(b.stdlibExpand).toBe(0)
    expect(b.engineRender).toBe(0)
    expect(b.postProcess).toBe(0)
  })

  it('total is always the sum of the five phases, whichever ran', () => {
    // queueWait 0->5 (5), stdlibExpand 5->17 (12), engineRender 17->117 (100)
    const t = new PumlTiming(fakeClock(0, 5, 5, 17, 17, 117))
    t.start('queueWait')
    t.end('queueWait')
    t.start('stdlibExpand')
    t.end('stdlibExpand')
    t.start('engineRender')
    t.end('engineRender')
    const b = t.breakdown()
    expect(b.total).toBe(
      b.queueWait +
        b.engineImport +
        b.stdlibExpand +
        b.engineRender +
        b.postProcess,
    )
    expect(b.total).toBe(117)
  })

  it('end() with no matching start() is a no-op, not a throw or a negative duration', () => {
    const t = new PumlTiming(fakeClock(100))
    expect(() => t.end('engineRender')).not.toThrow()
    expect(t.breakdown().engineRender).toBe(0)
  })

  it('a repeated start() before end() moves the open mark (last start wins)', () => {
    // start@0, start@10 (overwrites), end@30 -> 20ms, not 30ms
    const t = new PumlTiming(fakeClock(0, 10, 30))
    t.start('postProcess')
    t.start('postProcess')
    t.end('postProcess')
    expect(t.breakdown().postProcess).toBe(20)
  })

  it('accumulates across multiple start/end pairs on the same phase', () => {
    // 0->5 (5), then 5->8 (3) -> 8 total
    const t = new PumlTiming(fakeClock(0, 5, 5, 8))
    t.start('queueWait')
    t.end('queueWait')
    t.start('queueWait')
    t.end('queueWait')
    expect(t.breakdown().queueWait).toBe(8)
  })
})

describe('pumlTimingEnabled (gate)', () => {
  it('is off by default — a normal open never flips it', () => {
    expect(pumlTimingEnabled()).toBe(false)
  })

  it('reads the e2e-armed window flag', () => {
    ;(
      window as unknown as { __vmdePumlTimingEnabled?: boolean }
    ).__vmdePumlTimingEnabled = true
    expect(pumlTimingEnabled()).toBe(true)
  })
})

describe('recordPumlTiming', () => {
  it('appends (not overwrites) to window.__vmdePumlTimings, and logs a summary line', () => {
    const post = vi.fn()
    withVscode(post)
    const t1 = new PumlTiming(fakeClock(0, 10))
    t1.start('engineRender')
    t1.end('engineRender')
    recordPumlTiming(t1, {
      targetId: 'a',
      engineKind: 'class',
      settledBy: 'observer',
      engineDiscarded: false,
    })
    const t2 = new PumlTiming(fakeClock(0, 5))
    t2.start('engineRender')
    t2.end('engineRender')
    recordPumlTiming(t2, {
      targetId: 'b',
      engineKind: 'nonClass',
      settledBy: 'observer',
      engineDiscarded: false,
    })
    const records = (
      window as unknown as { __vmdePumlTimings?: PumlTimingRecord[] }
    ).__vmdePumlTimings
    expect(records?.map((r) => r.targetId)).toEqual(['a', 'b'])
    expect(post).toHaveBeenCalledTimes(2)
    const [msg] = post.mock.calls[0] as [{ command: string; text: string }]
    expect(msg.command).toBe('log')
    expect(msg.text).toContain('[puml-timing] a engine=class')
  })

  it('carries settledBy + engineDiscarded through to the record (task 429/430 join point)', () => {
    withVscode(() => {
      /* postMessage no-op — this test doesn't assert on outbound messages,
         just needs the vscode global present */
    })
    const t = new PumlTiming(fakeClock(0, 1))
    t.start('engineRender')
    t.end('engineRender')
    recordPumlTiming(t, {
      targetId: 'c',
      engineKind: 'class',
      settledBy: 'fallback',
      engineDiscarded: true,
    })
    const [record] = (
      window as unknown as { __vmdePumlTimings?: PumlTimingRecord[] }
    ).__vmdePumlTimings as PumlTimingRecord[]
    expect(record.settledBy).toBe('fallback')
    expect(record.engineDiscarded).toBe(true)
  })
})
