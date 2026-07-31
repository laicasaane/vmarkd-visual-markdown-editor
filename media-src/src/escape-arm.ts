// Task 456 — WCAG 2.1.2 keyboard trap. `tab: '\t'` (vditor-init.ts) makes Vditor preventDefault
// every Tab keypress (fixBrowserBehavior.ts fixTab), so a keyboard-only user can never move focus
// out of the editable surface to the toolbar/outline — that is a trap, not an inconvenience, and
// the fix must NOT touch `tab: '\t'` (removing it would break Tab-as-indent for everyone).
//
// Design (decided in tasks/456-a11y-escape-the-editor.md, not re-litigated here): Escape ARMS a
// one-shot "next Tab leaves" flag; the immediately-following bare Tab moves focus to the toolbar
// instead of inserting a tab character; ANY other key disarms it. So Tab keeps indenting during
// ordinary editing (the common case, unaffected), and escaping is a deliberate two-key gesture.
//
// This module is the PURE state machine only — no DOM, no keyboard events, no Vditor. Kept separate
// so the arm/disarm/one-shot transitions are unit-testable without mounting a webview. The DOM
// wiring (which real keydown events count as Escape/Tab/other, moving focus to the toolbar, the
// roving-tabindex traversal) lives in escape-toolbar.ts.

/** How escape-toolbar.ts classifies one keydown for the state machine. */
export type EscapeArmKeyKind = 'escape' | 'tab' | 'other' | 'ignore'

/** What the state machine did with that key. */
export type EscapeArmAction = 'armed' | 'consumed' | 'disarmed' | 'none'

export interface EscapeArmState {
  /** True after Escape, until the next Tab (consumes it) or any other key (disarms it). */
  isArmed(): boolean
  /**
   * Feed one classified key through the machine.
   *  - 'escape' → arms (idempotent: re-arming while already armed stays armed).
   *  - 'tab' while armed → disarms and reports 'consumed' (the caller moves focus instead of
   *    letting Tab insert a character).
   *  - 'tab' while NOT armed → 'none' (ordinary Tab-to-indent must fall through untouched).
   *  - 'other' while armed → disarms and reports 'disarmed' (any other key cancels the gesture).
   *  - 'other' while NOT armed → 'none' (nothing to do).
   *  - 'ignore' (bare modifier keydowns — Shift/Control/Alt/Meta/AltGraph, or IME composition) →
   *    never touches the state. A modifier keydown routinely PRECEDES the real key of a combo
   *    (Shift fires before Tab in a Shift+Tab press); if it disarmed, Shift+Tab could never reach
   *    the machine as a single gesture.
   */
  handle(kind: EscapeArmKeyKind): EscapeArmAction
  /** Force-disarm (e.g. focus left the editor entirely). */
  reset(): void
}

export function createEscapeArmState(): EscapeArmState {
  let armed = false
  return {
    isArmed: () => armed,
    handle(kind) {
      if (kind === 'ignore') return 'none'
      if (kind === 'escape') {
        armed = true
        return 'armed'
      }
      if (!armed) return 'none'
      armed = false
      return kind === 'tab' ? 'consumed' : 'disarmed'
    },
    reset() {
      armed = false
    },
  }
}
