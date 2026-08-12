# Task 450 E2E Boot Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete task 450 by reducing independent real-VS-Code launches in the remaining parameterised specs without reducing assertion coverage or hiding failures.

**Architecture:** Keep every assertion in its existing feature spec. A merged `test()` opens the shared fixture once, uses `expect.soft()` for independent cases, and reopens the editor only when a case mutates the document or changes an incompatible mode/setting. Specs whose comments require process isolation remain separate.

**Tech Stack:** TypeScript, Playwright, `vscode-test-playwright`, xvfb.

## Global Constraints

- No production-code or dependency changes.
- Merge only cases with the same fixture and valid starting state.
- Every independently meaningful assertion uses `expect.soft()`.
- Do not merge `echarts-theme.spec.ts` or `cut-selection-sv.spec.ts`.
- Build with `node build.mjs` before real-VS-Code tests; run one suite at a time.

---

### Task 1: Five-case specs

**Files:** `list-tight.spec.ts`, `paste-over-selection.spec.ts`, `plantuml-stdlib.spec.ts`

- [ ] Record current `playwright test --list` counts.
- [ ] Merge compatible cases into one or two tests per file; retain `boot()` between mutating cases.
- [ ] Run each touched spec solo under xvfb.

### Task 2: Four-case specs

**Files:** `block-fidelity.spec.ts`, `caret-tab-return.spec.ts`, `cut-selection.spec.ts`, `geojson-basemap.spec.ts`, `inline-code-gap.spec.ts`, `mode-switch-parity.spec.ts`

- [ ] Preserve mode-specific tests when a webview disposal/reopen boundary requires it.
- [ ] Merge fixture-identical cases with soft assertions and explicit reset/reopen boundaries.
- [ ] Run every touched spec solo under xvfb.

### Task 3: Three-case specs

**Files:** `callout-edit.spec.ts`, `clipboard-collapsed.spec.ts`, `d2-sketch.spec.ts`, `d2-theme.spec.ts`, `diagram-edit-monitor.spec.ts`, `echarts-resize.spec.ts`, `link-button-url.spec.ts`, `mermaid-elk.spec.ts`, `perf-edit.spec.ts`, `plantuml-stdlib-more.spec.ts`, `prose-fast-edit.spec.ts`, `smiles-render.spec.ts`, `wavedrom-theme.spec.ts`, `wysiwyg-parity.spec.ts`

- [ ] Merge only compatible fixture/state cases; leave incompatible cases as separate top-level tests.
- [ ] Preserve all named regression assertions with `expect.soft()` in merged sweeps.
- [ ] Run every touched spec solo under xvfb.

### Task 4: Completion proof

- [ ] Re-run `npx playwright test --list` and record before/after boot count.
- [ ] Run `xvfb-run -a npm run test:vscode:fast` and smoke.
- [ ] Run `npm run quality`.
- [ ] Mark task 450 DONE and move it to `tasks/done/`; update only its README index link.
