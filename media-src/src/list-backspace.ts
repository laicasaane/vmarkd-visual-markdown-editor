// Task 428 — Backspace at the START of a list item's text behaves like a real editor.
//
// Vditor's `fixList` (fixBrowserBehavior.ts) handles Backspace-at-start only for the FIRST item
// (→ paragraph) and for an EMPTY item (→ align to previous). A NON-first item that HAS text falls
// through to the browser default, which MERGES the item's text into the previous item — measured
// "1. otwo" + Backspace → "1. ooneotwo", and a nested child glued onto its parent
// ("- nparentnchildone"). Real editors instead OUTDENT the item (nested → one level out) or LIFT it
// to a plain paragraph (top-level), never merging the text (task 428 probe, 2026-07-30).
//
// We intercept exactly that unhandled case in a document CAPTURE-phase listener — Vditor binds its
// keydown on the editor element (bubble), so stopping propagation in capture keeps its merge from
// running while leaving every OTHER handler (and Vditor's own first-item / empty-item branches,
// which we deliberately do NOT match) untouched.

import {
  execAfterRender,
  listOutdent,
} from 'vditor/src/ts/util/fixBrowserBehavior'
import { hasClosestByMatchTag } from 'vditor/src/ts/util/hasClosest'
import { getSelectPosition, setRangeByWbr } from 'vditor/src/ts/util/selection'

interface VditorLike {
  currentMode: string
  lute: {
    SpinVditorIRDOM: (html: string) => string
    SpinVditorDOM: (html: string) => string
  }
  [mode: string]: unknown
}

// window.vditor is the PUBLIC Vditor instance; the internal IVditor the fixList helpers operate on
// (currentMode, .ir/.wysiwyg[.element], .lute) is `window.vditor.vditor`.
function vditorNow(): VditorLike | null {
  const inst = (window as unknown as { vditor?: { vditor?: VditorLike } })
    .vditor
  const v = inst?.vditor
  return v && (v.currentMode === 'ir' || v.currentMode === 'wysiwyg') ? v : null
}

// Lift a TOP-LEVEL list item out of its list into a plain paragraph, splitting the list around it:
// items before stay a list, this item becomes a `<p>`, items after become a fresh list of the same
// type. Lute re-serialises so ordered lists renumber and the markdown is clean.
function liftTopLevelItemToParagraph(
  vditor: VditorLike,
  li: HTMLElement,
  range: Range,
  editor: HTMLElement,
): void {
  const list = li.parentElement
  if (!list) return
  range.insertNode(document.createElement('wbr'))
  const tag = list.tagName.toLowerCase()
  // Preserve the list's own opening tag (an ordered list carries `start=`, class, data-* etc.).
  const openTag = list.outerHTML.slice(0, list.outerHTML.indexOf('>') + 1)
  const before: string[] = []
  const after: string[] = []
  let seen = false
  for (const child of Array.from(list.children)) {
    if (child === li) {
      seen = true
      continue
    }
    ;(seen ? after : before).push((child as HTMLElement).outerHTML)
  }
  const wrap = (items: string[]) =>
    items.length ? `${openTag}${items.join('')}</${tag}>` : ''
  // A checklist item lifted to a paragraph drops its checkbox — otherwise Lute serialises the leftover
  // `<input>` as literal "[ ]" text at the start of the paragraph.
  const inner = document.createElement('div')
  inner.innerHTML = li.innerHTML
  for (const box of Array.from(inner.querySelectorAll('input'))) box.remove()
  const para = `<p data-block="0">${inner.innerHTML}</p>`
  const html = `${wrap(before)}${para}${wrap(after)}`
  const spin =
    vditor.currentMode === 'wysiwyg'
      ? vditor.lute.SpinVditorDOM
      : vditor.lute.SpinVditorIRDOM
  list.outerHTML = spin.call(vditor.lute, html)
  setRangeByWbr(editor, range)
  execAfterRender(vditor as never)
}

function onKeydown(event: KeyboardEvent): void {
  if (
    event.key !== 'Backspace' ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey ||
    event.isComposing
  )
    return
  const vditor = vditorNow()
  if (!vditor) return
  const editor = vditor[vditor.currentMode] as { element?: HTMLElement }
  const editorEl = editor?.element
  if (!editorEl) return
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return
  const range = sel.getRangeAt(0)
  if (!editorEl.contains(range.startContainer)) return
  const li = hasClosestByMatchTag(range.startContainer, 'LI') as
    | HTMLElement
    | false
  if (!li) return
  const parentLi = hasClosestByMatchTag(li.parentElement, 'LI') as
    | HTMLElement
    | false
  // A TOP-LEVEL first item is Vditor's own "→ paragraph" branch — leave it. A NESTED first item is
  // NOT (Vditor merges it into the parent), so we still handle that by outdenting.
  if (!li.previousElementSibling && !parentLi) return
  // An EMPTY item is Vditor's "align to previous" branch — leave it.
  if (li.textContent?.replace(/​/g, '').trim() === '') return
  // Only at the very start of the item's text (a "delete the marker" gesture, not a mid-text
  // Backspace). A task item counts the checkbox as one leading position, so 1 is its start.
  const isTask = li.classList.contains('vditor-task')
  const pos = getSelectPosition(li, editorEl, range).start
  if (pos !== 0 && !(isTask && pos <= 1)) return

  event.preventDefault()
  event.stopPropagation()

  if (parentLi) {
    // Nested → outdent one level, exactly like Shift+Tab (fixList's own Tab branch uses this call).
    listOutdent(vditor as never, li, range, li.parentElement as HTMLElement)
  } else {
    liftTopLevelItemToParagraph(vditor, li, range, editorEl)
  }
}

let bound: ((e: KeyboardEvent) => void) | null = null

/** Install the capture-phase Backspace handler. Idempotent across re-inits (removes the prior one). */
export function installListBackspace(): () => void {
  if (bound) document.removeEventListener('keydown', bound, true)
  bound = onKeydown
  document.addEventListener('keydown', bound, true)
  return () => {
    if (bound) document.removeEventListener('keydown', bound, true)
    bound = null
  }
}
