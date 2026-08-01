// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// expandMarker touches Vditor's real IR marker machinery (hasClosestByClassName walks on live
// render state we don't build here) — it's a side effect the entering path triggers, not
// something callout-nav.ts's own decision logic depends on the result of. Stub it so these tests
// exercise ONLY the guard preamble / edge-detection / keyup-fallback logic that is otherwise
// untested (task 484), same boundary nav-geometry.test.ts draws around caretLineRect. The stub
// still adds `vditor-ir__node--expand` — callout-nav.ts's own header names that as exactly what a
// real in-callout caret move (i.e. a real expandMarker call) triggers, and it's the signal these
// tests use to confirm `enter()` actually ran, since callout-nav.ts itself never touches the class.
vi.mock('vditor/src/ts/ir/expandMarker', () => ({
  expandMarker: vi.fn((range: Range) => {
    const start = range.startContainer
    const el = start.nodeType === 1 ? (start as Element) : start.parentElement
    el?.closest('blockquote[data-callout]')?.classList.add(
      'vditor-ir__node--expand',
    )
  }),
}))

import { expandMarker } from 'vditor/src/ts/ir/expandMarker'
import { setupCalloutArrowNav } from './callout-nav'

// jsdom implements neither Range.getBoundingClientRect nor Range.getClientRects (verified via a
// throwaway probe, not assumed — see nav-geometry.test.ts's header for the same finding). Both
// call sites are reachable from callout-nav's onKeydown (via caretLineRect), and only the second is
// try/caught, so an unpatched Range would throw "is not a function" the first time the handler runs
// in this environment. Patch a zero rect, matching how a real caret sitting exactly on an element
// boundary is reported before nav-geometry's own fallback logic runs (the fallback then also hits
// jsdom's all-zero Element.getBoundingClientRect, so `tol` bottoms out at 8 and `onEdge` is always
// true here) — this environment cannot exercise the "caret NOT on the edge line" branch at all;
// that arithmetic is nav-geometry.test.ts's job, not this file's.
if (!Range.prototype.getBoundingClientRect) {
  const zero = {
    height: 0,
    width: 0,
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect
  Range.prototype.getBoundingClientRect = () => zero
}

// Three branches in callout-nav.ts stay uncovered here, all for the same reason: this environment
// cannot produce the inputs that would exercise them.
//   - `caretLineRect` returning null (`if (!cr) return`) needs a text node with NO parentElement —
//     unreachable once `editor.contains(startContainer)` already passed (a contained node always
//     has an element ancestor chain).
//   - `onEdge` being false (`if (!onEdge) return`) needs a real, non-zero caret rect — jsdom has no
//     layout engine at all (see the patch above), so every rect here is zero and `onEdge` is always
//     true.
//   - `topLevelBlock` returning null after the same containment check, for the identical reason.
// 96.7% branch / 100% line coverage on this file as of task 484; these three are the honest floor.

const PREVIEW_CLASS = 'vmarkd-callout__preview'
const EXPAND_CLASS = 'vditor-ir__node--expand'

function editorWith(innerHTML: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = innerHTML
  document.body.replaceChildren(el)
  return el
}

// Mirrors the real dual-node shape (callouts.ts): a source <p> (the marker + body text, ONE text
// node, matching how the live editor stores it — see callout-edit.spec.ts) plus a non-editable
// `.vmarkd-callout__preview` sibling `edgeEditableText` must skip.
function calloutHTML(collapsed: boolean, body: string): string {
  return (
    `<blockquote data-callout="note"${collapsed ? '' : ` class="${EXPAND_CLASS}"`}>` +
    `<p>[!NOTE]\n${body}</p>` +
    `<div class="${PREVIEW_CLASS}" contenteditable="false"><div>NOTE</div><div>${body}</div></div>` +
    `</blockquote>`
  )
}

// Direct-child <p> lookup, excluding the callout's OWN internal source <p> (which also matches a
// bare 'p' selector, since it's a normal descendant — a plain `querySelector('p')` /
// `querySelectorAll('p')[n]` over the whole editor silently picks that one up instead of the
// top-level paragraph a test meant to grab, whenever it appears earlier in document order).
function topP(editor: HTMLElement, n: number): HTMLElement {
  return [...editor.children].filter((c) => c.tagName === 'P')[n] as HTMLElement
}

function place(node: Node, offset: number): void {
  const r = document.createRange()
  r.setStart(node, offset)
  r.collapse(true)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(r)
}

function press(key: string): boolean {
  return document.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  )
}

function release(key: string): boolean {
  return document.dispatchEvent(
    new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }),
  )
}

// Every test wires the same (editor, no-op vditor stand-in) pair — expandMarker is mocked above
// and ignores its second argument, so the real inner-vditor instance is never needed here.
function setup(editor: HTMLElement): () => void {
  return setupCalloutArrowNav(
    () => editor,
    () => ({}),
  )
}

function calloutState(editor: HTMLElement): {
  expanded: boolean
  anchorInSource: boolean
  anchorOffset: number
} {
  const bq = editor.querySelector('blockquote[data-callout]') as HTMLElement
  const sel = window.getSelection()
  const anchor = sel?.rangeCount ? sel.anchorNode : null
  const anchorHost = anchor
    ? anchor.nodeType === 1
      ? (anchor as Element)
      : anchor.parentElement
    : null
  return {
    expanded: bq.classList.contains(EXPAND_CLASS),
    anchorInSource: !!(
      anchor &&
      bq.contains(anchor) &&
      !anchorHost?.closest(`.${PREVIEW_CLASS}`)
    ),
    anchorOffset: sel?.anchorOffset ?? -1,
  }
}

describe('setupCalloutArrowNav', () => {
  let teardown: (() => void) | null = null

  beforeEach(() => {
    document.body.replaceChildren()
    vi.mocked(expandMarker).mockClear()
  })

  afterEach(() => {
    teardown?.()
    teardown = null
  })

  describe('keydown — entering a collapsed callout', () => {
    it('ArrowDown from the paragraph above enters at the START of the callout source', () => {
      const editor = editorWith(
        `<p>above</p>${calloutHTML(true, 'body text')}<p>below</p>`,
      )
      teardown = setup(editor)
      const above = topP(editor, 0).firstChild!
      place(above, (above as Text).data.length) // end of "above"

      const notPrevented = press('ArrowDown')

      expect(notPrevented).toBe(false) // preventDefault() was called
      const s = calloutState(editor)
      expect(s.expanded).toBe(true) // dual-node expanded so the caret can land in the source
      expect(s.anchorInSource).toBe(true) // not in the non-editable preview
      expect(s.anchorOffset).toBe(0) // entered at the FIRST editable position
      expect(expandMarker).toHaveBeenCalledTimes(1) // what a real in-callout move triggers
    })

    it('ArrowUp from the paragraph below enters at the END of the callout source', () => {
      const editor = editorWith(
        `<p>above</p>${calloutHTML(true, 'body text')}<p>below</p>`,
      )
      teardown = setup(editor)
      const below = topP(editor, 1).firstChild!
      place(below, 0) // start of "below"

      press('ArrowUp')

      const s = calloutState(editor)
      const bodyText = editor.querySelector('blockquote p')!.textContent!
      expect(s.expanded).toBe(true)
      expect(s.anchorInSource).toBe(true)
      expect(s.anchorOffset).toBe(bodyText.length) // entered at the LAST editable position
    })

    it('does nothing when the sibling callout is already expanded', () => {
      const editor = editorWith(
        `<p>above</p>${calloutHTML(false, 'body text')}<p>below</p>`,
      )
      teardown = setup(editor)
      const above = topP(editor, 0).firstChild!
      place(above, (above as Text).data.length)

      const notPrevented = press('ArrowDown')

      expect(notPrevented).toBe(true) // native move left alone
      expect(expandMarker).not.toHaveBeenCalled()
    })

    it('does nothing when the sibling is a plain paragraph, not a callout', () => {
      const editor = editorWith('<p>above</p><p>plain</p><p>below</p>')
      teardown = setup(editor)
      const above = topP(editor, 0).firstChild!
      place(above, (above as Text).data.length)

      expect(press('ArrowDown')).toBe(true)
      expect(expandMarker).not.toHaveBeenCalled()
    })

    it('ignores modified arrow presses (Ctrl/Cmd/Alt/Shift)', () => {
      const editor = editorWith(`<p>above</p>${calloutHTML(true, 'body text')}`)
      teardown = setup(editor)
      const above = topP(editor, 0).firstChild!
      place(above, (above as Text).data.length)

      const notPrevented = document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowDown',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      )

      expect(notPrevented).toBe(true)
      expect(expandMarker).not.toHaveBeenCalled()
    })

    it('a malformed callout with no editable text does not crash and leaves the snapshot for keyup', () => {
      const editor = editorWith(
        '<p>above</p><blockquote data-callout="note"><div class="vmarkd-callout__preview" contenteditable="false">NOTE</div></blockquote>',
      )
      teardown = setup(editor)
      const above = topP(editor, 0).firstChild!
      place(above, (above as Text).data.length)

      // enter() finds no editable text (edgeEditableText returns null) → returns false → the
      // snapshot survives (keydown never clears it), but nothing is prevented or entered.
      expect(() => press('ArrowDown')).not.toThrow()
      expect(expandMarker).not.toHaveBeenCalled()
      const bq = editor.querySelector('blockquote')!
      expect(bq.classList.contains(EXPAND_CLASS)).toBe(false)
    })

    it('multiple source text nodes: skips whitespace-only ones, picks the real first/last', () => {
      // A source <p> split across several text/element children (e.g. an inline mark inside the
      // body) — edgeEditableText must walk past the blank leading text and the whitespace-only
      // trailing one to find the real first/last non-empty text.
      const editor = editorWith(
        '<p>above</p>' +
          '<blockquote data-callout="note">' +
          '<p>   <em>middle</em>tail </p>' +
          '<div class="vmarkd-callout__preview" contenteditable="false">NOTE</div>' +
          '</blockquote>',
      )
      teardown = setup(editor)
      const above = topP(editor, 0).firstChild!
      place(above, (above as Text).data.length)

      press('ArrowDown')

      const sel = window.getSelection()!
      // entering from ABOVE (down) lands at the FIRST non-blank text node ("middle", not the
      // leading whitespace run) — at its own start (offset 0).
      expect((sel.anchorNode as Text).data).toBe('middle')
      expect(sel.anchorOffset).toBe(0)
    })

    it('does not preempt inside a block Vditor splices from itself (e.g. a code block)', () => {
      const editor = editorWith(
        '<div data-block="0" data-type="code-block"><pre><code>x</code></pre></div>' +
          calloutHTML(true, 'body text'),
      )
      teardown = setup(editor)
      const code = editor.querySelector('code')!.firstChild!
      place(code, 1)

      // keydown defers (vditorHandlesArrows) — no entry YET, but the snapshot survives for keyup
      const notPreventedOnKeydown = press('ArrowDown')
      expect(notPreventedOnKeydown).toBe(true)
      expect(expandMarker).not.toHaveBeenCalled()

      // nothing moved the selection (jsdom doesn't simulate native arrow movement) — keyup's
      // "caret didn't move at all" fallback (case 3) then enters the callout itself.
      release('ArrowDown')
      const s = calloutState(editor)
      expect(s.expanded).toBe(true)
      expect(expandMarker).toHaveBeenCalledTimes(1)
    })
  })

  describe('keyup fallback — catches what keydown could not predict', () => {
    function setupDeferredSnapshot(editor: HTMLElement): void {
      // A code-block current-block defers entry at keydown (vditorHandlesArrows) while still
      // snapshotting — the same shape production hits when Vditor's own arrow handling runs first.
      teardown = setup(editor)
      const code = editor.querySelector('code')!.firstChild!
      place(code, 1)
      press('ArrowDown')
      expect(expandMarker).not.toHaveBeenCalled() // keydown deferred, as expected
    }

    it('case: caret landed inside the non-editable preview → enters the callout', () => {
      const editor = editorWith(
        '<div data-block="0" data-type="code-block"><pre><code>x</code></pre></div>' +
          calloutHTML(true, 'body text'),
      )
      setupDeferredSnapshot(editor)

      const previewText = editor.querySelector(`.${PREVIEW_CLASS} div`)!
        .firstChild!
      place(previewText, 0) // simulate the caret landing in the preview

      release('ArrowDown')

      const s = calloutState(editor)
      expect(s.expanded).toBe(true)
      expect(s.anchorInSource).toBe(true) // pulled OUT of the preview, into the source
      expect(expandMarker).toHaveBeenCalledTimes(1)
    })

    it('case: caret landed ON the preview element itself (not a text node inside it)', () => {
      const editor = editorWith(
        '<div data-block="0" data-type="code-block"><pre><code>x</code></pre></div>' +
          calloutHTML(true, 'body text'),
      )
      setupDeferredSnapshot(editor)

      const preview = editor.querySelector(`.${PREVIEW_CLASS}`)!
      const r = document.createRange()
      r.setStart(preview, 0) // collapsed directly on the ELEMENT, not one of its text children
      r.collapse(true)
      const sel = window.getSelection()!
      sel.removeAllRanges()
      sel.addRange(r)

      release('ArrowDown')

      const s = calloutState(editor)
      expect(s.expanded).toBe(true)
      expect(expandMarker).toHaveBeenCalledTimes(1)
    })

    it('a preview-classed element with no enclosing callout blockquote is a no-op (defensive)', () => {
      const editor = editorWith(
        '<div data-block="0" data-type="code-block"><pre><code>x</code></pre></div>' +
          `<div class="${PREVIEW_CLASS}"><span>orphan</span></div>${calloutHTML(true, 'body text')}`,
      )
      setupDeferredSnapshot(editor)

      const orphanText = editor.querySelector(`.${PREVIEW_CLASS} span`)!
        .firstChild!
      place(orphanText, 0)

      expect(() => release('ArrowDown')).not.toThrow()
      expect(expandMarker).not.toHaveBeenCalled()
    })

    it('an editor disconnected between keydown and keyup is left alone', () => {
      const editor = editorWith(
        '<div data-block="0" data-type="code-block"><pre><code>x</code></pre></div>' +
          calloutHTML(true, 'body text'),
      )
      setupDeferredSnapshot(editor)
      editor.remove() // simulate the webview tearing down mid-keystroke

      expect(() => release('ArrowDown')).not.toThrow()
      expect(expandMarker).not.toHaveBeenCalled()
    })

    it('case: selection dropped entirely → enters the callout', () => {
      const editor = editorWith(
        '<div data-block="0" data-type="code-block"><pre><code>x</code></pre></div>' +
          calloutHTML(true, 'body text'),
      )
      setupDeferredSnapshot(editor)
      window.getSelection()?.removeAllRanges()

      release('ArrowDown')

      const s = calloutState(editor)
      expect(s.expanded).toBe(true)
      expect(expandMarker).toHaveBeenCalledTimes(1)
    })

    it('case: caret did not move at all → enters the callout', () => {
      const editor = editorWith(
        '<div data-block="0" data-type="code-block"><pre><code>x</code></pre></div>' +
          calloutHTML(true, 'body text'),
      )
      setupDeferredSnapshot(editor)
      // selection is exactly where it was left before the keydown (jsdom performs no native move)

      release('ArrowDown')

      const s = calloutState(editor)
      expect(s.expanded).toBe(true)
      expect(expandMarker).toHaveBeenCalledTimes(1)
    })

    it('case: caret skipped past the callout entirely → pulls it back in', () => {
      const editor = editorWith(
        '<div data-block="0" data-type="code-block"><pre><code>x</code></pre></div>' +
          calloutHTML(true, 'body text') +
          '<p>after</p>',
      )
      setupDeferredSnapshot(editor)
      const after = topP(editor, 0).firstChild!
      place(after, 0) // landed BEYOND the collapsed callout

      release('ArrowDown')

      const s = calloutState(editor)
      expect(s.expanded).toBe(true)
      expect(expandMarker).toHaveBeenCalledTimes(1)
    })

    it('case: selection re-normalised to the opposite side (the jump-to-top shape) → re-enters', () => {
      const editor = editorWith(
        '<p>before</p>' +
          '<div data-block="0" data-type="code-block"><pre><code>x</code></pre></div>' +
          calloutHTML(true, 'body text'),
      )
      setupDeferredSnapshot(editor)
      const before = topP(editor, 0).firstChild!
      place(before, 0) // reset to the OPPOSITE side of the snapshot block

      release('ArrowDown')

      const s = calloutState(editor)
      expect(s.expanded).toBe(true)
      expect(expandMarker).toHaveBeenCalledTimes(1)
    })

    it('no-op when the landed block is the sibling callout itself (already correctly placed)', () => {
      const editor = editorWith(
        '<div data-block="0" data-type="code-block"><pre><code>x</code></pre></div>' +
          calloutHTML(true, 'body text'),
      )
      setupDeferredSnapshot(editor)
      const source = editor.querySelector('blockquote p')!.firstChild!
      place(source, 2) // caret already inside the callout's own source

      release('ArrowDown')

      // no re-entry machinery kicked in (no second expandMarker call) — it was already there
      expect(expandMarker).not.toHaveBeenCalled()
    })

    it('a bare keyup with no prior snapshot is a no-op (does not throw)', () => {
      const editor = editorWith(calloutHTML(true, 'body text'))
      teardown = setup(editor)
      expect(() => release('ArrowDown')).not.toThrow()
      expect(expandMarker).not.toHaveBeenCalled()
    })

    it('a non-arrow keyup after a valid snapshot is a no-op', () => {
      const editor = editorWith(
        '<div data-block="0" data-type="code-block"><pre><code>x</code></pre></div>' +
          calloutHTML(true, 'body text'),
      )
      setupDeferredSnapshot(editor)

      document.dispatchEvent(
        new KeyboardEvent('keyup', {
          key: 'a',
          bubbles: true,
          cancelable: true,
        }),
      )

      expect(expandMarker).not.toHaveBeenCalled()
    })

    it('does nothing when the snapshotted block has no collapsed-callout sibling at all', () => {
      const editor = editorWith(
        '<div data-block="0" data-type="code-block"><pre><code>x</code></pre></div><p>plain</p>',
      )
      setupDeferredSnapshot(editor)

      release('ArrowDown')

      expect(expandMarker).not.toHaveBeenCalled()
    })

    it('ArrowUp: caret skipped past the callout (landed above it) → pulls it back in', () => {
      const editor = editorWith(
        '<p>before</p>' +
          calloutHTML(true, 'body text') +
          '<div data-block="0" data-type="code-block"><pre><code>x</code></pre></div>',
      )
      teardown = setup(editor)
      const code = editor.querySelector('code')!.firstChild!
      place(code, 1)
      press('ArrowUp') // defers (code block) — snapshots block=code-block, down=false
      expect(expandMarker).not.toHaveBeenCalled()

      const before = topP(editor, 0).firstChild!
      place(before, 0) // landed BEFORE the callout — skipped it going up

      release('ArrowUp')

      const s = calloutState(editor)
      expect(s.expanded).toBe(true)
      expect(expandMarker).toHaveBeenCalledTimes(1)
    })

    it('ArrowUp: selection reset to the opposite (following) side → re-enters', () => {
      const editor = editorWith(
        calloutHTML(true, 'body text') +
          '<div data-block="0" data-type="code-block"><pre><code>x</code></pre></div>' +
          '<p>after</p>',
      )
      teardown = setup(editor)
      const code = editor.querySelector('code')!.firstChild!
      place(code, 1)
      press('ArrowUp')
      expect(expandMarker).not.toHaveBeenCalled()

      const after = topP(editor, 0).firstChild!
      place(after, 0) // landed on the OPPOSITE side of the snapshot block

      release('ArrowUp')

      const s = calloutState(editor)
      expect(s.expanded).toBe(true)
      expect(expandMarker).toHaveBeenCalledTimes(1)
    })
  })

  describe('keydown guard preamble', () => {
    it('a non-collapsed (range) selection is left alone', () => {
      const editor = editorWith(`<p>above</p>${calloutHTML(true, 'body text')}`)
      teardown = setup(editor)
      const above = topP(editor, 0).firstChild as Text
      const r = document.createRange()
      r.setStart(above, 0)
      r.setEnd(above, above.data.length) // NOT collapsed — a real text selection
      const sel = window.getSelection()!
      sel.removeAllRanges()
      sel.addRange(r)

      expect(press('ArrowDown')).toBe(true) // native move left alone
      expect(expandMarker).not.toHaveBeenCalled()
    })

    it('a selection outside the editor entirely is left alone', () => {
      const editor = editorWith(`<p>above</p>${calloutHTML(true, 'body text')}`)
      teardown = setup(editor)
      const outsider = document.createElement('p')
      outsider.textContent = 'outside'
      document.body.appendChild(outsider)
      place(outsider.firstChild!, 0)

      expect(press('ArrowDown')).toBe(true)
      expect(expandMarker).not.toHaveBeenCalled()
    })
  })

  it('the returned teardown removes both listeners', () => {
    const editor = editorWith(`<p>above</p>${calloutHTML(true, 'body text')}`)
    const stop = setup(editor)
    stop()
    const above = topP(editor, 0).firstChild!
    place(above, (above as Text).data.length)

    expect(press('ArrowDown')).toBe(true) // no longer intercepted
    expect(expandMarker).not.toHaveBeenCalled()
  })
})
