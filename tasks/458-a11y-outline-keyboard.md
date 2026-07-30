# Task 458 — Outline panel keyboard operability

**Status:** 📋 OPEN · **Impact:** 🟡 medium · **Origin:** split out of [244](244-keyboard-accessibility.md), 2026-07-30.

## Problem

Outline items are non-focusable spans and the resize splitter is mousedown-only, so the whole panel
is mouse-only.

## Scope

- [ ] Focusable outline items; ArrowUp/Down to traverse, Enter to jump (reuse the existing
      scroll-to-heading path — `message-router.ts` already owns it; do not add a second).
- [ ] The resize splitter as `role="separator"` with arrow-key resizing, persisting the same width
      the drag path persists (`save-outline-width`).

## Verification

L2 harness for the traversal; L3 real-VS-Code for the jump landing on the right heading and the
resize persisting.
