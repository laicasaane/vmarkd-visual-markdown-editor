# Task 267 — High-contrast + forced-colors support

**Status:** planned · **Impact:** 🟡 med (low-vision users) · **Origin:** task 192 §10

## Problem

`currentThemeKind()` (extension.ts:143-149) collapses `ColorThemeKind.HighContrast` →
`'dark'` (HC-light → `'light'`) — HC users silently get the ordinary skin. Zero
`vscode-high-contrast`/`forced-colors`/`prefers-contrast` hits anywhere; the 2026 themes
hardcode `rgba(…,.18)` borders that vanish under HC; no HC diagram palette exists.

## Scope

- [ ] Plumb the REAL 4-value theme kind through the existing init-payload + live-theme
      channel (task 25 infra) so the webview can key off
      `body.vscode-high-contrast[-light]`.
- [ ] Content CSS: when HC, swap hardcoded rgba borders for `--vscode-contrastBorder`,
      boost focus outlines, ensure chip/callout/table borders are visible (the task-82/85
      theme registry was designed to make this "future-easy" — use it).
- [ ] Diagram palettes: one HC entry in `diagram-palette.ts` (pure fg/bg +
      contrastBorder strokes) selected when kind is HC — the ADR-0006 registry supports
      adding it; engines inherit via the standard pairing.
- [ ] `forced-colors: active` media query pass over main.css for the non-themed chrome.

## Out of scope

- Per-engine HC fine-tuning beyond the shared palette, a dedicated HC content theme file
  (key off the kind + tokens instead).

## Verification

L1: theme-kind plumb unit (4 values through resolve). L2: harness with the HC body class →
border/focus assertions; diagram fingerprint uses the HC palette. L3 real-VS-Code
(mandatory): flip `workbench.colorTheme` to a HC theme → live re-theme applies HC (the
retheme machinery + kind, together).
