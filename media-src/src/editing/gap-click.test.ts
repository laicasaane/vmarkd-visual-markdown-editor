// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { invalidateCaret } from './caret'
import { boundaryAtY, setupGapClick } from './gap-click'
import {
  BLOCK_H,
  CODE,
  PARA,
  caretBlockIndex,
  chain,
  editorWithBlocks,
  rowTop,
  stripY,
} from './gap-nav-fixture'

// Hit-testing against stubbed layout (gap-nav-fixture.ts): rows of BLOCK_H with a STRIP_H gap
// between them. The real strips are thin — 24px above the first block, ~14px between two fences,
// both measured in the harness — so what matters here is the DECISION, not the pixel arithmetic.

let dispose: () => void

beforeEach(() => {
  document.body.replaceChildren()
})
afterEach(() => {
  dispose?.()
  invalidateCaret()
  ;(window as unknown as { vditor?: unknown }).vditor = undefined
})

const setup = (html: string) => {
  const editor = editorWithBlocks(html)
  dispose = setupGapClick(() => editor)
  return editor
}

const press = (
  target: EventTarget,
  clientY: number,
  init: MouseEventInit = {},
) => {
  const e = new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    detail: 1,
    clientY,
    ...init,
  })
  target.dispatchEvent(e)
  return e
}

describe('boundaryAtY — which boundary a point falls in', () => {
  it('above the first block', () => {
    const editor = editorWithBlocks(`${CODE}${PARA}`)
    const b = boundaryAtY(editor, -5)
    expect(b?.before).toBeNull()
    expect(b?.needsGap).toBe(true)
  })

  it('in the strip between two blocks', () => {
    const editor = editorWithBlocks(`${CODE}${CODE}`)
    const b = boundaryAtY(editor, stripY(0))
    expect(b?.before).toBe(editor.children[0])
    expect(b?.after).toBe(editor.children[1])
    expect(b?.needsGap).toBe(true)
  })

  it('inside a block: null — the browser places that caret', () => {
    const editor = editorWithBlocks(`${CODE}${CODE}`)
    expect(boundaryAtY(editor, rowTop(1) + BLOCK_H / 2)).toBeNull()
  })

  it('below the last block: null — that boundary is the trailing invariant’s', () => {
    const editor = editorWithBlocks(`${PARA}${CODE}`)
    expect(boundaryAtY(editor, rowTop(5))).toBeNull()
  })

  it('an empty editor has no boundary to hit', () => {
    expect(boundaryAtY(editorWithBlocks(''), 0)).toBeNull()
  })
})

describe('setupGapClick — a click that missed every block', () => {
  it('above a document starting with a code block opens a line there', () => {
    const editor = setup(`${CODE}${PARA}`)
    const e = press(editor, -5)
    expect(e.defaultPrevented).toBe(true)
    expect(chain(editor)).toBe('p | code-block | p')
    expect(caretBlockIndex(editor)).toBe(0)
    expect(editor.children[0].hasAttribute('data-vmde-gap')).toBe(true)
  })

  it('in the strip between two code blocks lands between them', () => {
    const editor = setup(`${CODE}${CODE}`)
    expect(press(editor, stripY(0)).defaultPrevented).toBe(true)
    expect(chain(editor)).toBe('code-block | p | code-block')
    expect(caretBlockIndex(editor)).toBe(1)
  })

  it('leaves a strip between text blocks alone — Enter already reaches it', () => {
    const editor = setup(`${PARA}${PARA}`)
    expect(press(editor, stripY(0)).defaultPrevented).toBe(false)
    expect(chain(editor)).toBe('p | p')
  })

  it('ignores a click that landed INSIDE a block', () => {
    const editor = setup(`${CODE}${CODE}`)
    const e = press(editor.children[0], stripY(0)) // strip Y, but the target is a block
    expect(e.defaultPrevented).toBe(false)
    expect(chain(editor)).toBe('code-block | code-block')
  })

  it.each([
    ['a secondary button', { button: 2 }],
    ['a double click', { detail: 2 }],
    ['a shift-click (extends a selection)', { shiftKey: true }],
    ['a ctrl-click', { ctrlKey: true }],
  ])('ignores %s', (_name, init) => {
    const editor = setup(`${CODE}${PARA}`)
    expect(press(editor, -5, init).defaultPrevented).toBe(false)
    expect(chain(editor)).toBe('code-block | p')
  })

  it('stops listening once disposed', () => {
    const editor = setup(`${CODE}${PARA}`)
    dispose()
    expect(press(editor, -5).defaultPrevented).toBe(false)
    expect(chain(editor)).toBe('code-block | p')
  })
})
