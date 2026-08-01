# Task 265 — Screen-reader semantics (a11y batch 2: roles, labels, live region)

**Status:** planned · **Impact:** 🟡 med (SR users) · **Pairs with:** 244 (keyboard) · **Origin:** task 192 §10

## Problem

Partial semantics, audited: GOOD — Vditor toolbar items are labeled `<button>`s, table
panel has aria-labels, hint menus arrow-navigate, offscreen sandbox correctly aria-hidden.
MISSING — the contenteditable itself has no role/label (bare `<pre contenteditable>`);
NO aria-live region anywhere (saves, diagram errors, mode switches are silent); wiki chips
are bare spans; **17 of 18 engines emit unlabeled SVG/canvas** that screen readers skip or
read as garbage; callout popover controls have no accessible name.

## Scope

- [ ] Editable surface: `role="textbox"` + `aria-multiline="true"` + a doc-name label,
      set post-init from main.ts (no Vditor patch).
- [ ] One polite `aria-live` region fed by existing events: save state, diagram render
      errors (diagram-error.ts), mode switches, copy confirmations.
- [ ] Diagrams: stamp `role="img"` + `aria-label="<lang> diagram: <first source line>"` on
      every rendered wrapper in the SHARED render path (custom-diagrams.ts) so all 18
      engines inherit it.
- [ ] Chips + injected controls: labels on wiki chips (and the 205/228/234 chip family via
      one shared helper), callout `<select>/<input>` accessible names, zoom buttons.

## Out of scope

- Keyboard operability (244), authored-content alt lint (55), full SR walkthrough script
  (do one manual NVDA/Orca pass, record findings here).

## Verification

L1: label-helper unit. L2: attribute assertions across surfaces + a render → live-region
text assertions on save/error events. L3 real-VS-Code (mandatory): same attribute sweep
under the real pipeline (injected CSS/ARIA interplay).
