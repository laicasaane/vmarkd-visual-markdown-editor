// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import {
  applyRewrapTransaction,
  captureRewrapSourceSelection,
  headingLevelShiftShortcut,
  mapCaretOffsetByLine,
  recordRewrapDocumentHistory,
  rewrapShortcut,
  sourceSelectionFromDom,
  takeRewrapDocumentHistorySync,
} from './rewrap-command'

describe('heading level shift shortcut', () => {
  it.each([
    ['[', false, -1, false],
    [']', false, 1, false],
    ['[', true, -1, true],
    [']', true, 1, true],
    ['{', false, -1, false],
    ['}', false, 1, false],
  ] as const)(
    'maps Ctrl+Shift+%s with alt=%s to direction %s and section=%s',
    (key, altKey, direction, section) => {
      expect(
        headingLevelShiftShortcut({
          key,
          altKey,
          shiftKey: true,
          ctrlKey: true,
          metaKey: false,
        }),
      ).toEqual({ direction, section })
    },
  )

  it('ignores bare brackets and unrelated modified keys', () => {
    expect(
      headingLevelShiftShortcut({
        key: '[',
        altKey: false,
        shiftKey: false,
        ctrlKey: true,
        metaKey: false,
      }),
    ).toBeNull()
    expect(
      headingLevelShiftShortcut({
        key: 'x',
        altKey: false,
        shiftKey: true,
        ctrlKey: true,
        metaKey: false,
      }),
    ).toBeNull()
  })
})

describe('document rewrap exact history sync', () => {
  it('tracks native undo and redo Markdown without replacing the undo engine', () => {
    const nativeState = {}
    const native = { undoStack: [] as unknown[], redoStack: [nativeState] }
    const inner = {
      currentMode: 'ir',
      undo: { ir: native },
    } as any
    recordRewrapDocumentHistory({
      owner: inner,
      mode: 'ir',
      nativeState,
      beforeRendered: 'before canonical',
      beforeExact: 'before exact\n',
      afterRendered: 'after canonical',
      afterExact: 'after exact\n',
    })

    expect(takeRewrapDocumentHistorySync(inner, 'before canonical')).toBe(
      'before exact\n',
    )
    expect(
      takeRewrapDocumentHistorySync(inner, 'before canonical'),
    ).toBeUndefined()
    native.redoStack.pop()
    native.undoStack.push(nativeState)
    expect(takeRewrapDocumentHistorySync(inner, 'after canonical')).toBe(
      'after exact\n',
    )
  })
})

describe('mapCaretOffsetByLine', () => {
  it('maps a logical caret across blank-line canonicalization', () => {
    const canonical = '---\n# Heading\nmiddle alpha beta\n'
    const authoritative = '---\n\n# Heading\n\nmiddle alpha beta\n'

    expect(
      mapCaretOffsetByLine(
        canonical,
        authoritative,
        canonical.indexOf('alpha') + 2,
      ),
    ).toBe(authoritative.indexOf('alpha') + 2)
  })

  it('maps the matching ordinal when an identical line is repeated', () => {
    const canonical = 'repeat line\nother\nrepeat line\n'
    const authoritative = 'repeat line\n\nother\n\nrepeat line\n'

    expect(
      mapCaretOffsetByLine(
        canonical,
        authoritative,
        canonical.lastIndexOf('line') + 2,
      ),
    ).toBe(authoritative.lastIndexOf('line') + 2)
  })

  it('maps the start of a line to that line instead of the preceding newline', () => {
    expect(mapCaretOffsetByLine('a\nb\n', 'a\n\nb\n', 2)).toBe(3)
  })

  it('maps a caret on a canonical blank line through added blank lines', () => {
    expect(mapCaretOffsetByLine('a\n\nb\n', 'a\n\n\nb\n', 2)).toBe(3)
  })

  it('maps EOF after a trailing newline across newline conventions', () => {
    expect(mapCaretOffsetByLine('a\n', 'a\r\n', 2)).toBe(3)
  })
})

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

describe('captureRewrapSourceSelection authoritative snapshot', () => {
  it('uses a supplied exact snapshot for the marker equality guard without getValue', () => {
    document.body.innerHTML = '<div id="editor"><p>alpha beta</p></div>'
    const editor = document.querySelector<HTMLElement>('#editor')!
    const text = editor.querySelector('p')!.firstChild as Text
    const range = document.createRange()
    range.setStart(text, 'alpha'.length)
    range.collapse(true)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    const serialize = (html: string) => {
      const template = document.createElement('template')
      template.innerHTML = html
      return template.content.textContent ?? ''
    }
    const getValue = vi.fn(() => 'alpha beta')
    ;(window as any).vditor = {
      getValue,
      vditor: {
        currentMode: 'ir',
        ir: { element: editor },
        lute: {
          VditorIRDOM2Md: serialize,
          VditorDOM2Md: serialize,
        },
      },
    }

    const captured = captureRewrapSourceSelection(window, {
      authoritativeMarkdown: 'alpha beta',
    })

    expect(captured).toMatchObject({ markdown: 'alpha beta', caretOffset: 5 })
    expect(getValue).not.toHaveBeenCalled()
  })
})

describe('applyRewrapTransaction', () => {
  it('document scope ignores the smaller selection and applies all paragraphs once', () => {
    const calls: string[] = []
    const markdown = [
      'first alpha beta gamma delta',
      '',
      'middle alpha beta gamma delta',
      '',
      'tail alpha beta gamma delta',
    ].join('\n')
    const middle = markdown.indexOf('middle')

    expect(
      applyRewrapTransaction(
        {
          markdown,
          startOffset: middle,
          endOffset: middle + 'middle'.length,
          caretOffset: middle + 2,
        },
        18,
        {
          checkpointUndo: () => calls.push('undo'),
          applyMarkdown: (_value, _marker, result) => {
            calls.push(`apply:${result.markdown}`)
            return true
          },
          readScroll: () => 21,
          restoreScroll: (value) => calls.push(`scroll:${value}`),
          sync: (markdown) => calls.push(`sync:${markdown}`),
        },
        'document',
      ),
    ).toBe(true)
    expect(calls.filter((call) => call.startsWith('apply:'))).toHaveLength(1)
    expect(calls.join('\n')).toContain('first alpha beta\ngamma delta')
    expect(calls.join('\n')).toContain('middle alpha beta\ngamma delta')
    expect(calls.join('\n')).toContain('tail alpha beta\ngamma delta')
    expect(calls.filter((call) => call === 'undo')).toHaveLength(2)
    expect(calls.filter((call) => call.startsWith('sync:'))).toHaveLength(1)
  })

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

  it('document scope is also a silent no-op when every paragraph already fits', () => {
    const deps = {
      checkpointUndo: vi.fn(),
      applyMarkdown: vi.fn(() => true),
      readScroll: vi.fn(() => 0),
      restoreScroll: vi.fn(),
      sync: vi.fn(),
    }
    const markdown = 'short first\n\nshort tail\n'

    expect(
      applyRewrapTransaction(
        {
          markdown,
          startOffset: markdown.indexOf('tail'),
          endOffset: markdown.indexOf('tail'),
          caretOffset: markdown.indexOf('tail') + 2,
        },
        80,
        deps,
        'document',
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
        'document',
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
