# Task 266 — `prefers-reduced-motion` guard for editor animations

**Status:** planned · **Impact:** ⚪ low (vestibular/motion-sensitive), half-day · **Origin:** task 192 §10

## Problem

Zero `prefers-reduced-motion` guards outside D2-generated SVG (the only honor site,
asserted in d2-render.test.ts:939). Unguarded motion: heading-flash keyframes
(main.css:1262), opacity/width/background transitions (main.css:505/894/1230), and
Vditor's own tooltip-appear/scale-in/slideInDown keyframes (index.css:109/261/504).

## Scope

- [ ] One `@media (prefers-reduced-motion: reduce)` block in main.css zeroing
      animation/transition durations — ours AND the three Vditor keyframes (index.css is
      already build-patched via `patchVditorIndexCss`, but the override can live in
      main.css; verify specificity).
- [ ] JS-driven motion behind a `matchMedia` check: heading-flash class add, preview-morph
      transitions, any scrollIntoView `behavior:'smooth'` (grep + fix).
- [ ] The D2 pattern (tasks 124/155 established it) is the reference — reuse.

## Out of scope

- A user setting overriding the OS preference (the media query IS the contract).

## Verification

L2: emulate reduced-motion (Playwright `reducedMotion:'reduce'`) → computed animation
durations are 0 on the flash/morph elements; flash still marks the heading (class present,
no motion). L3: one leg with the emulation flag on the real webview.
