// @vitest-environment jsdom
//
// Unit coverage for the pure DOM traversal `findEnclosingListRoot` relies on (climbing out of
// nested lists to the top-level root, and `collectListRoots`'s "top-level only" filter via the
// same underlying check). The DOM-mutating half (normalizeListRoot / fixListNumberingAtCaret /
// fixAllListNumbering) calls Vditor's own execAfterRender pipeline, which needs a working Lute
// instance and a near-complete IVditor to run without throwing — same reasoning as
// list-backspace.test.ts's header. That half is exercised for real by
// media-src/e2e/list-normalize.spec.ts (harness) and test/vscode-e2e/list-normalize.spec.ts
// (real VS Code webview).
import { execAfterRender } from 'vditor/src/ts/util/fixBrowserBehavior'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  findEnclosingListRoot,
  fixAllListNumbering,
  fixListNumberingAtCaret,
  isListNumberingStale,
} from './list-normalize'

vi.mock('vditor/src/ts/util/fixBrowserBehavior', () => ({
  execAfterRender: vi.fn(),
}))
vi.mock('vditor/src/ts/util/selection', () => ({
  setRangeByWbr: vi.fn(),
}))

function mount(html: string): HTMLElement {
  document.body.innerHTML = `<div id="ed">${html}</div>`
  return document.getElementById('ed') as HTMLElement
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('idempotent list normalization', () => {
  it('does not spin or post an edit for an already normalized ordered list', () => {
    const editor = mount(
      '<ol data-marker="1." data-block="0"><li data-marker="1.">alpha</li><li data-marker="2.">beta</li></ol>',
    )
    const spin = vi.fn((html: string) => html)

    const touched = fixAllListNumbering(
      {
        currentMode: 'ir',
        lute: { SpinVditorIRDOM: spin, SpinVditorDOM: spin },
      },
      editor,
    )

    expect(touched).toBe(0)
    expect(spin).not.toHaveBeenCalled()
    expect(execAfterRender).not.toHaveBeenCalled()
  })

  it('detects nested-only stale ordered markers but ignores unordered lists', () => {
    const editor = mount(`
      <ol data-marker="4." start="4">
        <li data-marker="4.">alpha</li>
        <li data-marker="5.">gamma
          <ol data-marker="1."><li data-marker="2.">nested</li></ol>
        </li>
      </ol>
      <ul><li data-marker="*">plain</li></ul>
    `)
    expect(
      isListNumberingStale(editor.querySelector('ol') as HTMLElement),
    ).toBe(true)
    expect(
      isListNumberingStale(editor.querySelector('ul') as HTMLElement),
    ).toBe(false)
  })

  it('spins one stale list and posts one edit', () => {
    const editor = mount(
      '<ol data-marker="1." data-block="0"><li data-marker="1.">alpha</li><li data-marker="3.">gamma</li></ol>',
    )
    const spin = vi.fn((html: string) =>
      html.replace('data-marker="3."', 'data-marker="2."'),
    )

    const touched = fixAllListNumbering(
      {
        currentMode: 'ir',
        lute: { SpinVditorIRDOM: spin, SpinVditorDOM: spin },
      },
      editor,
    )

    expect(touched).toBe(1)
    expect(spin).toHaveBeenCalledTimes(1)
    expect(execAfterRender).toHaveBeenCalledTimes(1)
    expect(editor.querySelectorAll('li')[1]?.dataset.marker).toBe('2.')
  })

  it('makes the caret-scoped command a no-op when its list is normalized', () => {
    const editor = mount(
      '<ol data-marker="1."><li data-marker="1.">alpha</li><li data-marker="2.">beta</li></ol>',
    )
    const text = editor.querySelector('li')?.firstChild as Text
    const range = document.createRange()
    range.setStart(text, 2)
    range.collapse(true)
    const selection = getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    const spin = vi.fn((html: string) => html)

    expect(
      fixListNumberingAtCaret(
        {
          currentMode: 'ir',
          lute: { SpinVditorIRDOM: spin, SpinVditorDOM: spin },
        },
        editor,
      ),
    ).toBe(false)
    expect(spin).not.toHaveBeenCalled()
    expect(execAfterRender).not.toHaveBeenCalled()
  })
})

describe('findEnclosingListRoot', () => {
  it('returns the list itself for a flat top-level list', () => {
    const ed = mount('<ul><li id="li">one</li><li>two</li></ul>')
    const li = ed.querySelector('#li') as HTMLElement
    const root = findEnclosingListRoot(li, ed)
    expect(root).toBe(ed.querySelector('ul'))
  })

  it('climbs a text node caret target up to its <li>, then to the root', () => {
    const ed = mount('<ul><li id="li">one</li></ul>')
    const li = ed.querySelector('#li') as HTMLElement
    const text = li.firstChild as Text
    expect(findEnclosingListRoot(text, ed)).toBe(ed.querySelector('ul'))
  })

  it('climbs PAST a nested sublist to the outermost root', () => {
    const ed = mount(
      '<ul id="outer"><li>parent<ul id="inner"><li id="li">child</li></ul></li></ul>',
    )
    const li = ed.querySelector('#li') as HTMLElement
    expect(findEnclosingListRoot(li, ed)).toBe(ed.querySelector('#outer'))
  })

  it('climbs multiple nesting levels to the single outermost root', () => {
    const ed = mount(
      '<ul id="l1"><li>a<ol id="l2"><li>b<ul id="l3"><li id="li">c</li></ul></li></ol></li></ul>',
    )
    const li = ed.querySelector('#li') as HTMLElement
    expect(findEnclosingListRoot(li, ed)).toBe(ed.querySelector('#l1'))
  })

  it('treats an ordered list root the same as unordered', () => {
    const ed = mount('<ol><li id="li">one</li></ol>')
    const li = ed.querySelector('#li') as HTMLElement
    expect(findEnclosingListRoot(li, ed)).toBe(ed.querySelector('ol'))
  })

  it('a mixed ordered-inside-unordered nest still climbs to the outer root', () => {
    const ed = mount(
      '<ul id="outer"><li>parent<ol id="inner"><li id="li">child</li></ol></li></ul>',
    )
    const li = ed.querySelector('#li') as HTMLElement
    expect(findEnclosingListRoot(li, ed)).toBe(ed.querySelector('#outer'))
  })

  it('returns null when the caret is outside any list', () => {
    const ed = mount('<p id="p">plain paragraph</p><ul><li>one</li></ul>')
    const p = ed.querySelector('#p') as HTMLElement
    expect(findEnclosingListRoot(p.firstChild, ed)).toBeNull()
  })

  it('returns null for a null node', () => {
    const ed = mount('<ul><li>one</li></ul>')
    expect(findEnclosingListRoot(null, ed)).toBeNull()
  })

  it('finds a list root that sits inside a blockquote (not a direct editor child)', () => {
    const ed = mount(
      '<blockquote><ul id="root"><li id="li">one</li></ul></blockquote>',
    )
    const li = ed.querySelector('#li') as HTMLElement
    expect(findEnclosingListRoot(li, ed)).toBe(ed.querySelector('#root'))
  })

  it('does not escape past `editor` into an ancestor list outside it', () => {
    // The outer <ul> lives OUTSIDE #ed — findEnclosingListRoot must stop at #ed's own
    // top-level list (#inner), never climb into DOM ancestors above the editor root.
    document.body.innerHTML =
      '<ul id="outside"><li><div id="ed"><ul id="inner"><li id="li">one</li></ul></div></li></ul>'
    const ed = document.getElementById('ed') as HTMLElement
    const li = ed.querySelector('#li') as HTMLElement
    expect(findEnclosingListRoot(li, ed)).toBe(ed.querySelector('#inner'))
  })
})
