// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CARET_INSIDE_ATTR } from './caret-link'
import { observeCaretLink } from './caret-link-decorate'

// Task 457 — the DOM-observer half of caret-link.ts's pure core. Drives `data-caret-inside` off
// REAL `selectionchange` events (not a manual applyCaretInside call), which is the one thing
// caret-link.test.ts's jsdom-selection-object stubs can't exercise.
//
// Deterministic rAF (same pattern as callouts.test.ts's "observeCallouts scoping" block, and
// observe-coalesce.test.ts): coalescePerFrame's leading edge runs synchronously, but install
// itself ALSO calls `run()` once and so arms a trailing-edge rAF — every SUBSEQUENT selectionchange
// within the same synchronous test therefore only ever reaches the coalesced trailing pass, not the
// leading edge. A real, un-stubbed jsdom rAF won't resolve within a plain `await`, which would
// silently strand the update — so stub it and flush explicitly via `fireFrame()`.
let frameCallbacks: FrameRequestCallback[]
beforeEach(() => {
  frameCallbacks = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frameCallbacks.push(cb)
    return frameCallbacks.length
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    // Mark the slot cancelled so a later flush of frameCallbacks can't
    // re-invoke a callback the code under test already cancelled.
    frameCallbacks[id - 1] = () => {
      /* cancelled */
    }
  })
})
const fireFrame = () => {
  const cbs = frameCallbacks
  frameCallbacks = []
  for (const cb of cbs) cb(0)
}

// Accepts either an element (places the caret inside its first child/text) or a text node
// directly (places the caret at `offset` within it) — the "caret leaves the link for plain prose"
// test needs the latter to land in the paragraph's trailing text run. Fires selectionchange AND
// flushes the coalesced trailing rAF, so callers see the settled result.
function placeCaretIn(target: Node, offset = 1): void {
  const node =
    target.nodeType === Node.TEXT_NODE
      ? target
      : ((target as Element).firstChild ?? target)
  const textOffset =
    node.nodeType === Node.TEXT_NODE
      ? Math.min(offset, (node.textContent ?? '').length)
      : 0
  const range = document.createRange()
  range.setStart(node, textOffset)
  range.collapse(true)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
  document.dispatchEvent(new Event('selectionchange'))
  fireFrame()
}

let dispose: (() => void) | undefined

afterEach(() => {
  vi.unstubAllGlobals()
  dispose?.()
  dispose = undefined
  window.getSelection()?.removeAllRanges()
  document.body.innerHTML = ''
})

describe('observeCaretLink', () => {
  it('decorates the wiki chip the caret moves into, on selectionchange', () => {
    document.body.innerHTML =
      '<div id="app"><p>before <span data-wiki-link="1">Page A</span> after</p></div>'
    const app = document.getElementById('app')!
    dispose = observeCaretLink(app)
    const chip = app.querySelector('[data-wiki-link]')!
    placeCaretIn(chip)
    expect(chip.getAttribute(CARET_INSIDE_ATTR)).toBe('1')
  })

  it('clears the decoration when the caret leaves the link for plain prose', () => {
    document.body.innerHTML =
      '<div id="app"><p>before <span data-wiki-link="1">Page A</span> after</p></div>'
    const app = document.getElementById('app')!
    dispose = observeCaretLink(app)
    const chip = app.querySelector('[data-wiki-link]')!
    const p = app.querySelector('p')!
    placeCaretIn(chip)
    expect(chip.hasAttribute(CARET_INSIDE_ATTR)).toBe(true)
    placeCaretIn(p.lastChild!, 0) // trailing " after" text node
    expect(chip.hasAttribute(CARET_INSIDE_ATTR)).toBe(false)
  })

  // Selectionchange is document-wide; a caret that lands OUTSIDE this instance's root must not
  // decorate anything inside it, even though `linkLikeInSelection` alone (with no root awareness)
  // would still resolve to whatever link-like element the anchor sits in.
  it('ignores a selection anchored outside this root (previewEl vs #app scoping)', () => {
    document.body.innerHTML =
      '<div id="app"><span data-wiki-link="1">In App</span></div>' +
      '<div id="preview"><span data-wiki-link="1">In Preview</span></div>'
    const app = document.getElementById('app')!
    const preview = document.getElementById('preview')!
    dispose = observeCaretLink(app)
    placeCaretIn(preview.querySelector('[data-wiki-link]')!)
    expect(
      app.querySelector('[data-wiki-link]')!.hasAttribute(CARET_INSIDE_ATTR),
    ).toBe(false)
  })

  it('runs an initial sync on install (caret already placed before observeCaretLink is called)', () => {
    document.body.innerHTML =
      '<div id="app"><span data-wiki-link="1">Page A</span></div>'
    const app = document.getElementById('app')!
    const chip = app.querySelector('[data-wiki-link]')!
    const range = document.createRange()
    range.setStart(chip.firstChild!, 1)
    range.collapse(true)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    dispose = observeCaretLink(app) // install's own leading run reads the ALREADY-placed caret
    expect(chip.getAttribute(CARET_INSIDE_ATTR)).toBe('1')
  })

  it('the disposer stops further decoration on later selection changes', () => {
    document.body.innerHTML =
      '<div id="app"><span data-wiki-link="1">Page A</span></div>'
    const app = document.getElementById('app')!
    const stop = observeCaretLink(app)
    stop()
    placeCaretIn(app.querySelector('[data-wiki-link]')!)
    expect(
      app.querySelector('[data-wiki-link]')!.hasAttribute(CARET_INSIDE_ATTR),
    ).toBe(false)
  })

  it('tolerates a null root, returning a no-op disposer', () => {
    expect(() => observeCaretLink(null)()).not.toThrow()
  })
})
