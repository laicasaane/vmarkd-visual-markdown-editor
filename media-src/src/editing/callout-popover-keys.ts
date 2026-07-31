// Task 459 — keyboard reach into the callout popover's controls (WYSIWYG only: `calloutWysiwygToolbar`
// in callouts.ts appends a type `<select>` + title `<input>` to Vditor's floating block popover when
// the caret is inside a `[!TYPE]` blockquote; IR/Preview have no such popover, see callouts.ts's
// header comment).
//
// Why a dedicated chord instead of Tab: `tab: '\t'` (vditor-init.ts) makes Vditor `preventDefault()`
// every Tab inside the editable surface — measured dead for reaching in-document targets (task 457).
// The popover is a SIBLING of the contenteditable `<pre>` (`wysiwyg/index.ts`'s constructor builds
// `.vditor-panel` divs next to it, not inside it), so Tab can never reach it either way. Task 457's
// decided precedent for this exact problem (caret-targeted activation) is Ctrl/Cmd+Enter for wiki
// links — this reuses that SHAPE (a caret-triggered chord, not a Tab walk) but a DIFFERENT chord
// (Ctrl/Cmd+Alt+Enter) so the two capture-phase listeners (this one, and link-click-fix.ts's) never
// both match the same keypress; see task 459 for the reasoning against sharing one dispatcher.
//
// Once focus is inside the popover, native Tab/Shift+Tab between its controls (select/input/the
// existing ∧∨🗑 buttons) works for FREE — verified: Vditor's Tab handling (`hotkeyEvent`) is bound
// via `addEventListener('keydown', …)` directly on `this.element` (the contenteditable), so it only
// ever sees events whose propagation path includes that node. The popover's controls are siblings,
// outside that subtree, so their keydowns never reach it at all — no roving-tabindex needed here,
// unlike the toolbar (456) or outline (458), which live in a real ordered set Arrow keys must drive.
//
// Escape (while focus is inside the popover) returns focus AND the caret to the editor, via the same
// snapshot/restore pair task 456 already proved is required: focusing a `<select>`/`<button>` isn't
// text-selectable, so it collapses the live Range — re-focusing the editor alone leaves it with
// Chrome's own default caret (start of document) instead of where the user actually was.
import { activeModeElement } from '../util/source-map'
import { innerVditor } from '../util/inner-vditor'
import { restoreEditorCaretIfLost } from './editor-caret'

const TYPE_SELECT = '.vmarkd-callout__type'

function isComboEnter(e: KeyboardEvent): boolean {
  return (
    !e.isComposing &&
    e.key === 'Enter' &&
    (e.ctrlKey || e.metaKey) &&
    e.altKey &&
    !e.shiftKey
  )
}

function isBareEscape(e: KeyboardEvent): boolean {
  return (
    !e.isComposing &&
    e.key === 'Escape' &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    !e.shiftKey
  )
}

// The popover only carries our type/title controls when it's currently showing a CALLOUT blockquote
// (calloutWysiwygToolbar appends them); an ordinary blockquote's popover has only ∧∨🗑. Gate on the
// select's presence rather than trusting the caret snapshot below — the popover could in principle be
// stale relative to a caret that has since moved (defensive; cheap to check).
function calloutPopoverSelect(): HTMLSelectElement | null {
  const popover = innerVditor()?.wysiwyg?.popover
  return popover?.querySelector<HTMLSelectElement>(TYPE_SELECT) ?? null
}

function calloutBlockquoteAtCaret(): Element | null {
  const sel = document.getSelection?.()
  const anchor = sel?.rangeCount ? sel.anchorNode : null
  if (!anchor) return null
  const host =
    anchor.nodeType === 1 ? (anchor as Element) : anchor.parentElement
  const bq = host?.closest('blockquote[data-callout]')
  // WYSIWYG only — the popover this module targets doesn't exist in IR/Preview (callouts.ts).
  return bq?.closest('.vditor-wysiwyg') ? bq : null
}

function returnFocusToEditor(): void {
  const editor = activeModeElement(window.vditor)
  if (!editor) return
  // Order matters (task 456): restore the Range while focus is still on the popover control (so
  // editor-caret.ts's "already has a real caret" guard doesn't wrongly bail on nothing), THEN focus.
  restoreEditorCaretIfLost()
  editor.focus({ preventScroll: true })
}

function onKeydown(e: KeyboardEvent): void {
  if (isComboEnter(e)) {
    if (!calloutBlockquoteAtCaret()) return
    const select = calloutPopoverSelect()
    if (!select) return
    e.preventDefault()
    e.stopImmediatePropagation()
    select.focus({ preventScroll: true })
    return
  }
  if (isBareEscape(e)) {
    const select = calloutPopoverSelect()
    const active = document.activeElement
    if (!select || !active || !select.parentElement?.contains(active)) return
    // stopImmediatePropagation: escape-toolbar.ts's global Escape/Tab arm listener is also a
    // document-capture listener — without this it would ALSO see this Escape and arm its one-shot
    // "next Tab leaves to the toolbar" flag, a harmless but confusing side effect of a keypress this
    // module already fully handles.
    e.preventDefault()
    e.stopImmediatePropagation()
    returnFocusToEditor()
  }
}

let bound: ((e: KeyboardEvent) => void) | null = null

/** Install the capture-phase Ctrl/Cmd+Alt+Enter (focus the callout popover's controls) / Escape
 *  (return focus + caret to the editor) listener. Idempotent across re-inits. Returns a disposer. */
export function installCalloutPopoverKeys(): () => void {
  if (bound) document.removeEventListener('keydown', bound, true)
  bound = onKeydown
  document.addEventListener('keydown', bound, true)
  return () => {
    if (bound) document.removeEventListener('keydown', bound, true)
    bound = null
  }
}
