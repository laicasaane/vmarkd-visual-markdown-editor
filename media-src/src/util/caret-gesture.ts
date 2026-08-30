// Tasks 457/459 — the shared caret-gesture dispatcher for Ctrl/Cmd+Enter.
//
// WHY THIS EXISTS: task 457 (activate the link under the caret) and task 459 (focus the callout
// popover's controls) both wanted a caret-triggered Ctrl/Cmd+Enter chord. They originally shipped
// as TWO independent capture-phase `keydown` listeners on two DIFFERENT chords (459 used
// Ctrl/Cmd+Alt+Enter to avoid colliding with 457) — the user explicitly REJECTED that on
// 2026-07-31: one chord, dispatched by whatever is under the caret (Obsidian's model), because a
// third modifier and `Ctrl+Alt` collide with AltGr on a Polish keyboard layout (AltGr+key produces
// ąćęłńóśżź). This module is the single listener + registration API both callers migrate to.
//
// Placement: `util/`, not `links/` or `editing/`. Both callers already have an allowed edge to
// `util/` (links->util, editing->util — see test/backend/module-boundaries.test.ts), so this file
// needs ZERO new allowlist entries; putting it in either caller's own module would have required
// one (task 460's standing rule is to move the file rather than widen the allowlist).
//
// Collapsed-selection-only: a dragged/extended selection over a link or callout is the user
// SELECTING text, not targeting an element — Ctrl+Enter there must not activate anything, the same
// reasoning as links/caret-link.ts's `linkLikeInSelection`. That semantics is mirrored here (the
// collapsed check) rather than imported: `util/` cannot import `links/` (only the reverse edge is
// allowed), and the check itself is generic — "a gesture targets a caret, not a range" — not
// specific to links.
//
// Registration order is caller-controlled and IS load-bearing, not an implementation detail: a
// link-like element nested inside a callout blockquote (e.g. a wiki chip inside a `[!TIP]`) makes
// BOTH links/link-click-fix.ts's matcher and editing/callout-popover-keys.ts's matcher resolve to
// something non-null for the same caret position — `linkLikeAt` walks up to the nearest link,
// `calloutBlockquoteAt` walks up to the nearest callout blockquote, and a chip inside a callout
// satisfies both. Whichever module calls `registerCaretGesture` FIRST wins in that overlap.
// `fixLinkClick()` runs at module scope from boot/main.ts (imported once, at the top of the boot
// sequence); `installCalloutPopoverKeys()` runs later, per re-init, from finish-init.ts — so links
// register first today, and "activate the more specific/inner target" (the link, not its
// containing callout) is the correct precedence, not an accident of import order.
type CompositionKeyEvent = Pick<KeyboardEvent, 'isComposing' | 'keyCode'>
type CompositionStateListener = (active: boolean) => void

const compositionListeners = new Set<CompositionStateListener>()
let compositionActive = false

export function isCompositionActive(): boolean {
  return compositionActive
}

/** Canonical early-return predicate for VMDE key handlers. Chromium reports modern IME input
 * through `isComposing`; keyCode 229 preserves the same protection for older/dead-key paths. */
export function guardComposition(event: CompositionKeyEvent): boolean {
  return compositionActive || event.isComposing || event.keyCode === 229
}

export function subscribeCompositionState(
  listener: CompositionStateListener,
): () => void {
  compositionListeners.add(listener)
  return () => compositionListeners.delete(listener)
}

function setCompositionActive(doc: Document, next: boolean): void {
  if (compositionActive === next) return
  compositionActive = next
  doc.documentElement.toggleAttribute('data-vmde-composing', next)
  for (const listener of compositionListeners) listener(next)
}

/** Install the single composition lifecycle authority before any capture-phase key handlers. */
export function installCompositionState(doc: Document = document): () => void {
  const onStart = () => setCompositionActive(doc, true)
  const onEnd = () => setCompositionActive(doc, false)
  doc.addEventListener('compositionstart', onStart, true)
  doc.addEventListener('compositionend', onEnd, true)
  return () => {
    doc.removeEventListener('compositionstart', onStart, true)
    doc.removeEventListener('compositionend', onEnd, true)
    setCompositionActive(doc, false)
  }
}

export type CaretGestureMatch = (node: Node | null) => HTMLElement | null
export type CaretGestureHandle = (el: HTMLElement) => boolean

interface Registration {
  match: CaretGestureMatch
  handle: CaretGestureHandle
}

const registrations: Registration[] = []

function collapsedCaretNode(): Node | null {
  const sel = window.getSelection()
  if (!sel?.isCollapsed) return null
  return sel.anchorNode
}

// Try every registered handler, in registration order, against the current collapsed caret
// position. The first one whose `match` resolves an element AND whose `handle` returns true wins;
// a `match` hit whose `handle` declines (e.g. a link-like element with no resolvable href) falls
// through to the next registration rather than stopping dispatch — `handle` returning false is a
// "not actually actionable here" signal, not a "stop looking" one.
function dispatch(): boolean {
  const node = collapsedCaretNode()
  if (!node) return false
  for (const { match, handle } of registrations) {
    const el = match(node)
    if (el && handle(el)) return true
  }
  return false
}

// Run the dispatch without a real KeyboardEvent — used by the VS Code-command trigger
// (bridge/message-router.ts's `activate-link-at-caret` handler, posted by the
// `vmde.activateLinkAtCaret` command), which has no event to preventDefault/derive modifiers
// from. Same underlying dispatch as the keydown listener below, so whichever trigger a real VS
// Code session resolves the chord through, both land on the identical registered handlers.
export function runCaretGestureHandlers(): boolean {
  return dispatch()
}

// Capture phase + stopImmediatePropagation, same contract the two migrated callers each already
// had on their own listeners: this must run before Vditor's own Enter handling (list
// continuation, code-block exit doesn't check ctrlKey) and before VS Code's own keybinding
// dispatch sees the bubbled event, so a handled Ctrl/Cmd+Enter is never ALSO processed elsewhere.
// Only preventDefault/stop when a handler actually activated something — a Ctrl/Cmd+Enter with no
// link or callout under the caret is left alone entirely, for Vditor/the browser to do whatever
// it would otherwise do with it (a plain newline is Enter's job, not this chord's).
// Exactly Ctrl+Enter / Cmd+Enter — no extra modifiers. Alt is checked explicitly (not just left
// unconstrained) because the ORIGINAL callout chord this replaces was Ctrl/Cmd+Alt+Enter, and the
// whole point of unifying onto one chord was to get away from a second Ctrl-based combo that
// collides with AltGr on a Polish keyboard layout (AltGr sends Ctrl+Alt for diacritic keys) — a
// dispatcher that still fired on Ctrl+Alt+Enter would have kept that surface area alive by accident.
function onKeydown(e: KeyboardEvent): void {
  if (
    guardComposition(e) ||
    e.key !== 'Enter' ||
    !(e.ctrlKey || e.metaKey) ||
    e.altKey ||
    e.shiftKey
  )
    return
  if (dispatch()) {
    e.preventDefault()
    e.stopImmediatePropagation()
  }
}

let installed = false

function ensureInstalled(): void {
  if (installed) return
  installed = true
  document.addEventListener('keydown', onKeydown, true)
}

/** Register a caret-gesture handler for the shared Ctrl/Cmd+Enter chord. `match` resolves the
 *  caret's current (collapsed-selection) node to this handler's target element, or null if it
 *  doesn't apply here. `handle` performs the gesture and returns whether it actually did
 *  anything — a false lets dispatch fall through to the next registration instead of eating the
 *  keypress. Handlers are tried in REGISTRATION order (see the module header for why that's
 *  load-bearing). Installs the shared listener on first call, so callers don't need a separate
 *  boot-time install step. Returns a disposer that removes just this registration. */
export function registerCaretGesture(
  match: CaretGestureMatch,
  handle: CaretGestureHandle,
): () => void {
  ensureInstalled()
  const reg: Registration = { match, handle }
  registrations.push(reg)
  return () => {
    const idx = registrations.indexOf(reg)
    if (idx !== -1) registrations.splice(idx, 1)
  }
}
