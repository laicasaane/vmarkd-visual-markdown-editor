// Task 428 — Backspace at the START of a list item's text behaves like a real editor.
//
// Vditor's own `fixList` (fixBrowserBehavior.ts) handles Backspace-at-start for a TOP-LEVEL first
// item (→ paragraph) and for an EMPTY item (→ align to previous). Two cases are missing/wrong:
//   1. A NON-first item WITH text falls through to the browser default, which MERGES the item's
//      text into the previous item — measured "1. otwo" + Backspace → "1. ooneotwo", and a nested
//      child glued onto its parent ("- nparentnchildone") (task 428 probe, 2026-07-30).
//   2. A NESTED item — first-in-its-sublist or not — used to fall into fixList's "top-level first
//      item → paragraph" branch too, because that branch was gated only on
//      `!previousElementSibling`, not on top-level-ness. For a nested item that branch inserts the
//      lifted content as a stray `<p>` SIBLING inside the PARENT `<li>` (ahead of the remaining
//      sublist) rather than promoting it — corrupting a still `data-tight="true"` list exactly the
//      way task 391 (`list-tight.ts`) originally measured. RE-MEASURED 2026-07-31 (tasks 461/462,
//      `media-src/e2e/list.spec.ts`): pressing Backspace on a nested FIRST item against UNMODIFIED
//      Vditor reproduces list-tight.test.ts's `CORRUPTED` fixture byte-for-byte (a finding recorded
//      in tasks/461 and tasks/462, no longer directly reproducible from a patched build — see that
//      spec's own header). `patchFixListOutdent` (esbuild-shared.mjs) gates that branch to top-level-only
//      so every nested item, first included, falls through to this module instead — which is why
//      list-tight.ts's repair observer could be retired (task 461): the corruption it existed to
//      repair no longer has a path to occur.
//
// This module used to be a document CAPTURE-phase keydown listener (Vditor binds its own keydown on
// the editor element in bubble phase, so capturing ran first and stopping propagation there kept
// Vditor's merge from running). Task 462 moved it into a `fixList`-internal branch instead: an
// override left Vditor's wrong branches in place plus a second listener racing them (ADR-0004's
// argument, transposed from CSS to behaviour) — a Vditor bump that changed those branches' guard
// conditions would make the interceptor silently stop matching, or keep blocking a branch Vditor had
// since fixed, with nothing to catch the drift. The patch's anchor-assert now fails the build loudly
// instead. `outdentOrLiftListItemOnBackspace` is called directly from `fixList`'s own Backspace chain
// via the `window.__vmarkdListBackspaceOutdent` seam `patchFixListOutdent` inserts (matching this
// codebase's ~20 other `window.__vmarkd*` bridges — the patched Vditor source cannot import from our
// bundle, and a global keeps the patch itself down to one branch). Because the caller is `fixList`
// itself, this function needs none of the independent re-derivation the old document-listener did
// (locating the live Vditor instance, re-filtering Ctrl/Alt/Shift/Enter/Tab) — `fixList` has already
// done all of that before reaching the seam call.

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

/**
 * Whether this module's Backspace handling applies to `li` — and if so, whether it's nested (→
 * outdent) or top-level (→ lift to a paragraph). A pure decision, no DOM mutation, split out from
 * `outdentOrLiftListItemOnBackspace` so the guard logic (the part that changed shape in the move to
 * a `fixList`-internal seam, task 462) is unit-testable without a working Vditor/Lute instance — see
 * list-backspace.test.ts's header for why the DOM-mutating half isn't.
 */
export function backspaceOutdentTarget(
  li: HTMLElement,
  range: Range,
  editor: HTMLElement,
): 'nested' | 'top-level' | null {
  // `hasClosestByMatchTag` itself treats a falsy element as "no match" (returns `false`) — guard
  // here only to satisfy strictNullChecks, same behaviour as calling it with a null element.
  const parentLi = li.parentElement
    ? (hasClosestByMatchTag(li.parentElement, 'LI') as HTMLElement | false)
    : false
  // A TOP-LEVEL first item is `fixList`'s own "→ paragraph" branch (now gated to top-level-only by
  // `patchFixListOutdent`) — leave it. A NESTED first item is NOT (that branch would corrupt a tight
  // list — see module header), so we still handle that by outdenting.
  if (!li.previousElementSibling && !parentLi) return null
  // An EMPTY item is `fixList`'s "align to previous" branch — leave it.
  if (li.textContent?.replace(/​/g, '').trim() === '') return null
  // Only at the very start of the item's text (a "delete the marker" gesture, not a mid-text
  // Backspace). A task item counts the checkbox as one leading position, so 1 is its start.
  const isTask = li.classList.contains('vditor-task')
  const pos = getSelectPosition(li, editor, range).start
  if (pos !== 0 && !(isTask && pos <= 1)) return null
  return parentLi ? 'nested' : 'top-level'
}

/**
 * Handle Backspace at the start of a list item's text for the two cases `fixList` doesn't (or, for a
 * nested first item, handles wrong — see the module header). Called from inside `fixList` itself
 * (via the `window.__vmarkdListBackspaceOutdent` seam), which has ALREADY confirmed: Backspace,
 * non-Ctrl/Alt/Shift, a collapsed selection, and an `li` under the caret. Returns whether it handled
 * the keystroke, so the caller knows to `preventDefault` and stop, or fall through.
 */
function outdentOrLiftListItemOnBackspace(
  vditor: VditorLike,
  li: HTMLElement,
  range: Range,
  editor: HTMLElement,
): boolean {
  const target = backspaceOutdentTarget(li, range, editor)
  if (!target) return false
  if (target === 'nested') {
    // Outdent one level, exactly like Shift+Tab (fixList's own Tab branch uses this call).
    listOutdent(vditor as never, li, range, li.parentElement as HTMLElement)
  } else {
    liftTopLevelItemToParagraph(vditor, li, range, editor)
  }
  return true
}

/**
 * Install the `window.__vmarkdListBackspaceOutdent` seam `patchFixListOutdent` calls into from
 * inside `fixList`. Keeps the SAME name/signature/disposer contract the document-listener version
 * had (finish-init.ts calls `observers.set('list-backspace', installListBackspace())` unchanged) even
 * though there is no listener to bind anymore — just a global to set and unset.
 */
export function installListBackspace(): () => void {
  const w = window as unknown as {
    __vmarkdListBackspaceOutdent?: typeof outdentOrLiftListItemOnBackspace
  }
  w.__vmarkdListBackspaceOutdent = outdentOrLiftListItemOnBackspace
  return () => {
    delete w.__vmarkdListBackspaceOutdent
  }
}
