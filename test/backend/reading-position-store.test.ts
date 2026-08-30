import { describe, expect, it } from 'vitest'
import {
  readReadingPosition,
  updateReadingPositionLru,
  type ReadingPositionEntry,
} from '../../src/session/reading-position-store'

const position = (index: number) => ({
  anchor: { hash: `h${index}`, index, headingPath: [] },
  scrollOffset: index,
})

describe('reading-position workspace LRU', () => {
  it('moves an updated document to the front without duplicating it', () => {
    const entries: ReadingPositionEntry[] = [
      { uri: 'a', state: position(1) },
      { uri: 'b', state: position(2) },
    ]
    const next = updateReadingPositionLru(entries, 'b', position(3), 5)

    expect(next.map(({ uri }) => uri)).toEqual(['b', 'a'])
    expect(readReadingPosition(next, 'b')).toEqual(position(3))
  })

  it('caps old documents', () => {
    const entries = Array.from({ length: 50 }, (_, index) => ({
      uri: `doc-${index}`,
      state: position(index),
    }))
    const next = updateReadingPositionLru(entries, 'new', position(99))

    expect(next).toHaveLength(50)
    expect(next[0].uri).toBe('new')
    expect(next.some(({ uri }) => uri === 'doc-49')).toBe(false)
  })

  it('drops malformed persisted caret paths', () => {
    const entries = [
      {
        uri: 'bad',
        state: {
          ...position(1),
          caret: { anchor: position(1).anchor, path: 'not-a-path', offset: 1 },
        },
      },
    ] as unknown as ReadingPositionEntry[]
    expect(readReadingPosition(entries, 'bad')).toBeUndefined()
  })
})
