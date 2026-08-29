// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { invalidateCaret } from './caret'
import {
  CODE,
  HR,
  PARA,
  caretBlockIndex,
  caretIn,
  chain,
  editorWithBlocks,
} from './gap-nav-fixture'
import { setupGapNav } from './gap-nav'

// The DECISION half of the arrow mover against stubbed layout (see gap-nav-fixture.ts for why the
// geometry has to be faked at all). What this can prove: which boundary is acted on, what lands in
// the DOM, and that a non-boundary key is left alone. What it cannot: that the caret was really on
// the block's edge LINE — that is real layout, and lives in media-src/e2e/gap-cursor.spec.ts.

let dispose: () => void

beforeEach(() => {
  document.body.replaceChildren()
})
afterEach(() => {
  dispose?.()
  invalidateCaret()
  ;(window as unknown as { vditor?: unknown }).vditor = undefined
})

const arrow = (down: boolean, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', {
    key: down ? 'ArrowDown' : 'ArrowUp',
    bubbles: true,
    cancelable: true,
    ...init,
  })
  document.dispatchEvent(e)
  return e
}

const setup = (html: string) => {
  const editor = editorWithBlocks(html)
  dispose = setupGapNav(() => editor)
  return editor
}

describe('setupGapNav — arrows across void boundaries', () => {
  it('ArrowDown from a paragraph above a rule+fence stops between the rule and the fence', () => {
    const editor = setup(`${PARA}${HR}${CODE}`)
    caretIn(editor.children[0] as HTMLElement)
    const e = arrow(true)
    expect(e.defaultPrevented).toBe(true)
    expect(chain(editor)).toBe('p | hr | p | code-block')
    expect(caretBlockIndex(editor)).toBe(2) // in the manufactured gap
    expect(editor.children[2].hasAttribute('data-vmde-gap')).toBe(true)
  })

  it('ArrowUp out of a leading code block opens a line ABOVE the document', () => {
    const editor = setup(`${CODE}${PARA}`)
    caretIn(editor.children[0] as HTMLElement)
    const e = arrow(false)
    expect(e.defaultPrevented).toBe(true)
    expect(chain(editor)).toBe('p | code-block | p')
    expect(caretBlockIndex(editor)).toBe(0)
  })

  it('steps ACROSS a rule when the boundary beyond it needs no gap (task 100)', () => {
    const editor = setup(`${PARA}${HR}${PARA}`)
    caretIn(editor.children[0] as HTMLElement)
    const e = arrow(true)
    expect(e.defaultPrevented).toBe(true)
    expect(chain(editor)).toBe('p | hr | p') // nothing spliced
    expect(caretBlockIndex(editor)).toBe(2) // landed past the rule
  })

  it('leaves the END of the document to the trailing invariant', () => {
    const editor = setup(`${PARA}${CODE}`)
    caretIn(editor.children[1] as HTMLElement)
    const e = arrow(true)
    expect(e.defaultPrevented).toBe(false)
    expect(chain(editor)).toBe('p | code-block')
  })

  it('does nothing between two plain paragraphs', () => {
    const editor = setup(`${PARA}${PARA}`)
    caretIn(editor.children[0] as HTMLElement)
    const e = arrow(true)
    expect(e.defaultPrevented).toBe(false)
    expect(chain(editor)).toBe('p | p')
  })

  it('ignores arrows with a modifier (those are selection / word / document moves)', () => {
    const editor = setup(`${PARA}${HR}${CODE}`)
    caretIn(editor.children[0] as HTMLElement)
    for (const init of [
      { shiftKey: true },
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
    ]) {
      expect(arrow(true, init).defaultPrevented).toBe(false)
    }
    expect(chain(editor)).toBe('p | hr | code-block')
  })

  it('ignores a non-collapsed selection', () => {
    const editor = setup(`${PARA}${HR}${CODE}`)
    const r = document.createRange()
    r.selectNodeContents(editor.children[0])
    const s = window.getSelection()
    s?.removeAllRanges()
    s?.addRange(r)
    expect(arrow(true).defaultPrevented).toBe(false)
    expect(chain(editor)).toBe('p | hr | code-block')
  })

  it('stops listening once disposed', () => {
    const editor = setup(`${PARA}${HR}${CODE}`)
    caretIn(editor.children[0] as HTMLElement)
    dispose()
    expect(arrow(true).defaultPrevented).toBe(false)
    expect(chain(editor)).toBe('p | hr | code-block')
  })
})
