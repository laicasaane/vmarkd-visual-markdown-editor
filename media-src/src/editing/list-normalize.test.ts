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
import { beforeEach, describe, expect, it } from 'vitest'
import { findEnclosingListRoot } from './list-normalize'

function mount(html: string): HTMLElement {
  document.body.innerHTML = `<div id="ed">${html}</div>`
  return document.getElementById('ed') as HTMLElement
}

beforeEach(() => {
  document.body.innerHTML = ''
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
