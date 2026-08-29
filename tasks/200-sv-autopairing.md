# Task 200 — Autopairing in SV (source) mode

**Status:** planned · **Impact:** ⚪ low · **Origin:** task 192 §2

## Problem

Typora auto-pairs `**`, `[]`, `()`, quotes as you type. Vditor has no pairing feature
anywhere (grep autopair/matchpair in vendored src → 0). In ir/wysiwyg the live render
closes constructs so the value is marginal — the gap bites in **SV source mode**, where
users type raw markdown.

## Scope

- [ ] Setting `vmde.editor.autoPairing` (default off; scope: sv only v1). Pairs:
      `( [ { " ' * _` (emphasis pairs on word boundaries only — `*` mid-word must not pair).
- [ ] Behaviours: type opener → insert pair, caret between; type closer over an
      auto-inserted closer → step over; Backspace on an empty pair removes both;
      **selection + opener wraps the selection** (the actually-useful case).
- [ ] Keydown-level implementation in a small module (`sv-autopair.ts`) bound to the sv
      element only; must post through the normal input pipeline so edit-sync sees ONE edit.

## Out of scope

- ir/wysiwyg pairing (live render covers it), smart punctuation (task 199), auto-closing
  markdown structures (```` ``` ```` fences — Vditor already continues those).

## Verification

- L1: pairing decision table unit (opener/closer/step-over/backspace/word-boundary).
- L2: sv harness typing spec — all behaviours + wrap-selection; `getValue()` and the right
  preview pane correct; exactly one edit post per action.
- L3 real-VS-Code: one smoke leg in the sv split spec (webview feature ⇒ real e2e).
