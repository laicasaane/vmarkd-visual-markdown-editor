# Task 457 — Focusable wiki chips (Enter/Space activation)

**Status:** 📋 OPEN · **Impact:** 🟡 medium · **Origin:** split out of [244](244-keyboard-accessibility.md), 2026-07-30.

## Problem (re-verified 2026-07-30)

Wiki chips are `<span>`s and **ZERO `tabindex` is set anywhere in our source** — the only occurrence
in the tree is a SELECTOR reading them (`focus-restore.ts`). So `.wiki-link-chip:focus-visible`
(`main.css:1164`) is dead CSS: nothing can ever be focused to trigger it. The styling for this
feature already ships; only the focusability is missing.

## Scope

- [ ] `tabindex="0"` on wiki chips + Enter/Space activation (same action as the click path — reuse
      it, do not duplicate the open logic).
- [ ] Apply the same treatment to future chip classes as they land (205/228/229/234) — or, better,
      put it in whatever shared chip decoration exists so they inherit it.

## Out of scope

Screen-reader semantics/labels (task 265).

## Verification

L2 harness: Tab reaches a chip, Enter activates it, `getValue()` unchanged.
L3 real-VS-Code: the same walk, and the focus ring actually paints (that is the dead CSS coming
alive, and the only way to prove it).
