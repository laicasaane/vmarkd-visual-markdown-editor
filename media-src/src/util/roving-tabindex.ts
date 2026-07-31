// Shared "roving tabindex" primitives (WAI-ARIA APG composite-widget pattern: exactly one item in
// a set is tabbable — tabIndex 0 — the rest are -1, and Arrow keys move which one that is).
//
// Task 456 (toolbar) and task 458 (outline tree) both need this exact shape — a toolbar's
// left-to-right buttons and a tree's up/down-then-branch items only differ in HOW their item list
// is discovered and filtered (toolbar: direct `.vditor-toolbar__item` children; outline: reachable
// `[data-target-id]` spans, skipping collapsed branches) and in which Arrow keys drive it. That
// widget-specific discovery stays in each caller; this module is the one traversal/tabindex
// implementation both build on, so there is a single copy instead of two.
//
// `nextRovingIndex` is pure (unit-tested without DOM); `moveRovingFocus`/`setRovingActive` touch
// `HTMLElement.tabIndex`/`.focus()` so they're exercised by each widget's own e2e instead.
//
// `escape-toolbar.ts` (task 456) still has its OWN inline copy of this exact shape
// (`rovingItems`/`initRoving`/`moveRoving`) — not swapped over to this module yet. Left as-is
// deliberately: as of this module's creation, 456 is mid-diagnosis of a real focus-landing flake in
// that same code (`focusToolbar`/`initRoving`), and refactoring underneath a live investigation
// risks confounding the measurement. Team-lead is driving that adoption once 456 is green, not
// either agent editing the other's in-flight file.

/** Wrap-around next index for the roving-tabindex Arrow-key pattern (APG: focus wraps at either
 *  end rather than stopping). `current < 0` (nothing focused yet) starts from index 0. */
export function nextRovingIndex(
  current: number,
  direction: 1 | -1,
  length: number,
): number {
  if (length <= 0) return -1
  const from = current >= 0 ? current : 0
  return (from + direction + length) % length
}

/** Set roving tabindex so exactly `active` is 0 and every other item in `items` is -1 — no
 *  `.focus()` call, for (re)asserting state after a DOM rebuild without stealing focus. */
export function setRovingActive(
  items: HTMLElement[],
  active: HTMLElement,
): void {
  for (const el of items) el.tabIndex = el === active ? 0 : -1
}

/** Move roving tabindex + real focus by `direction` among `items` (already filtered to whatever
 *  the caller considers "reachable" — e.g. not inside a collapsed branch), wrapping at either end.
 *  Returns the newly-active item, or `undefined` if `items` is empty. */
export function moveRovingFocus(
  items: HTMLElement[],
  direction: 1 | -1,
): HTMLElement | undefined {
  if (items.length === 0) return undefined
  const from = items.indexOf(document.activeElement as HTMLElement)
  const next = items[nextRovingIndex(from, direction, items.length)]
  setRovingActive(items, next)
  next.focus({ preventScroll: true })
  return next
}

/** Move roving tabindex + focus directly to `target` (e.g. ArrowRight into a tree node's first
 *  child, ArrowLeft up to its parent) rather than by relative direction. `target` must be a member
 *  of `items`. */
export function focusRovingItem(
  items: HTMLElement[],
  target: HTMLElement,
): void {
  setRovingActive(items, target)
  target.focus({ preventScroll: true })
}
