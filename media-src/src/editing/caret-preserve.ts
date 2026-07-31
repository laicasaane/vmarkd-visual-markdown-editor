// Preserve the caret (and scroll) across a full re-render (Vditor #1912).
//
// `vditor.setValue()` rebuilds the editor's whole DOM, which drops the selection and
// resets scrollTop — so an EXTERNAL document update (git pull, another editor, a
// format-on-save by another tool) that lands while the user is editing yanks the caret
// and viewport to the top. We can't keep the live Range (its nodes are gone after the
// rebuild), so we capture the caret as a character offset into the editor's text, run
// the mutation, then re-derive a caret at that offset in the fresh DOM. Best-effort and
// clamped: for a small external change the caret lands where it was; it never throws and
// never steals focus when the editor wasn't focused.
//
// The re-derive-and-write half is caret.ts's `{ textOffset }` intent (ADR-0007 / task 446) — the
// one intent kind that isn't a `{node, offset}` pair, precisely BECAUSE every old node is gone
// after setValue(); a character offset is what survives the rebuild to re-resolve against the
// fresh DOM. This module keeps the BEFORE-mutation capture (caretOffset) and the scroll handling,
// which are outside the authority's scope (a read, and a non-selection concern, respectively).
import { requestCaret } from './caret'
import { findScroller } from '../chrome/toolbar-scroll-guard'

// Caret position as a character offset into `el`'s text content, or null when there's no
// caret inside the editor (so we don't grab focus on an unfocused editor).
function caretOffset(el: HTMLElement): number | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!el.contains(range.startContainer)) return null
  const pre = range.cloneRange()
  pre.selectNodeContents(el)
  pre.setEnd(range.startContainer, range.startOffset)
  return pre.toString().length
}

// Run `mutate` (a full re-render such as setValue) while keeping the caret + scroll put.
// Exported for both production (main.ts update path) and the e2e mechanism test.
export function preserveCaretAndScroll(vditor: any, mutate: () => void): void {
  const el = vditor?.vditor?.[vditor.getCurrentMode()]?.element as
    | HTMLElement
    | undefined
  if (!el) {
    mutate()
    return
  }
  const offset = caretOffset(el)
  const scroller = findScroller(el)
  const savedScroll = scroller.scrollTop
  mutate()
  // setValue rebuilds synchronously; re-resolve the element (mode can't change here, but
  // the element node is fresh) and restore.
  const fresh = (vditor?.vditor?.[vditor.getCurrentMode()]?.element ||
    el) as HTMLElement
  if (offset != null) {
    requestCaret({ textOffset: offset })
  }
  const sc = findScroller(fresh)
  const max = Math.max(0, sc.scrollHeight - sc.clientHeight)
  sc.scrollTop = Math.min(savedScroll, max)
}
