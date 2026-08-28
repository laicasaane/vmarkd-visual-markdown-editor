# Line Wrapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver manual Markdown-aware rewrapping first, then opt-in debounced auto-wrap in SV, IR, and WYSIWYG with lossless visual soft-break reflow.

**Architecture:** `media-src/src/editing/rewrap-markdown.ts` owns one pure range formatter and is the only wrapping algorithm. A mode-aware transaction adapter maps live selections to source offsets, applies the formatter through Vditor, restores source-mapped carets and scroll, and snapshots undo explicitly. Task 516 composes that adapter with a cancellable controller and a Phase-0-proven Lute/Vditor soft-break identity bridge; host commands and configuration only forward intent and values.

**Tech Stack:** TypeScript, Vditor/Lute, VS Code contributed configuration, Vitest, Chromium Playwright, real-VS-Code Playwright.

**Spec:** `tasks/273-rewrap-to-column.md`, then `tasks/516-auto-wrap-while-typing.md`

## Global Constraints

- Complete and commit Task 273 before any Task 516 production implementation.
- Keep `LOCAL_AGENT_TASK.md` untracked, unstaged, uncommitted, and unchanged.
- Never edit generated output or the generated Lute blob.
- Preserve two-space and backslash hard breaks and safely no-op on ambiguous or excluded Markdown.
- Use one formatter for manual and automatic wrapping; do not fork mode-specific algorithms.
- Do not push, modify remotes, merge branches, rewrite history, or expand scope.

---

### Task 1: Shared Markdown rewrap engine

**Files:**
- Create: `media-src/src/editing/rewrap-markdown.ts`
- Create: `media-src/src/editing/rewrap-markdown.test.ts`

**Interfaces:**
- Consumes: complete Markdown, source range, caret offset, positive wrap column.
- Produces: `rewrapMarkdownRange(markdown, startOffset, endOffset, caretOffset, column): RewrapResult` where `RewrapResult` contains `markdown`, `caretOffset`, and `changed`.

- [ ] **Step 1: Write failing behavior tests**

  Add literal input/output cases for ordinary paragraphs, collapsed-caret paragraph expansion, explicit selections, word-boundary wrapping, wide/combining Unicode display width, list and quote/callout prefixes, nested continuation indentation, two-space and backslash hard-break boundaries, idempotence, and caret mapping. Add safe no-op cases for fenced and indented code, diagram fences, math, front matter, tables, raw HTML, link-reference definitions, and ambiguous mixed selections.

- [ ] **Step 2: Run the formatter test red**

  Run `npx vitest run --config test/vitest.config.ts media-src/src/editing/rewrap-markdown.test.ts` and confirm failure is caused by the missing formatter contract.

- [ ] **Step 3: Implement the minimal classifier and formatter**

  Parse line spans without normalizing untouched bytes; classify one logical paragraph/list/quote region; tokenize prose without splitting words; measure display width by code point with combining, full-width, and emoji handling; rebuild continuation prefixes; map the caret through source-token positions; return the original input on exclusions or ambiguity.

- [ ] **Step 4: Run green and mutation-check the cases**

  Re-run the focused test and confirm realistic mutations to prefix width, hard-break detection, excluded-block detection, Unicode width, and caret mapping each fail at least one assertion.

- [ ] **Step 5: Inspect focused coverage**

  Run `COLUMNS=2000 npx vitest run --config test/vitest.config.ts --coverage --coverage.include='media-src/src/editing/rewrap-markdown.ts' --coverage.reporter=text media-src/src/editing/rewrap-markdown.test.ts` and cover every new behavior branch that is not defensive-only.

### Task 2: Manual mode transaction and command

**Files:**
- Create: `media-src/src/editing/rewrap-command.ts`
- Create: `media-src/src/editing/rewrap-command.test.ts`
- Modify: `media-src/src/bridge/message-router.ts`
- Modify: `media-src/src/boot/main.ts`
- Modify: `media-src/src/boot/editor-session-state.ts`
- Modify: `src/shared/protocol.ts`
- Modify: `src/app/commands.ts`
- Modify: `package.json`
- Modify: relevant manifest/config/command unit tests under `test/backend/`

**Interfaces:**
- Consumes: `rewrapMarkdownRange`, current Vditor instance, live source selection, configured `wrapColumn`.
- Produces: `runRewrapCommand(): boolean`, host message `rewrap-selection`, command `vmarkd.rewrap`, Alt+Q binding, and `VmarkdConfigOptions.wrapColumn`.

- [ ] **Step 1: Write failing adapter and manifest tests**

  Prove source-offset extraction for collapsed and non-collapsed selections, returned-caret restoration, scroll preservation, unchanged no-op behavior, one explicit undo snapshot, edit-sync scheduling, manifest default/scope/description, command registration, palette visibility, editor menu placement, and Alt+Q forwarding.

- [ ] **Step 2: Run the focused tests red**

  Run the new Vitest files plus the relevant backend manifest/config/command tests and confirm the missing adapter/message/config paths cause the failures.

- [ ] **Step 3: Implement the mode-aware transaction**

  Serialize the active logical source with collision-free selection markers for IR/WYSIWYG and direct text offsets for SV; run the pure formatter; force the pre-format undo snapshot; apply the changed Markdown with Vditor's normal render path; force the post-format snapshot; restore the source-mapped caret and scroll; invalidate/schedule edit sync exactly once; suppress recursive input scheduling while applying.

- [ ] **Step 4: Wire host command and configuration**

  Add `vmarkd.editor.wrapColumn` default `80`, resource scope, and description; propagate it through `collectConfigOptions`; add the protocol message and router handler; register `vmarkd.rewrap`; contribute Alt+Q and command/menu entries scoped to `activeCustomEditorId == vmarkd.editor`.

- [ ] **Step 5: Run focused unit tests green**

  Re-run the adapter, protocol/router, manifest/config, and command tests until clean.

### Task 3: Manual Chromium and real-VS-Code acceptance

**Files:**
- Create: `media-src/e2e/rewrap.spec.ts`
- Create: `test/vscode-e2e/rewrap.spec.ts`
- Create: `test/vscode-e2e/fixtures/rewrap.md`

**Interfaces:**
- Consumes: real Vditor and actual VS Code webview key capture.
- Produces: browser and real-webview evidence for SV, IR, and WYSIWYG command behavior.

- [ ] **Step 1: Write Chromium and real-VS-Code specs before changing integration code further**

  Drive a real fixture and assert word-boundary wrapping, prefix/hard-break preservation, underlying bytes in all modes, caret/scroll preservation, semantic Preview stability, one undo, and Alt+Q in the real webview.

- [ ] **Step 2: Build and run the focused specs**

  Run `node build.mjs`, then `xvfb-run -a npm --prefix media-src exec -- playwright test rewrap.spec.ts`, then `env -u ELECTRON_RUN_AS_NODE xvfb-run -a npm --prefix test/vscode-e2e test -- rewrap.spec.ts`.

- [ ] **Step 3: Fix only failures within Task 273 scope using red-green cycles**

  For every discovered defect, first reduce it to a focused failing unit or e2e assertion, then make the smallest implementation correction and re-run the focused layers.

### Task 4: Verify, close, and commit Task 273

**Files:**
- Move: `tasks/273-rewrap-to-column.md` to `tasks/done/273-rewrap-to-column.md`
- Modify: `tasks/README.md`

**Interfaces:**
- Consumes: passing Task 273 implementation and evidence.
- Produces: honest completed task record and focused local Task 273 commits.

- [ ] **Step 1: Run Task 273 gates**

  Run focused coverage, focused Chromium, focused real-VS-Code, `npm run lint:ci`, `node build.mjs`, applicable typechecks, `git diff --check`, and the routine quality gates required by the task record.

- [ ] **Step 2: Record exact evidence and close the task**

  Mark only verified checklist items complete, record commands/results/retries, move the task file, and update its index link/status.

- [ ] **Step 3: Inspect and commit without the operator file**

  Confirm `git status --short -- LOCAL_AGENT_TASK.md` shows only the intended untracked file and `git diff --cached --name-only` excludes it. Create focused implementation/test and task-closure commits without pushing.

### Task 5: Phase 0 live visual soft-break probe

**Files:**
- Create or modify: `media-src/e2e/auto-wrap-softbreak.spec.ts`
- Modify only if required by evidence: `media-src/esbuild-shared.mjs`
- Modify only if required by evidence: `test/backend/vditor-source-patches.test.ts`

**Interfaces:**
- Consumes: current vendored Lute through the real Vditor bundle and the exact task-516 soft/two-space/backslash fixture.
- Produces: recorded IR/WYSIWYG DOM and byte-round-trip matrix for `SetSoftBreak2HardBreak(true|false)` through render, spin, serialize, and mode round-trip.

- [ ] **Step 1: Add the failing real-Vditor matrix**

  Assert soft newlines flow visually while two-space/backslash hard breaks remain distinct and exact Markdown bytes survive IR/WYSIWYG render, block spin, serialization, and mode round-trips.

- [ ] **Step 2: Run the matrix red and record the exact distinction loss**

  Run `node build.mjs` and `xvfb-run -a npm --prefix media-src exec -- playwright test auto-wrap-softbreak.spec.ts`; save the observed DOM/Markdown mismatch in the task record or test diagnostics.

- [ ] **Step 3: Choose the evidence-permitted integration**

  Reuse existing identity when sufficient. Otherwise add the smallest anchor-guarded wrapper or Vditor source patch that preserves soft/hard identity without editing generated output. Stop before production Task 516 work if evidence proves a Lute rebuild/fork or vendoring-pipeline change is the only viable solution.

- [ ] **Step 4: Run the matrix green**

  Confirm byte-identical Markdown plus the intended live visual break behavior in both modes and retain permanent regression coverage.

### Task 6: Line Wrapping settings and effective Preview reflow

**Files:**
- Modify: `package.json`
- Modify: `src/shared/protocol.ts`
- Modify: `src/platform/editor-config.ts`
- Modify: `media-src/src/boot/live-config.ts`
- Modify: `media-src/src/bridge/message-router.ts`
- Modify: relevant backend/webview config tests

**Interfaces:**
- Consumes: Task 273 `wrapColumn` and Task 83 preview bridge.
- Produces: `autoWrap`, `autoWrapDelay`, exact Line Wrapping group/order/descriptions, and effective Preview reflow `autoWrap || reflowLineBreaks`.

- [ ] **Step 1: Write failing schema/config/live-update tests**

  Assert defaults, resource scope, bounds `100` to `5000`, exact property order, cross-linked markdown descriptions, removal of the empty Preview section, shared config propagation, and effective Preview reflow without remounting.

- [ ] **Step 2: Run tests red, implement minimal propagation, run green**

  Add `wrapColumn`, `autoWrap`, and `autoWrapDelay` to the shared config contract and change Preview application to receive the effective boolean while preserving Task 83's Preview-only behavior when auto-wrap is off.

### Task 7: Cancellable auto-wrap controller

**Files:**
- Create: `media-src/src/editing/auto-wrap.ts`
- Create: `media-src/src/editing/auto-wrap.test.ts`

**Interfaces:**
- Consumes: injected target capture/validation and apply callback plus `AutoWrapConfig`.
- Produces: `AutoWrapController` with `updateConfig`, `cancel`, and `dispose`, and input/composition event hooks.

- [ ] **Step 1: Write fake-timer tests red**

  Cover trailing debounce/reset, delay change, disable, cancel/dispose, ordinary `insertText` only, paste/drop/delete/Enter/format/undo/redo/programmatic exclusions, IME deferral to `compositionend`, stale editor/mode/document/block/selection cancellation, recursion suppression, unchanged no-op, and independent controllers.

- [ ] **Step 2: Implement timer and cancellation state only**

  Keep Markdown and DOM formatting out of this module. Store one cancellable timeout, capture an opaque target generation on eligible input, validate it at fire time, and guard apply callbacks from rescheduling themselves.

- [ ] **Step 3: Run controller tests green and inspect coverage**

  Exercise each cancellation branch with fake timers and inspect changed-line coverage for uncovered controller paths.

### Task 8: Auto-wrap mode integration and undo

**Files:**
- Modify: `media-src/src/editing/rewrap-command.ts`
- Modify: `media-src/src/boot/vditor-init.ts`
- Modify: `media-src/src/boot/main.ts`
- Modify: `media-src/src/boot/editor-session-state.ts`
- Modify: `media-src/src/bridge/message-router.ts`
- Create or modify: mode-adapter unit tests and `media-src/e2e/auto-wrap.spec.ts`

**Interfaces:**
- Consumes: shared Task 273 formatter/transaction and Task 7 controller.
- Produces: range-local automatic wrapping in SV/IR/WYSIWYG with separate typing and formatting undo entries.

- [ ] **Step 1: Write failing mode and undo tests**

  Assert range-only formatting, nested prefix cases, hard-break/source fidelity, caret/scroll preservation, no host edit on no-op, typing snapshot before formatting snapshot, one coherent host edit, mode/document/config cancellation, and no recursive scheduling.

- [ ] **Step 2: Integrate eligible input and transactions**

  Capture the source block/range at ordinary text input, schedule the controller after Vditor has updated the DOM, force a typing undo snapshot before applying, use the shared transaction for the format snapshot, and schedule host sync once.

- [ ] **Step 3: Run unit and Chromium tests green**

  Verify all three modes through real Vditor and keep explicit hard breaks and exact bytes stable through mode switches.

### Task 9: Real-VS-Code auto-wrap acceptance

**Files:**
- Create: `test/vscode-e2e/auto-wrap.spec.ts`
- Create: `test/vscode-e2e/fixtures/auto-wrap.md`

**Interfaces:**
- Consumes: complete Task 516 implementation.
- Produces: end-to-end evidence in SV, IR, WYSIWYG, and Preview.

- [ ] **Step 1: Write the focused spec**

  Type prose past the configured column in all modes; poll observable source/DOM state after the configured delay; assert word boundaries, soft visual flow, visible hard breaks, caret/scroll, IME safety, save/reopen exact bytes, stale cancellation, and two-step undo.

- [ ] **Step 2: Build and run focused acceptance**

  Run `node build.mjs`, then `env -u ELECTRON_RUN_AS_NODE xvfb-run -a npm --prefix test/vscode-e2e test -- auto-wrap.spec.ts`. Record retry recovery separately from clean passes.

### Task 10: Verify, close, and commit Task 516

**Files:**
- Move: `tasks/516-auto-wrap-while-typing.md` to `tasks/done/516-auto-wrap-while-typing.md`
- Modify: `tasks/README.md`

**Interfaces:**
- Consumes: complete integrated line-wrapping chain.
- Produces: passing full gates, honest task closure, focused local Task 516 commits, and final combined-tree evidence.

- [ ] **Step 1: Run every Task 516 completion gate**

  Run `npm run lint:ci`, focused and full Vitest, `node build.mjs`, bundle/startup budgets, all three typechecks, focused changed-line coverage, full unit coverage and module ratchet, full Chromium, focused real-VS-Code acceptance, dependency audits, `npm run quality`, and `git diff --check`.

- [ ] **Step 2: Run final integrated verification**

  Re-run both focused real-VS-Code specs on the combined tree and the routine real-VS-Code tier required by current `DEVELOPMENT.md`; report any retry/flaky recovery distinctly.

- [ ] **Step 3: Record closure evidence and commit without pushing**

  Update only verified checklist items, move/index Task 516, inspect the final diff and staged paths, confirm `LOCAL_AGENT_TASK.md` remains excluded, create focused local commits, and report hashes plus residual risks.
