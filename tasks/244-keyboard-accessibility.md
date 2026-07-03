# Task 244 — FIX: keyboard trap + keyboard-only operability (a11y batch 1)

**Status:** planned — BUG (WCAG 2.1.1/2.1.2 class) · **Impact:** 🔴 high (keyboard/motor-impaired + power users) · **Origin:** task 192 §10

## Problem

Focus can never leave the editable surface by keyboard: `main.ts:337` sets `tab:'\t'` and
Vditor's `fixTab` preventDefaults Tab whenever `options.tab` is set (vendored
`fixBrowserBehavior.ts:536-553`) — toolbar/outline are unreachable. Mouse-only affordances
everywhere: wiki chips are `<span>`s with NO tabindex anywhere in the codebase (the
`.wiki-link-chip:focus-visible` rule at `main.css:947` is dead CSS), outline items are
non-focusable spans, outline resize is mousedown-only, diagram zoom is Ctrl+wheel/drag only,
the callout popover's `<select>/<input>` are reachable only after mouse focus. The one
good counter-example: table-panel buttons (hotkeys + aria-labels).

## Scope

- [ ] **Escape hatch**: Escape-then-Tab (or Shift+Tab from doc start — Vditor has a TODO
      stub at `fixBrowserBehavior.ts:538`) moves focus out of the contenteditable to the
      toolbar; `role="toolbar"` + roving tabindex + arrow-key nav on the toolbar container.
- [ ] Wiki chips (and future chips: 205/228/229/234): `tabindex="0"` + Enter/Space
      activation — the focus CSS already ships.
- [ ] Outline: focusable items, ArrowUp/Down + Enter navigation; resize splitter focusable
      with `role="separator"` + arrow-key resizing.
- [ ] Diagram zoom: keyboard `+/−/0` on a focused diagram wrapper (gate parity with
      Ctrl+wheel).
- [ ] Callout popover controls reachable via the keyboard once the callout has focus.

## Out of scope

- Screen-reader semantics/labels (task 265 — batch 2), high-contrast (267),
  reduced-motion (266).

## Verification

L2: keyboard-only walk — Escape+Tab reaches toolbar, arrows traverse it, chip Enter opens,
outline arrows navigate, `getValue()` untouched throughout. L3 real-VS-Code (mandatory —
key capture differs in the real webview): the same walk incl. no VS Code chord collisions.
