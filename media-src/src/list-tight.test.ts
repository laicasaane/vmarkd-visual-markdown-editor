// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { observeTightLists, repairTightLists } from './list-tight'

const SUB =
  '<ul data-tight="true" data-marker="*" data-block="0"><li data-marker="*">second entry</li></ul>'

/** The exact DOM a Backspace-merge leaves behind, measured in a real VS Code. */
const CORRUPTED =
  `<ol data-tight="true" data-marker="1." data-block="0">` +
  `<li data-marker="1.">Analysis of email threads<p data-block="0">first entry</p>${SUB}</li>` +
  `</ol>`

/** What Lute emits for a list the user genuinely wrote loose: no data-tight, every item wrapped. */
const GENUINELY_LOOSE =
  `<ul data-marker="*" data-block="0">` +
  `<li data-marker="*"><p data-block="0">one</p></li>` +
  `<li data-marker="*"><p data-block="0">two</p></li>` +
  `</ul>`

function mount(html: string): HTMLElement {
  document.body.innerHTML = `<div id="ed">${html}</div>`
  return document.getElementById('ed') as HTMLElement
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('repairTightLists', () => {
  it('unwraps the paragraph a merge left inside a tight list item', () => {
    const ed = mount(CORRUPTED)
    expect(repairTightLists(ed)).toBe(1)
    expect(ed.querySelector('li > p')).toBeNull()
    expect(ed.querySelector('li')?.textContent).toBe(
      'Analysis of email threadsfirst entrysecond entry',
    )
  })

  it('keeps the nested sublist where it was', () => {
    // The item's structure must survive the unwrap — only the wrapper goes.
    const ed = mount(CORRUPTED)
    repairTightLists(ed)
    const item = ed.querySelector('li') as HTMLElement
    expect(item.querySelector('ul')).not.toBeNull()
    expect(item.lastElementChild?.tagName).toBe('UL')
  })

  it('leaves a genuinely loose list completely alone', () => {
    // The half that makes this safe: a list the user meant to be loose carries NO data-tight, so it
    // is never even looked at. Without this the repair would silently flatten real formatting.
    const ed = mount(GENUINELY_LOOSE)
    const before = ed.innerHTML
    expect(repairTightLists(ed)).toBe(0)
    expect(ed.innerHTML).toBe(before)
  })

  it('leaves an undamaged tight list alone', () => {
    const ed = mount(
      `<ol data-tight="true" data-marker="1." data-block="0"><li data-marker="1.">Parent${SUB}</li></ol>`,
    )
    const before = ed.innerHTML
    expect(repairTightLists(ed)).toBe(0)
    expect(ed.innerHTML).toBe(before)
  })

  it('is idempotent', () => {
    const ed = mount(CORRUPTED)
    repairTightLists(ed)
    const after = ed.innerHTML
    expect(repairTightLists(ed)).toBe(0)
    expect(ed.innerHTML).toBe(after)
  })

  it('moves the caret-bearing text NODE rather than re-creating it', () => {
    // The caret is inside the merged text at the moment of repair — that is when this runs. Moving
    // the same node is what lets a browser keep the selection on it; re-creating it would drop the
    // caret. Asserted here as node identity, because jsdom does not track a Range across a move
    // (real Chromium does) — the caret itself is asserted in the real-VS-Code spec by typing.
    const ed = mount(CORRUPTED)
    const text = ed.querySelector('p')?.firstChild as Text

    repairTightLists(ed)

    expect(
      text.isConnected,
      'the same text node is still in the document',
    ).toBe(true)
    expect(text.parentElement?.tagName).toBe('LI')
  })

  it('repairs a damaged item without touching a loose sibling list', () => {
    const ed = mount(`${CORRUPTED}${GENUINELY_LOOSE}`)
    expect(repairTightLists(ed)).toBe(1)
    expect(ed.querySelectorAll('li > p')).toHaveLength(2) // the loose list's two, untouched
  })
})

describe('observeTightLists', () => {
  it('repairs damage that appears after it is attached', async () => {
    const ed = mount(
      `<ol data-tight="true" data-marker="1." data-block="0"><li data-marker="1.">Parent</li></ol>`,
    )
    const dispose = observeTightLists(() => ed)
    const item = ed.querySelector('li') as HTMLElement
    item.insertAdjacentHTML('beforeend', '<p data-block="0">merged</p>')

    await new Promise((r) => setTimeout(r, 30))
    expect(ed.querySelector('li > p')).toBeNull()
    dispose()
  })

  it('stops repairing once disposed', async () => {
    const ed = mount(
      `<ol data-tight="true" data-marker="1." data-block="0"><li data-marker="1.">Parent</li></ol>`,
    )
    observeTightLists(() => ed)()
    const item = ed.querySelector('li') as HTMLElement
    item.insertAdjacentHTML('beforeend', '<p data-block="0">merged</p>')

    await new Promise((r) => setTimeout(r, 30))
    expect(ed.querySelector('li > p')).not.toBeNull()
  })
})
