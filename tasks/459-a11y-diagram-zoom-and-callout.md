# Task 459 — Keyboard parity for diagram zoom and the callout popover

**Status:** 📋 OPEN · **Impact:** 🟡 medium · **Origin:** split out of [244](244-keyboard-accessibility.md), 2026-07-30.

## Problem

Diagram zoom is Ctrl+wheel / drag only, and the callout popover's `<select>`/`<input>` are reachable
only after mouse focus.

## Scope

- [ ] `+` / `−` / `0` on a focused diagram wrapper, at parity with the Ctrl+wheel gate
      (`diagram-zoom-gate.ts` owns that gate — the keyboard path must respect the same
      Ctrl-to-interact contract, not bypass it).
- [ ] The callout popover's controls reachable by keyboard once the callout has focus, and
      dismissible with Escape.

## Verification

L3 real-VS-Code for both — the zoom gate and the popover are both real-webview behaviours
(the gate exists because of a wheel-hijack that only reproduces there).
