import { describe, expect, it } from 'vitest'
import { EditPerfCollector } from '../../src/platform/edit-perf'

const renderer = (id: string, schedules = 1) => ({
  id,
  callbackKind: 'idle' as const,
  schedules,
  totalWaitMs: 250,
  quietWaitMs: 250,
  serializeMs: 2,
  payloadBytes: 100,
})

describe('EditPerfCollector', () => {
  it('keeps overlapping generations separate and merges the renderer post timing', () => {
    const collector = new EditPerfCollector(10)
    collector.begin(renderer('a', 2), 100)
    collector.begin(renderer('b'), 105)
    collector.rendererPost('a', 0.4, 'posted')
    collector.host('a', { queueMs: 7, minimizeMs: 30 })
    collector.host('b', { queueMs: 2 })

    expect(collector.snapshot()).toEqual([
      expect.objectContaining({
        id: 'a',
        renderer: expect.objectContaining({ schedules: 2, postMessageMs: 0.4 }),
        host: { queueMs: 7, minimizeMs: 30 },
        status: 'pending',
      }),
      expect.objectContaining({ id: 'b', host: { queueMs: 2 } }),
    ])
  })

  it('marks cancelled and failed generations without inventing a host sample', () => {
    const collector = new EditPerfCollector(10)
    collector.rendererPost('cancelled', 0, 'cancelled')
    collector.begin(renderer('failed'), 10)
    collector.finish('failed', 'failed')

    expect(collector.snapshot()).toEqual([
      expect.objectContaining({ id: 'cancelled', status: 'cancelled' }),
      expect.objectContaining({ id: 'failed', status: 'failed' }),
    ])
  })

  it('bounds stale generations and ignores marks after eviction', () => {
    const collector = new EditPerfCollector(2)
    collector.begin(renderer('old'), 1)
    collector.begin(renderer('middle'), 2)
    collector.begin(renderer('new'), 3)

    expect(collector.host('old', { queueMs: 99 })).toBe(false)
    expect(collector.snapshot().map((sample) => sample.id)).toEqual([
      'middle',
      'new',
    ])
  })

  it('accumulates follower stages and returns defensive snapshots', () => {
    const collector = new EditPerfCollector(2)
    collector.begin(renderer('a'), 1)
    collector.followers('a', { getTextMs: 2, imageRefreshMs: 3 })
    collector.followers('a', { diffScheduleMs: 4, documentVersion: 8 })
    const first = collector.snapshot()
    first[0].followers!.getTextMs = 999

    expect(collector.snapshot()[0].followers).toEqual({
      getTextMs: 2,
      imageRefreshMs: 3,
      diffScheduleMs: 4,
      documentVersion: 8,
    })
  })
})
