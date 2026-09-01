# Task 266 — `prefers-reduced-motion` guard for editor animations

**Status:** ✅ completed 2026-09-01 · **Impact:** ⚪ low (vestibular/motion-sensitive), half-day · **Origin:** task 192 §10

## Problem

Zero `prefers-reduced-motion` guards outside D2-generated SVG (the only honor site,
asserted in d2-render.test.ts:939). Unguarded motion: heading-flash keyframes
(main.css:1262), opacity/width/background transitions (main.css:505/894/1230), and
Vditor's own tooltip-appear/scale-in/slideInDown keyframes (index.css:109/261/504).

## Scope

- [x] One `@media (prefers-reduced-motion: reduce)` block in main.css zeroing
      animation/transition durations — ours AND the three Vditor keyframes (index.css is
      already build-patched via `patchVditorIndexCss`, but the override can live in
      main.css; verify specificity).
- [x] JS-driven motion behind a `matchMedia` check: heading-flash class add, preview-morph
      transitions, any scrollIntoView `behavior:'smooth'` (grep + fix).
- [ ] The D2 pattern (tasks 124/155 established it) is the reference — reuse.

## Out of scope

- A user setting overriding the OS preference (the media query IS the contract).

## Verification

L2: emulate reduced-motion (Playwright `reducedMotion:'reduce'`) → computed animation
durations are 0 on the flash/morph elements; flash still marks the heading (class present,
no motion). L3: one leg with the emulation flag on the real webview.

## Completion evidence

- The final `main.css` layer now contains one authoritative reduced-motion media query. It disables
  animation and transition timing for VMDE and Vditor descendants (including pseudo-elements), and
  forces CSS scrolling to `auto`, while leaving state classes such as the heading highlight intact.
- A pure `matchMedia('(prefers-reduced-motion: reduce)')` helper controls every scripted smooth
  scroll found in the webview: outline heading/source-line reveal and find-result reveal now use
  `auto` under the OS preference and retain `smooth` otherwise. CSS owns heading-flash and preview
  morph timing, so their state and final geometry remain unchanged without duplicate JS branches.
- RED/GREEN unit coverage passes 4/4 for matching, non-matching, missing-window, and behavior mapping.
  Focused Chromium coverage passes 1/1 with Playwright reduced-motion emulation, including VMDE's
  flash class, a Vditor inline animation, and computed animation/transition zeroing.
- The required no-retry real-VS-Code run passes 1/1 after building. It proves computed zero motion in
  the actual webview and records `behavior: 'auto'` on same-document navigation. The initial IR-only
  locator did not expose the link; switching the test to WYSIWYG corrected the test oracle without
  changing product code.
- The build and deliberate 605 KB / 293 eager-module / 34 KB largest-module budgets pass at 604.0
  decimal KB, 293 modules, and 29.5 KB. The final quality run passes brand checks, lint, duplication,
  dependency rules, audits, 258 coverage files / 3,712 tests, and the 13-module ratchet at 77.07%
  statements / 69.33% branches / 79.96% functions / 79.16% lines.
- Aggregate coverage initially exposed the Git-backed preview packaging tests' default five-second
  timeout under suite load (2-5 cases varied between runs); the focused file passed 23/23. Raising
  that integration suite's timeout ceiling to 15 seconds makes the same 23 tests and the aggregate
  run deterministic without weakening assertions. The only quality residual is the pre-existing
  Knip report for unlisted `yazl` in `test/backend/package-local-preview-core.test.ts`, owned by
  Task 541.
