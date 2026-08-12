# Auto theme pairing Implementation Plan

> **For agentic workers:** Implement task-by-task with tests first and verify each gate before claiming completion.

**Goal:** Resolve `theme.content: auto` to VMark's matching GitHub/VS Code content theme when the active VS Code theme is recognized.

**Architecture:** Keep the mapping pure and in the shared theme registry. The host resolves `auto` for initial and live configuration payloads; an active-color-theme event reuses the existing live-config path so CSS links and diagram palettes stay synchronized.

**Tech Stack:** TypeScript, Vitest, Playwright `vscode-test-playwright`, VS Code custom editor webview.

## Global Constraints

- Explicit `theme.content` values always take precedence over auto pairing.
- Unknown VS Code themes retain the existing VS Code-color auto path.
- New functionality requires unit and real-VS-Code e2e coverage.
- Existing working-tree changes are unrelated and must remain untouched.

### Task 1: Add the pure auto-theme resolver

**Files:**
- Modify: `src/shared/theme-registry.ts`
- Test: `test/backend/content-theme.test.ts`

- [x] Add failing tests for the four supported mappings and an unrelated-theme fallback.
- [x] Run the focused Vitest file and confirm the new assertions fail because the resolver is absent.
- [x] Add the minimal resolver and export it from the registry.
- [x] Run the focused Vitest file and confirm it passes.

### Task 2: Use the resolver for initial and live host configuration

**Files:**
- Modify: `src/platform/editor-config.ts`
- Modify: `src/session/editor-session.ts`
- Test: `test/backend/extension.test.ts`

- [x] Add a failing host test proving auto + `Default Dark Modern` posts a named VMark content theme on a color-theme change.
- [x] Run the focused host test and confirm the expected failure.
- [x] Resolve normalized auto content themes using the active color-theme id and call `postLiveConfig()` when the workbench theme changes.
- [x] Run the focused host test and confirm the new behavior and existing explicit-theme behavior pass.

### Task 3: Add real-VS-Code regression coverage

**Files:**
- Create: `test/vscode-e2e/auto-theme-pairing.spec.ts`
- Create: `test/vscode-e2e/fixtures/auto-theme-pairing.md`

- [x] Write a real custom-editor test that sets auto mode, opens the fixture, changes to the built-in dark/light themes, and asserts the matching `ct-*` link/body marker.
- [x] Build with `node build.mjs` and run only this spec headlessly.

### Task 4: Run repository gates and update task tracking

**Files:**
- Create: `tasks/508-auto-theme-pairing.md`

- [x] Run unit tests, unit coverage, build, focused real-VS-Code e2e, lint, and `npm run quality`.
- [x] Record implemented and the network-blocked audit stage in the task file.
