// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import {
  applyRewrapTransaction,
  rewrapShortcut,
  sourceSelectionFromDom,
} from './rewrap-command'

describe('sourceSelectionFromDom', () => {
  it('maps a non-collapsed DOM selection through the real serializer boundary', () => {
    document.body.innerHTML = '<div id="editor">alpha <em>beta</em> gamma</div>'
    const editor = document.querySelector<HTMLElement>('#editor')!
    const alpha = editor.firstChild!
    const beta = editor.querySelector('em')!.firstChild!
    const range = document.createRange()
    range.setStart(alpha, 2)
    range.setEnd(beta, 2)

    const selection = sourceSelectionFromDom({
      editor,
      range,
      serialize: (html) => {
        const clone = document.createElement('div')
        clone.innerHTML = html
        return clone.textContent ?? ''
      },
    })

    expect(selection).toEqual({
      markdown: 'alpha beta gamma',
      startOffset: 2,
      endOffset: 8,
      caretOffset: 8,
    })
    expect(editor.innerHTML).toBe('alpha <em>beta</em> gamma')
  })
})

describe('applyRewrapTransaction', () => {
  it('applies one marked render between explicit undo snapshots and syncs once', () => {
    const calls: string[] = []
    const applyMarkdown = vi.fn((markdown: string, marker: string) => {
      calls.push(`apply:${markdown}:${marker}`)
      return true
    })
    const result = applyRewrapTransaction(
      {
        markdown: 'alpha beta gamma delta',
        startOffset: 0,
        endOffset: 22,
        caretOffset: 22,
      },
      12,
      {
        checkpointUndo: () => calls.push('undo'),
        applyMarkdown,
        readScroll: () => 37,
        restoreScroll: (value) => calls.push(`scroll:${value}`),
        sync: () => calls.push('sync'),
      },
    )

    expect(result).toBe(true)
    expect(calls[0]).toBe('undo')
    expect(calls[1]).toMatch(/^apply:alpha beta\ngamma delta.+:/u)
    expect(calls.slice(2)).toEqual(['undo', 'scroll:37', 'sync'])
    expect(applyMarkdown).toHaveBeenCalledTimes(1)
  })

  it('does not create undo, render, scroll, or sync work for a formatter no-op', () => {
    const deps = {
      checkpointUndo: vi.fn(),
      applyMarkdown: vi.fn(() => true),
      readScroll: vi.fn(() => 0),
      restoreScroll: vi.fn(),
      sync: vi.fn(),
    }

    expect(
      applyRewrapTransaction(
        {
          markdown: 'short line',
          startOffset: 0,
          endOffset: 10,
          caretOffset: 10,
        },
        80,
        deps,
      ),
    ).toBe(false)
    expect(deps.checkpointUndo).not.toHaveBeenCalled()
    expect(deps.applyMarkdown).not.toHaveBeenCalled()
    expect(deps.readScroll).not.toHaveBeenCalled()
    expect(deps.restoreScroll).not.toHaveBeenCalled()
    expect(deps.sync).not.toHaveBeenCalled()
  })

  it('does not commit a post-format snapshot when the marked caret cannot be restored', () => {
    const checkpointUndo = vi.fn()
    const sync = vi.fn()

    expect(
      applyRewrapTransaction(
        {
          markdown: 'alpha beta gamma delta',
          startOffset: 0,
          endOffset: 22,
          caretOffset: 22,
        },
        12,
        {
          checkpointUndo,
          applyMarkdown: () => false,
          readScroll: () => 0,
          restoreScroll: vi.fn(),
          sync,
        },
      ),
    ).toBe(false)
    expect(checkpointUndo).toHaveBeenCalledTimes(1)
    expect(sync).not.toHaveBeenCalled()
  })
})

describe('rewrapShortcut', () => {
  it('accepts plain Alt+Q and rejects extra command modifiers', () => {
    expect(
      rewrapShortcut({
        key: 'Q',
        altKey: true,
        ctrlKey: false,
        metaKey: false,
      }),
    ).toBe(true)
    expect(
      rewrapShortcut({ key: 'q', altKey: true, ctrlKey: true, metaKey: false }),
    ).toBe(false)
    expect(
      rewrapShortcut({
        key: 'q',
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      }),
    ).toBe(false)
  })
})
