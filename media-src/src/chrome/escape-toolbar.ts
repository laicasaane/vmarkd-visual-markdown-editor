// Task 456 — DOM wiring for the Escape→Tab "leave the editor" gesture (WCAG 2.1.2 keyboard trap
// fix) plus the toolbar it lands on: role="toolbar" + roving tabindex + ArrowLeft/Right traversal
// (escaping into a toolbar you cannot move around in is not an escape). The pure arm/disarm state
// machine lives in escape-arm.ts (unit-tested there, no DOM); this file only classifies real
// KeyboardEvents, drives the toolbar DOM, and installs the listener.
//
// Capture-phase document listener, same shape as list-backspace.ts: Vditor binds its own Tab
// handling (fixList's list-indent branch, fixTab's insert-a-tab-character branch,
// fixBrowserBehavior.ts) on the editor element in the BUBBLE phase, so intercepting in capture,
// before that runs, is what lets us swallow the consumed Tab without a stray "\t" ever reaching
// the document — and leaves every OTHER Tab (no preceding Escape) to fall through untouched, which
// is what keeps Tab-as-indent working for ordinary editing.
//
// Root-cause note (kept for the next reader — the actual investigation lives in the task 456
// thread, not reproduced here): the real-VS-Code-only "focus never moves" failure was NOT a focus
// bounce. A 4-round instrumented investigation showed the escape gesture's `.focus()` call
// genuinely works — round 4's focusin log landed cleanly on the toolbar button with no bounce. What
// broke was a synchronous `document.activeElement` read taken inside the same call stack as
// `.focus()`, which is stale in the real webview (the harness never reproduced it because a
// same-stack read happens to be fresh there). The REAL bug this surfaced was in
// `returnFocusToEditor()` below: focusing a `<button>` collapses the browser's Selection (buttons
// aren't text-selectable), so simply re-focusing the editor afterward leaves it focused but with NO
// caret Range — typing and Tab do nothing. Fixed by restoring the caret through the existing
// editor-caret.ts snapshot instead of assuming focus alone preserves it.
import { type EscapeArmKeyKind, createEscapeArmState } from './escape-arm'
import { restoreEditorCaretIfLost } from '../editing/editor-caret'
import { innerVditor } from '../util/inner-vditor'
import { activeModeElement } from '../util/source-map'

// Bare modifier keydowns routinely PRECEDE the real key of a combo (Shift fires before Tab in a
// Shift+Tab press) — classify() must never let one disarm the machine on its own.
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph'])

// Classify one real KeyboardEvent for the pure state machine. Only a COMPLETELY unmodified Escape
// or Tab counts as the gesture:
//  - Ctrl/Alt/Meta+Tab is a VS Code / OS chord (editor-group navigation, app switcher) and must
//    fall through untouched — never consumed as our escape gesture (and, since it classifies as
//    'other' below, it also disarms an armed flag exactly like any other non-Tab key would).
//  - Shift+Tab is a distinct combo; task 456 scope item 3 (Shift+Tab-from-document-start as the
//    reverse gesture) is not implemented here, so it is also just 'other'.
function classify(e: KeyboardEvent): EscapeArmKeyKind {
  if (e.isComposing || MODIFIER_KEYS.has(e.key)) return 'ignore'
  const bare = !e.ctrlKey && !e.metaKey && !e.altKey
  if (e.key === 'Escape' && bare) return 'escape'
  if (e.key === 'Tab' && bare && !e.shiftKey) return 'tab'
  return 'other'
}

// The focusable target inside one top-level toolbar item is always `.firstElementChild` — verified
// across every Vditor toolbar item class (MenuItem/Headings/Emoji/Preview/Undo/Upload/…, all bind
// their click handler on `this.element.children[0]`). Dividers (`vditor-toolbar__divider`) and
// spacers (`vditor-toolbar__br`) are direct children of the toolbar too but carry no such target,
// and are excluded by the `.vditor-toolbar__item` check. Walking the toolbar's own DOM children
// (rather than `toolbar.elements`, whose keys include the dividers) also naturally excludes
// level-2 submenu buttons: their panel is appended INSIDE the level-1 item wrapper, so it's never a
// direct child of the toolbar container.
function rovingItems(toolbarEl: HTMLElement): HTMLElement[] {
  const items: HTMLElement[] = []
  for (const child of Array.from(toolbarEl.children)) {
    if (
      child instanceof HTMLElement &&
      child.classList.contains('vditor-toolbar__item')
    ) {
      const target = child.firstElementChild
      if (target instanceof HTMLElement) items.push(target)
    }
  }
  return items
}

// Set up (or re-affirm) role="toolbar" + roving tabindex: exactly one item is tabIndex 0 (the one
// Tab lands on / that Tab-out-of-the-toolbar leaves from), the rest -1. Idempotent — preserves
// whichever item currently holds the 0 (e.g. across a repeat call) instead of always resetting to
// the first item, and safe to call before the user has ever reached the toolbar (defaults to the
// first item then).
function initRoving(toolbarEl: HTMLElement): HTMLElement[] {
  const items = rovingItems(toolbarEl)
  if (items.length === 0) return items
  toolbarEl.setAttribute('role', 'toolbar')
  toolbarEl.setAttribute('aria-orientation', 'horizontal')
  const current = items.find((el) => el.tabIndex === 0) ?? items[0]
  for (const el of items) el.tabIndex = el === current ? 0 : -1
  return items
}

// ArrowLeft/Right traversal within the toolbar (ARIA "roving tabindex" toolbar pattern — wraps
// around at either end, matching the WAI-ARIA authoring practice for toolbars).
function moveRoving(toolbarEl: HTMLElement, direction: 1 | -1): void {
  const items = rovingItems(toolbarEl)
  if (items.length === 0) return
  const activeIndex = items.indexOf(document.activeElement as HTMLElement)
  const from = activeIndex >= 0 ? activeIndex : 0
  const next = items[(from + direction + items.length) % items.length]
  for (const el of items) el.tabIndex = el === next ? 0 : -1
  next.focus({ preventScroll: true })
}

// Move focus to whichever toolbar item currently holds tabindex 0 (the roving-tabindex "current"
// item), initializing roving state first if this is the very first arrival.
function focusToolbar(): void {
  const toolbarEl = innerVditor()?.toolbar?.element
  if (!toolbarEl) return
  const items = initRoving(toolbarEl)
  const current = items.find((el) => el.tabIndex === 0) ?? items[0]
  current?.focus({ preventScroll: true })
}

// Escape while a toolbar item is focused returns focus to the editor (the reciprocal of
// escapeToolbar — arriving in a toolbar you cannot leave again is not an escape).
//
// Focusing the toolbar button in focusToolbar() above collapses the browser's Selection: a
// <button> isn't text-selectable, so moving DOM focus there clears/collapses whatever Range was
// live in the editor. Simply calling editor.focus() here again does NOT bring it back — MEASURED
// (chromium harness): a contenteditable with no live Range gets Chrome's own default caret on
// focus (the first text node, offset 0), which is a REAL live-and-collapsed selection, just the
// wrong one — Vditor's Tab/typing handlers have something to act on, but at the wrong position,
// which reads as "the editor is broken" the moment the user types (task 456 root-cause).
//
// editor-caret.ts already tracks the last known in-editor Range continuously via `selectionchange`
// (installEditorCaretTracking, wired once in main.ts) for exactly this class of "focus left, Range
// died" problem (task 389/390): restoreEditorCaretIfLost() re-asserts it through caret.ts's
// requestCaret (ADR-0007). ORDER MATTERS, and this follows focus-restore.ts's proven order, not the
// naive one: restore the Range FIRST, while focus is still on the toolbar button (so there is no
// live Range in the editor yet — editor-caret.ts's "already has a real caret, don't touch it" guard
// correctly stays out of the way), THEN focus() — a Range already set on an element survives that
// element being focused, whereas an element focused with NO Range gets Chrome's default one.
// Reusing the existing snapshot/restore pair here rather than hand-rolling a third caret path.
function returnFocusToEditor(): void {
  const editor = activeModeElement(window.vditor)
  if (!editor) return
  restoreEditorCaretIfLost()
  editor.focus({ preventScroll: true })
}

let armState = createEscapeArmState()

function onKeydown(e: KeyboardEvent): void {
  const kind = classify(e)
  if (kind === 'ignore') return

  const toolbarEl = innerVditor()?.toolbar?.element ?? null
  const activeEl = document.activeElement
  const focusInToolbar =
    !!toolbarEl && !!activeEl && toolbarEl.contains(activeEl)

  if (
    focusInToolbar &&
    (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey
  ) {
    e.preventDefault()
    moveRoving(toolbarEl as HTMLElement, e.key === 'ArrowRight' ? 1 : -1)
    return
  }

  // Deliberately no preventDefault/stopPropagation here: Vditor's own bubble-phase Escape handling
  // (closing an open hint/sub-menu panel) must still run. This only adds a focus-return side effect.
  if (kind === 'escape' && focusInToolbar) {
    returnFocusToEditor()
    return
  }

  const action = armState.handle(kind)
  if (action === 'consumed') {
    // kind === 'tab' and the machine was armed: swallow it here in CAPTURE phase, before Vditor's
    // own bubble-phase Tab handling ever runs, so no "\t" is inserted — then move focus instead.
    //
    // stopImmediatePropagation (not just stopPropagation): the established convention for a
    // capture-phase key interceptor in this codebase (undo-keybind.ts, gap-paragraph.ts, hr-nav.ts,
    // callout-nav.ts, diagram-zoom-gate.ts all do this). Tried specifically as a candidate fix for
    // task 456's real-VS-Code-only focus-landing flake (~1-in-6 pass rate) and measured NOT to
    // change the pass rate — see the task file's investigation log before assuming this line fixes
    // anything. Kept anyway, on convention grounds: leaving plain stopPropagation here would be an
    // inconsistency with every sibling interceptor for no benefit.
    e.preventDefault()
    e.stopImmediatePropagation()
    focusToolbar()
  }
  // 'armed' (bare Escape in/near the editor): no preventDefault — just the internal flag.
  // 'disarmed' / 'none': let the key behave exactly as if this listener didn't exist — this is what
  // keeps ordinary Tab-to-indent working (a Tab with no preceding Escape classifies 'none' and
  // falls straight through to Vditor's own fixTab, which inserts the tab character).
}

let bound: ((e: KeyboardEvent) => void) | null = null

/**
 * Install the capture-phase Escape/Tab listener + the toolbar's role="toolbar"/roving-tabindex
 * setup. Idempotent across re-inits (removes the prior listener; starts a fresh one-shot arm state
 * so a stale 'armed' flag from before a re-init can't leak into the new session).
 */
export function installEscapeToolbar(): () => void {
  if (bound) document.removeEventListener('keydown', bound, true)
  armState = createEscapeArmState()
  bound = onKeydown
  document.addEventListener('keydown', bound, true)
  const toolbarEl = innerVditor()?.toolbar?.element
  if (toolbarEl) initRoving(toolbarEl)
  return () => {
    if (bound) document.removeEventListener('keydown', bound, true)
    bound = null
  }
}
