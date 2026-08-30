// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import {
  checkpointUndoBoundary,
  isUndoBoundaryCommand,
  isSyntaxPromotionText,
} from './undo-boundaries'

describe('undo grouping boundaries', () => {
  it.each(['# ', '### ', '- ', '* ', '> ', '1. '])(
    'recognizes the literal syntax promotion %j',
    (text) => expect(isSyntaxPromotionText(text)).toBe(true),
  )

  it.each(['plain ', '# title ', '1. item ', ''])(
    'does not split ordinary typing for %j',
    (text) => expect(isSyntaxPromotionText(text)).toBe(false),
  )

  it('cancels a pending merged checkpoint before adding a forced boundary', () => {
    const addToUndoStack = vi.fn()
    const clear = vi.spyOn(globalThis, 'clearTimeout')
    const inner = {
      currentMode: 'ir' as const,
      ir: { processTimeoutId: 42 },
      undo: { addToUndoStack },
    }

    checkpointUndoBoundary(inner, true)

    expect(clear).toHaveBeenCalledWith(42)
    expect(addToUndoStack).toHaveBeenCalledWith(inner)
    clear.mockRestore()
  })

  it('adds the post-action checkpoint without cancelling edit-sync work', () => {
    const addToUndoStack = vi.fn()
    const clear = vi.spyOn(globalThis, 'clearTimeout')
    const inner = {
      currentMode: 'wysiwyg' as const,
      wysiwyg: { afterRenderTimeoutId: 77 },
      undo: { addToUndoStack },
    }

    checkpointUndoBoundary(inner, false)

    expect(clear).not.toHaveBeenCalled()
    expect(addToUndoStack).toHaveBeenCalledWith(inner)
    clear.mockRestore()
  })

  it.each([
    [{ key: 'b', ctrlKey: true }, true],
    [{ key: 'f', ctrlKey: true, shiftKey: true }, true],
    [{ key: '=', ctrlKey: true }, true],
    [{ key: 'c', ctrlKey: true }, false],
    [{ key: 'v', ctrlKey: true }, false],
    [{ key: 'z', ctrlKey: true }, false],
  ])(
    'classifies mutating model/table chords without duplicating clipboard/history %j',
    (partial, expected) => {
      const event = new KeyboardEvent('keydown', partial)
      expect(isUndoBoundaryCommand(event)).toBe(expected)
    },
  )
})
