# Task 244 — FIX: keyboard trap + keyboard-only operability (a11y batch 1)

**Status:** 🔵 **SPLIT (2026-07-30)** — the diagnosis below was re-verified and is ACCURATE; the
SCOPE is the problem. · **Impact:** 🔴 high (keyboard/motor-impaired + power users) · **Origin:** task 192 §10

## Re-verified 2026-07-30 — every claim below still holds

Unlike two other task files re-measured this session, this one has not drifted:
- `tab: '\t'` is set (now `vditor-init.ts:250`, not `main.ts:337` — line moved, claim intact), and
  Vditor's `fixTab` preventDefaults Tab whenever `options.tab` is set.
- **ZERO `tabindex` is set anywhere in our source.** The only occurrence is a SELECTOR reading them
  in `focus-restore.ts`. So `.wiki-link-chip:focus-visible` (`main.css:1164`) really is dead CSS —
  nothing can ever be focused to trigger it.
- `aria-label` appears only on the table panel and the diagram fullscreen button — exactly the "one
  good counter-example" this file names.

## Why this is split, not done in one pass

This is six independent surfaces (editor escape hatch, toolbar, wiki chips, outline, diagram zoom,
callout popover) sharing only a theme. Delivering them as one item produces either a shallow pass
across all six or a "done" that is only true of some — and the escape hatch in particular is a
DESIGN decision (it has to coexist with the deliberate `tab: '\t'` indent), not a mechanical edit.

The split, in dependency and value order:

- **[456](done/456-a11y-escape-the-editor.md) — Escape the editor by keyboard (the actual WCAG 2.1.2 keyboard trap).** Escape arms a
  one-shot "next Tab leaves" flag; the following Tab moves focus to the toolbar instead of inserting
  a tab character; anything else disarms it. This is the design that resolves the apparent conflict
  with `tab: '\t'` — Tab keeps indenting during ordinary editing, and the escape is an explicit
  two-key gesture, which is also how the platform convention works. Includes `role="toolbar"` +
  roving tabindex + arrow-key traversal, because escaping into a toolbar you cannot then traverse
  is not an escape. **This is the one that closes the actual violation** and should ship first.
- **[457](done/457-a11y-focusable-chips.md) — Focusable chips.** `tabindex="0"` + Enter/Space on wiki chips (and the future chip
  classes 205/228/229/234). The focus CSS already ships; this is the smallest real win in the file.
- **[458](done/458-a11y-outline-keyboard.md) — Outline keyboard operability.** Focusable items, ArrowUp/Down + Enter, and the resize
  splitter as `role="separator"` with arrow-key resizing.
- **[459](done/459-a11y-diagram-zoom-and-callout.md) — Diagram zoom + callout popover by keyboard.** `+`/`−`/`0` on a focused diagram wrapper
  (parity with the Ctrl+wheel gate), and reaching the callout popover's controls without a mouse.

Nothing here is descoped — the four together are exactly the original scope. Splitting is so each
can be verified honestly, per this project's rule that a keyboard-only walk must be asserted in the
REAL webview (key capture differs there).

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
