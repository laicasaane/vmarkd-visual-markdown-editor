# Task 267 — High-contrast + forced-colors support

**Status:** ✅ completed 2026-09-01 · **Impact:** 🟡 med (low-vision users) · **Origin:** task 192 §10

## Problem

`currentThemeKind()` (extension.ts:143-149) collapses `ColorThemeKind.HighContrast` →
`'dark'` (HC-light → `'light'`) — HC users silently get the ordinary skin. Zero
`vscode-high-contrast`/`forced-colors`/`prefers-contrast` hits anywhere; the 2026 themes
hardcode `rgba(…,.18)` borders that vanish under HC; no HC diagram palette exists.

## Scope

- [x] Plumb the REAL 4-value theme kind through the existing init-payload + live-theme
      channel (task 25 infra) so the webview can key off
      `body.vscode-high-contrast[-light]`.
- [x] Content CSS: when HC, swap hardcoded rgba borders for `--vscode-contrastBorder`,
      boost focus outlines, ensure chip/callout/table borders are visible (the task-82/85
      theme registry was designed to make this "future-easy" — use it).
- [x] Diagram palettes: one HC entry in `diagram-palette.ts` (pure fg/bg +
      contrastBorder strokes) selected when kind is HC — the ADR-0006 registry supports
      adding it; engines inherit via the standard pairing.
- [x] `forced-colors: active` media query pass over main.css for the non-themed chrome.

## Out of scope

- Per-engine HC fine-tuning beyond the shared palette, a dedicated HC content theme file
  (key off the kind + tokens instead).

## Verification

L1: theme-kind plumb unit (4 values through resolve). L2: harness with the HC body class →
border/focus assertions; diagram fingerprint uses the HC palette. L3 real-VS-Code
(mandatory): flip `workbench.colorTheme` to a HC theme → live re-theme applies HC (the
retheme machinery + kind, together).

## Completion evidence

- The host now preserves VS Code's four workbench kinds (`light`, `dark`, `high-contrast`, and
  `high-contrast-light`) in a distinct `themeKind` field on inline/init and live configuration
  messages. The existing binary `theme` remains the content/Vditor rendering mode, so named content
  themes keep their intentional light/dark pinning while accessibility state is no longer lost.
- One webview authority applies exactly the matching `vscode-high-contrast[-light]` body class on
  init, live changes, and the legacy set-theme route. Theme kind is also part of the renderer cache
  key; this prevents an ordinary dark render from being served after a high-contrast flip.
- High-contrast CSS replaces translucent table, heading, quote, callout, details, panel, and diagram
  chrome edges with `--vscode-contrastBorder`; gives wiki/code-reference chips a visible boundary;
  and raises keyboard/caret focus to a three-pixel `--vscode-focusBorder` outline. A separate
  `forced-colors: active` layer uses CanvasText, LinkText, and Highlight for non-themed chrome.
- One dynamic shared diagram palette reads the live editor background/foreground plus
  `contrastBorder` strokes and wins over explicit renderer/content palettes in high contrast.
  Mermaid, ECharts/mindmap, D2, PlantUML, Graphviz, Nomnoml, and flowchart inherit it through their
  existing shared palette translations; named non-HC palettes remain unchanged.
- RED/GREEN theme-kind, palette, renderer-precedence, cache-key, host-message, and router coverage
  passes 187/187 in the focused unit set. Chromium passes 2/2 for the live body-class channel,
  table/callout/chip/control/focus computed styles, shared diagram fingerprint, and emulated
  forced-colors chrome.
- The mandatory real-VS-Code journey passes 1/1 without retries on VS Code 1.129. It opens under
  Default Dark Modern, flips live to Default High Contrast, proves the real body class and VS Code
  token-driven cell/callout/focus styles, waits for Graphviz's re-rendered stroke fingerprint, and
  restores the original dark theme. The first run exposed the missing high-contrast fragment in the
  renderer cache key; the corrected key plus quiescence-aware oracle pass.
- Build, typechecks, lint, module boundaries, and deliberate 606 KB / 294 eager-module / 34 KB
  largest-module budgets pass at 605.4 decimal KB, 294 modules, and 29.5 KB. Final quality passes
  brand checks, lint, duplication, dependency rules, audits, 259 coverage files / 3,731 tests, and
  the 13-module ratchet at 77.10% statements / 69.32% branches / 80.00% functions / 79.18% lines.
  Its sole residual is the pre-existing Knip report for unlisted `yazl` in
  `test/backend/package-local-preview-core.test.ts`, now handed directly to Task 541.
