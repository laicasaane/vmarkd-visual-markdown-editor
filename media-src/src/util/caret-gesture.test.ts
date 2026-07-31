// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerCaretGesture, runCaretGestureHandlers } from './caret-gesture'

function caretIn(text: Text, offset: number) {
  const range = document.createRange()
  range.setStart(text, offset)
  range.collapse(true)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

function selectRange(
  start: Text,
  startOffset: number,
  end: Text,
  endOffset: number,
) {
  const range = document.createRange()
  range.setStart(start, startOffset)
  range.setEnd(end, endOffset)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

function keydown(opts: KeyboardEventInit = {}) {
  const evt = new KeyboardEvent('keydown', {
    key: 'Enter',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...opts,
  })
  document.dispatchEvent(evt)
  return evt
}

const disposers: Array<() => void> = []
function register(
  match: Parameters<typeof registerCaretGesture>[0],
  handle: Parameters<typeof registerCaretGesture>[1],
) {
  const dispose = registerCaretGesture(match, handle)
  disposers.push(dispose)
  return dispose
}

beforeEach(() => {
  document.body.innerHTML = '<p id="p">hello world</p>'
  window.getSelection()?.removeAllRanges()
})

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

describe('registerCaretGesture / the Ctrl+Enter keydown listener', () => {
  it('calls match+handle and consumes the event when a handler activates', () => {
    const text = document.getElementById('p')!.firstChild as Text
    caretIn(text, 2)
    const handle = vi.fn().mockReturnValue(true)
    register(() => document.getElementById('p'), handle)

    const evt = keydown()
    expect(handle).toHaveBeenCalledTimes(1)
    expect(evt.defaultPrevented).toBe(true)
  })

  it('leaves the event alone when no registration matches', () => {
    const text = document.getElementById('p')!.firstChild as Text
    caretIn(text, 2)
    register(() => null, vi.fn())

    const evt = keydown()
    expect(evt.defaultPrevented).toBe(false)
  })

  it('falls through to the next registration when handle returns false (matched but not actionable)', () => {
    const text = document.getElementById('p')!.firstChild as Text
    caretIn(text, 2)
    const firstHandle = vi.fn().mockReturnValue(false)
    const secondHandle = vi.fn().mockReturnValue(true)
    register(() => document.getElementById('p'), firstHandle)
    register(() => document.getElementById('p'), secondHandle)

    const evt = keydown()
    expect(firstHandle).toHaveBeenCalledTimes(1)
    expect(secondHandle).toHaveBeenCalledTimes(1)
    expect(evt.defaultPrevented).toBe(true)
  })

  it('tries registrations in registration order, first match+handle wins', () => {
    const text = document.getElementById('p')!.firstChild as Text
    caretIn(text, 2)
    const order: string[] = []
    register(
      () => {
        order.push('first-match')
        return document.getElementById('p')
      },
      () => {
        order.push('first-handle')
        return true
      },
    )
    register(
      () => {
        order.push('second-match')
        return document.getElementById('p')
      },
      () => {
        order.push('second-handle')
        return true
      },
    )

    keydown()
    expect(order).toEqual(['first-match', 'first-handle'])
  })

  it('does not call match at all for an extended (non-collapsed) selection', () => {
    const text = document.getElementById('p')!.firstChild as Text
    selectRange(text, 0, text, 5)
    const match = vi.fn().mockReturnValue(document.getElementById('p'))
    register(match, vi.fn().mockReturnValue(true))

    const evt = keydown()
    expect(match).not.toHaveBeenCalled()
    expect(evt.defaultPrevented).toBe(false)
  })

  it('ignores keys other than Ctrl/Cmd+Enter', () => {
    const text = document.getElementById('p')!.firstChild as Text
    caretIn(text, 2)
    const handle = vi.fn().mockReturnValue(true)
    register(() => document.getElementById('p'), handle)

    keydown({ key: 'Enter', ctrlKey: false, metaKey: false })
    keydown({ key: 'a', ctrlKey: true })
    expect(handle).not.toHaveBeenCalled()
  })

  it('accepts Cmd (metaKey) as well as Ctrl', () => {
    const text = document.getElementById('p')!.firstChild as Text
    caretIn(text, 2)
    const handle = vi.fn().mockReturnValue(true)
    register(() => document.getElementById('p'), handle)

    const evt = keydown({ ctrlKey: false, metaKey: true })
    expect(handle).toHaveBeenCalledTimes(1)
    expect(evt.defaultPrevented).toBe(true)
  })

  it('the returned disposer removes just that registration', () => {
    const text = document.getElementById('p')!.firstChild as Text
    caretIn(text, 2)
    const handle = vi.fn().mockReturnValue(true)
    const dispose = registerCaretGesture(
      () => document.getElementById('p'),
      handle,
    )
    dispose()

    const evt = keydown()
    expect(handle).not.toHaveBeenCalled()
    expect(evt.defaultPrevented).toBe(false)
  })
})

describe('runCaretGestureHandlers — the VS Code-command trigger (no KeyboardEvent involved)', () => {
  it('runs the same dispatch and reports whether something activated', () => {
    const text = document.getElementById('p')!.firstChild as Text
    caretIn(text, 2)
    register(
      () => document.getElementById('p'),
      () => true,
    )
    expect(runCaretGestureHandlers()).toBe(true)
  })

  it('returns false when nothing matches', () => {
    const text = document.getElementById('p')!.firstChild as Text
    caretIn(text, 2)
    register(
      () => null,
      () => true,
    )
    expect(runCaretGestureHandlers()).toBe(false)
  })
})
