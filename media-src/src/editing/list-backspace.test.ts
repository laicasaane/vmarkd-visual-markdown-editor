// @vitest-environment jsdom
//
// Unit coverage for `backspaceOutdentTarget` — the pure DECISION logic (top-level-first / empty-item
// / wrong-caret-position exclusions, task/plain position-0 handling, nested-vs-top-level routing).
// That's the part of this module that changed shape in the move from a document keydown listener to
// a `fixList`-internal seam call (task 462), and it needs no Vditor/Lute instance to test.
//
// `outdentOrLiftListItemOnBackspace`'s DOM-mutating half (past the guard: `listOutdent` /
// `liftTopLevelItemToParagraph`) calls into Vditor's own `execAfterRender` pipeline, which needs a
// working Lute instance and a near-complete `IVditor` (options.counter, options.cache, undo stack,
// …) to run without throwing — faithfully mocking that would test the mock, not the code. That path
// is exercised for real (real Vditor, real Lute) by `media-src/e2e/list.spec.ts`'s "list-backspace.ts
// + list-tight.ts wired together" tests and by `test/vscode-e2e/list-backspace.spec.ts` in the
// actual webview.
import { beforeEach, describe, expect, it } from 'vitest'
import { backspaceOutdentTarget } from './list-backspace'

function mount(html: string): HTMLElement {
  document.body.innerHTML = `<div id="ed">${html}</div>`
  return document.getElementById('ed') as HTMLElement
}

// A collapsed range at the very start of `li`'s first text node (or its contents, if none).
function rangeAtStart(li: HTMLElement): Range {
  const range = document.createRange()
  const text = [...li.childNodes].find((n) => n.nodeType === Node.TEXT_NODE)
  if (text) range.setStart(text, 0)
  else range.selectNodeContents(li)
  range.collapse(true)
  return range
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('backspaceOutdentTarget', () => {
  it('leaves a TOP-LEVEL first item alone (fixList:474 handles it, gated to top-level-only)', () => {
    const ed = mount('<ul><li id="li">one</li><li>two</li></ul>')
    const li = ed.querySelector('#li') as HTMLElement
    expect(backspaceOutdentTarget(li, rangeAtStart(li), ed)).toBeNull()
  })

  it('routes a NESTED first item to "nested" (fixList:474 does NOT handle it cleanly — see module header)', () => {
    const ed = mount('<ul><li>parent<ul><li id="li">child</li></ul></li></ul>')
    const li = ed.querySelector('#li') as HTMLElement
    expect(backspaceOutdentTarget(li, rangeAtStart(li), ed)).toBe('nested')
  })

  it('routes a NESTED non-first item to "nested" too (task 428\'s original merge case)', () => {
    const ed = mount(
      '<ul><li>parent<ul><li>childone</li><li id="li">childtwo</li></ul></li></ul>',
    )
    const li = ed.querySelector('#li') as HTMLElement
    expect(backspaceOutdentTarget(li, rangeAtStart(li), ed)).toBe('nested')
  })

  it('routes a TOP-LEVEL non-first item to "top-level" (task 428\'s original merge case)', () => {
    const ed = mount('<ol><li>one</li><li id="li">two</li></ol>')
    const li = ed.querySelector('#li') as HTMLElement
    expect(backspaceOutdentTarget(li, rangeAtStart(li), ed)).toBe('top-level')
  })

  it('leaves an EMPTY item alone (fixList\'s "align to previous" branch handles it)', () => {
    const ed = mount('<ul><li>one</li><li id="li"></li></ul>')
    const li = ed.querySelector('#li') as HTMLElement
    expect(backspaceOutdentTarget(li, rangeAtStart(li), ed)).toBeNull()
  })

  it('treats a zero-width-space-only item as empty', () => {
    const ed = mount('<ul><li>one</li><li id="li">​</li></ul>')
    const li = ed.querySelector('#li') as HTMLElement
    expect(backspaceOutdentTarget(li, rangeAtStart(li), ed)).toBeNull()
  })

  it('leaves a NON-first item alone when the caret is mid-text (not a "delete the marker" gesture)', () => {
    const ed = mount('<ul><li>one</li><li id="li">two</li></ul>')
    const li = ed.querySelector('#li') as HTMLElement
    const range = document.createRange()
    const text = li.firstChild as Text
    range.setStart(text, 2) // caret after "tw", not at the start
    range.collapse(true)
    expect(backspaceOutdentTarget(li, range, ed)).toBeNull()
  })

  it('a checklist item counts the checkbox as position 0 — caret right after it is still "the start"', () => {
    const ed = mount(
      '<ul><li>one</li><li id="li" class="vditor-task"><input type="checkbox">two</li></ul>',
    )
    const li = ed.querySelector('#li') as HTMLElement
    const range = document.createRange()
    range.setStart(li, 1) // between the checkbox and the text — position 1, the task-item start
    range.collapse(true)
    expect(backspaceOutdentTarget(li, range, ed)).toBe('top-level')
  })

  it('a checklist item past the start (caret INTO the text, not right after the checkbox) is left alone', () => {
    const ed = mount(
      '<ul><li>one</li><li id="li" class="vditor-task"><input type="checkbox">two</li></ul>',
    )
    const li = ed.querySelector('#li') as HTMLElement
    const range = document.createRange()
    const text = li.lastChild as Text
    range.setStart(text, 2) // two characters INTO "two" — well past the checklist start
    range.collapse(true)
    expect(backspaceOutdentTarget(li, range, ed)).toBeNull()
  })
})
