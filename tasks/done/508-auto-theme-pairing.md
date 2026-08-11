# Task 508 — Auto theme pairing with VS Code and GitHub themes

**Status:** done · **Origin:** user request (2026-08-11)

## Goal

When `vmarkd.theme.content` is `auto`, choose VMark's matching content stylesheet
for the active VS Code theme when it is one of the supported VS Code or GitHub
themes. Explicit `theme.content` values continue to take precedence.

## Implementation

- [x] `Default Light Modern` → `vscode-light-2026`.
- [x] `Default Dark Modern` → `vscode-dark-2026`.
- [x] Standard VS Code aliases (`Dark+`, `Dark Modern`, `Light+`, `Light Modern`,
      Visual Studio and 2026 variants) map to the corresponding VMark themes.
- [x] GitHub light/dark theme IDs → `github-light`/`github-dark`.
- [x] Resolve the pairing for initial HTML and live configuration updates.
- [x] Update stylesheet, VS Code color usage, body attributes, and diagram
      palettes when the active VS Code theme changes.

## Verification

- [x] Unit tests: `npm test` — 201 files, 2891 tests passed.
- [x] Coverage: `npm run test:coverage` — new resolver/config paths exercised.
- [x] Build: `node build.mjs` passed.
- [x] Real VS Code e2e: `auto-theme-pairing.spec.ts` — 1 test passed.
- [x] Webview router regression: mode-only `config-changed` rethemes all diagram
      engines; focused `message-router.test.ts` — 35 tests passed.
- [x] Host live-update coverage includes a GitHub theme ID and the real-VS-Code
      e2e verifies fallback to the VS Code-variable path for an unrelated theme.
- [x] Scoped lint: all files changed by this task pass `biome check`.
- [x] Quality stages: lint, knip, jscpd, dependency-cruiser, coverage, and the
      coverage-module ratchet passed. The composite command's audit stage was
      blocked once by sandbox DNS (`EAI_AGAIN`); standalone `npm run audit`
      with registry access found 0 vulnerabilities for host and webview.

## Assumption

The supported built-in VS Code pair is the modern default theme IDs, while
other themes remain on the existing `auto` behavior unless explicitly selected.

## Follow-up — auto font for other themes

- [x] When auto pairing does not select a named VMark theme, prose now uses
      `markdown.preview.fontFamily` from VS Code instead of
      `--vscode-editor-font-family` (usually monospace).
- [x] The setting is resource-scoped, applies to initial HTML and live updates,
      and code blocks retain their monospace font.
- [x] Real VS Code e2e covers initial and live custom font-family changes.

## Follow-up — diff gutter replacement lines

- [x] Replaced lines now produce one `modified` marker on the current block;
      the removed side no longer paints the preceding block blue while the
      replacement paints the edited block green.
- [x] Unit regression covers the replacement-line mapping.
- [x] Real VS Code regression spec added in `diff-gutter.spec.ts`; execution
      requires the same Electron sandbox permission as the rest of the real
      VS Code suite.
