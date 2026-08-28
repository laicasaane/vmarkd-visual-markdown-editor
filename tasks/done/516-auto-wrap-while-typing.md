# Task 516 — Auto-wrap while typing in source and live visual modes

> **For agentic workers:** Use `superpowers:test-driven-development` for implementation and
> `superpowers:verification-before-completion` before each commit or completion claim. Apply the
> repository's `vmarkd-lute-features` and `vmarkd-testing` skills. Keep checklist state current.

**Status:** ✅ COMPLETE (2026-08-28) — Task 273's shared Markdown-aware wrap engine reused ·
**Impact:** 🟡 medium-high for repository-document authors · **Origin:** user request, 2026-08-28

**Goal:** Hard-wrap eligible Markdown prose at the configured column after typing pauses, in SV,
IR, and WYSIWYG, while live visual modes render inserted soft physical newlines as spaces and keep
explicit Markdown hard breaks visible.

**Architecture:** Task 516 consumes Task 273's one pure rewrap engine, adds a trailing-debounce
controller in the webview, and applies the result as a separate undoable editor transaction. A
source-preserving soft-break representation must survive Markdown → IR/WYSIWYG DOM → Vditor spin →
Markdown; CSS-only hiding and host-after-sync rewrites are prohibited because they lose hard-break
identity or disturb caret/undo behavior.

**Tech stack:** TypeScript, Vditor/Lute, VS Code contributed configuration, Vitest, Chromium
Playwright, and real-VS-Code Playwright.

**Depends on:** [Task 273](273-rewrap-to-column.md) for `vmarkd.editor.wrapColumn` and the pure
Markdown-aware rewrap engine. **Related:** [Task 83](83-softbreak-commonmark.md) for Preview
soft-break reflow and its hard-break recovery precedent; tasks 61 and 69 for writeback and
incremental IR serialization invariants.

## Approved product decisions

- Add `vmarkd.editor.autoWrap`, boolean, resource-scoped, default `false`.
- Add `vmarkd.editor.autoWrapDelay`, number in milliseconds, resource-scoped, default `500`,
  minimum `100`, maximum `5000`. It is ignored unless Auto Wrap is enabled.
- Reuse `vmarkd.editor.wrapColumn` from Task 273, default `80`; do not add another width setting.
- Use a trailing debounce: every eligible text input resets the timer, and wrapping runs once after
  the configured idle period.
- Apply in SV, IR, and WYSIWYG. Auto Wrap also enables lossless soft-break visual reflow in IR,
  WYSIWYG, and Preview.
- Effective Preview reflow is:

  ```text
  vmarkd.editor.autoWrap || vmarkd.preview.reflowLineBreaks
  ```

- Auto-wrap formatting is its own undo step. One Undo removes only the inserted/repositioned soft
  physical newlines; a second Undo removes the user's preceding typing.
- Never split a word merely to hit the exact column.
- Preserve two-space and backslash hard breaks as visible and semantic boundaries.
- Keep the feature opt-in. With Auto Wrap disabled, editor behavior remains unchanged; Task 83's
  Preview-only setting remains independently available.

## Settings-page contract

Create one contributed-configuration section titled **Line Wrapping** and place these settings in
this exact visual order:

1. `vmarkd.editor.wrapColumn`
2. `vmarkd.editor.autoWrap`
3. `vmarkd.editor.autoWrapDelay`
4. `vmarkd.preview.reflowLineBreaks`

Use property `order` values to keep them adjacent. Remove the old now-empty Preview section after
moving `vmarkd.preview.reflowLineBreaks`; the setting key and scope do not change. Each
`markdownDescription` must cross-reference related settings with VS Code's `#setting.key#` syntax:

- Wrap Column says it controls manual Rewrap and Auto Wrap.
- Auto Wrap says it waits for Auto Wrap Delay and automatically reflows soft physical newlines in
  live visual modes and Preview.
- Auto Wrap Delay says it is ignored unless `#vmarkd.editor.autoWrap#` is enabled.
- Preview Reflow says Auto Wrap enables the same Preview behavior automatically, while this switch
  permits Preview-only reflow when Auto Wrap is disabled.

VS Code's contributed-setting schema does not dynamically disable one setting based on another.
The dependency is enforced at runtime and explained in the adjacent descriptions; do not invent a
second effective-delay value or an unsupported conditional schema.

## Dependency contract with Task 273

Do not start production implementation until Task 273 is complete and exposes one pure formatter
used by both manual and automatic wrapping. If Task 273 is still open, implement and close it under
its own task and focused commit first rather than absorbing its scope silently into Task 516.

The shared formatter must accept complete Markdown plus the logical paragraph/selection range and
caret offset, and return:

```ts
interface RewrapResult {
  markdown: string
  caretOffset: number
  changed: boolean
}

function rewrapMarkdownRange(
  markdown: string,
  startOffset: number,
  endOffset: number,
  caretOffset: number,
  column: number,
): RewrapResult
```

Task 273 owns the implementation and naming migration if its final API differs, but Task 516 must
consume one shared pure function with these semantics. It must be idempotent, Unicode-width aware,
prefix-aware for lists/blockquotes/callouts, and preserve explicit hard-break boundaries.

## Phase 0 — prove lossless live visual reflow

This is a mandatory evidence gate, not optional research. Probe the current vendored Lute through
the real Vditor bundle with all of these inputs:

```ts
const markdown = [
  'soft alpha',
  'soft beta',
  '',
  'two-space alpha  ',
  'two-space beta',
  '',
  'backslash alpha\\',
  'backslash beta',
].join('\n')
```

Record the IR and WYSIWYG DOM produced with `SetSoftBreak2HardBreak(true)` and `false`, then run the
corresponding `VditorIRDOM2Md` / `VditorDOM2Md` serializers and a block spin. Establish whether the
current DOM already carries enough identity to distinguish soft newlines from explicit hard breaks.

- If identity survives, use the existing node/attribute shape and add permanent round-trip tests.
- If identity does not survive, add the smallest anchor-guarded Vditor/Lute integration that gives
  soft breaks a persistent identity through render, spin, and serialization. Prefer wrapping the
  exposed Lute calls or an anchored Vditor source patch over modifying generated
  `media/vditor/dist/js/lute/lute.min.js`.
- If satisfying the contract requires rebuilding/forking Lute or changing its vendored source
  pipeline, stop and obtain Project Owner approval for that explicit scope expansion before
  proceeding.

Rejected approaches:

- `br { display:none }` or pseudo-content CSS — cannot distinguish soft and hard breaks reliably and
  has unsafe contenteditable/caret semantics.
- Joining source lines before rendering and reconstructing them later from a host-side map — loses
  identity under Vditor spin and external edits.
- Rewrapping after the debounced edit has already reached the host — creates two document edits,
  dirty-state churn, and the wrong undo boundary.

## Auto-wrap controller

Create a focused webview module, expected at `media-src/src/editing/auto-wrap.ts`, with a testable
controller boundary:

```ts
interface AutoWrapConfig {
  enabled: boolean
  delayMs: number
  column: number
}

interface AutoWrapController {
  updateConfig(config: AutoWrapConfig): void
  cancel(): void
  dispose(): void
}
```

The installer may accept injected mode, selection, serialization, and apply-transaction callbacks,
but timer ownership and cancellation must stay inside this module. Use the repository debounce
helper only if its cancellation behavior satisfies the contract; do not create uncancellable
timeouts.

### Eligible input

- Schedule on ordinary prose `insertText` input and after `compositionend`.
- During IME composition, never inspect, serialize, or rewrite the active block.
- Do not auto-wrap paste, drop, deletion, Enter, formatting commands, undo/redo, programmatic
  updates, or mode changes. Users can invoke Task 273's manual Rewrap for pasted or existing prose.
- Capture the logical edited paragraph/block at input time. Cancel if the document, mode, editor
  instance, selection target, or captured block becomes invalid before the timer fires.
- Disabling Auto Wrap or changing documents/modes cancels pending work immediately. Changing the
  delay cancels the old timer; subsequent eligible input uses the new delay.

### Eligible Markdown

Support ordinary paragraphs plus list-item, nested-list, blockquote, and callout prose handled by
Task 273's shared formatter. Preserve continuation indentation and quote prefixes.

Never rewrite fenced/indented code, diagram fences, math, front matter, tables, raw HTML blocks,
link-reference definitions, or any block the formatter cannot classify unambiguously. A safe no-op
is preferable to malformed Markdown.

## Mode integration and transactions

### SV

Read the raw source text and selection offsets, run `rewrapMarkdownRange`, replace only the affected
range, restore the returned caret offset, and create one Vditor undo snapshot for the automatic
format. Do not replace the whole document.

### IR and WYSIWYG

Operate on the underlying Markdown represented by the captured logical block, not on visible text
fragments. Preserve whole-list context where Lute requires it. Apply the rewrapped source through
the normal Vditor spin/render path while restoring the caret and scroll position. The resulting
host sync must contain one coherent Markdown edit, and the automatic formatting must be a separate
undo step from the typing burst.

When Auto Wrap is enabled, live IR/WYSIWYG rendering must visually flow source soft newlines as
spaces while explicit hard breaks remain line breaks. The source-preserving soft-break identity from
Phase 0 must remain present through input spin, mode switches, `getValue()`, incremental IR
serialization, save, reopen, and external updates.

### Preview

Pass effective reflow (`autoWrap || reflowLineBreaks`) into Task 83's existing preview-reflow path.
Do not duplicate its hard-break marker recovery or preview render patch.

## Cancellation and error behavior

- A timer firing against a disposed/replaced editor is a no-op.
- A formatter classification failure, stale block identity, or unchanged result is a no-op and
  creates no undo entry or host edit.
- Unexpected formatter/apply failures go through the existing webview error-reporting boundary and
  leave the current document bytes untouched.
- Auto-wrap must not recursively schedule itself from its own programmatic input/render update.
- Rapid input produces at most one pending run per editor. Independent open editors own independent
  controllers and timers.

## Test-first implementation sequence

### 1. Dependency and Lute evidence

- [x] Confirm Task 273 is complete and its shared formatter passes prefix, Unicode-width,
      hard-break, idempotence, and caret-offset unit tests.
- [x] Add a failing real-Vditor harness matrix for IR/WYSIWYG soft versus explicit hard breaks,
      including render → spin → serialize and mode round-trips.
- [x] Run the matrix red against the current live-editor behavior and record the exact failing DOM
      or Markdown distinction.
- [x] Implement the smallest lossless soft-break identity path allowed by Phase 0.
- [x] Run the matrix green and verify byte-identical source round-trips.

### 2. Settings and shared config

- [x] Add failing manifest/config tests for defaults, numeric bounds, resource scope, property order,
      Line Wrapping group membership, and all cross-reference descriptions.
- [x] Add `autoWrap`, `autoWrapDelay`, and `wrapColumn` to the shared host/webview config contract;
      keep `reflowLineBreaks` as the existing Task 83 key.
- [x] Implement live config propagation and effective Preview reflow.
- [x] Verify disabling Auto Wrap cancels pending work and restores legacy live-editor rendering
      without remounting or losing caret/scroll.

### 3. Pure controller

- [x] Write fake-timer unit tests for trailing debounce, timer reset, delay update, disable/dispose,
      stale-target cancellation, no recursive scheduling, IME deferral, and independent editors.
- [x] Implement `auto-wrap.ts` to satisfy those tests without DOM-specific formatting logic.

### 4. Mode adapters and undo

- [x] Add SV tests proving range-only replacement, returned-caret restoration, exclusions, and one
      separate automatic undo step.
- [x] Add IR and WYSIWYG harness tests proving the same behavior through real Vditor, including
      nested list/blockquote prefixes and whole-list context.
- [x] Add hard-break and byte-fidelity assertions with Auto Wrap enabled through save/reopen and
      mode switches.
- [x] Implement mode adapters and connect them to the controller.

### 5. Real-VS-Code acceptance

- [x] Add `test/vscode-e2e/auto-wrap.spec.ts` using a real fixture, not injected editor DOM.
- [x] For SV, IR, and WYSIWYG, type prose past the configured column, poll past the configured idle
      condition, and assert source wrapping at word boundaries without another keypress.
- [x] In IR/WYSIWYG and Preview, assert soft physical newlines are visually flowed while explicit
      hard breaks remain visible.
- [x] Assert caret and scroll preservation, IME composition safety, save/reopen bytes, and the
      two-step undo contract: first undo removes only wrapping; second undo removes typing.
- [x] Use observable state and exact source bytes; do not add a blind settle sleep.

## Verification gates

Use current `DEVELOPMENT.md` as the command authority. At minimum run:

```bash
npm run lint:ci
npx vitest run --config test/vitest.config.ts
node build.mjs
npm run check:bundle-size
npm run check:startup-cost
npm run typecheck
npm run typecheck:strict
npm run typecheck:vscode-e2e
npm run test:coverage
npm run check:coverage-modules
xvfb-run -a npm --prefix media-src run test:e2e
env -u ELECTRON_RUN_AS_NODE xvfb-run -a npm --prefix test/vscode-e2e test -- auto-wrap.spec.ts
npm run quality
git diff --check
```

Inspect changed-line coverage for the formatter integration, controller branches, config
propagation, and Lute wrapper/patch. Report retries separately from clean passes. The feature is not
complete without a focused real-VS-Code pass in all three modes.

## Completed (2026-08-28)

- Reused Task 273's single pure formatter. Added the resource-scoped opt-in `autoWrap` setting,
  bounded delay, exact **Line Wrapping** group/order/cross-links, and effective Preview reflow
  `autoWrap || reflowLineBreaks`.
- Phase 0 proved both Lute flag values initially preserve `<br>` only until the first serializer,
  which erases two-space/backslash syntax; spin then erases the `<br>` nodes. The accepted solution
  composes `live-line-breaks.ts` into the existing anchor-guarded `patchLuteHook` early callback.
  Hard breaks are always identity-tagged without changing disabled visuals; Auto Wrap additionally
  renders soft newlines as serializer-aware inline spaces. IR, WYSIWYG, and SV preserve exact bytes.
- Added the cancellable trailing-debounce controller with eligible-input filtering, IME deferral,
  delay/config/dispose cancellation, stale editor/mode/selection/content validation, and recursive
  scheduling suppression. Ordinary paste/drop/delete/Enter/format/history events never auto-wrap.
- Connected all three modes to the shared transaction. SV splices the minimal source diff in place
  (the untouched tail DOM identity is regression-tested); IR/WYSIWYG use Vditor's normal render path.
  Caret, scroll, one coherent host edit, and separate typing/format undo checkpoints are preserved.
- Live enable/disable rerenders through the already-wrapped Lute without remounting, cancels pending
  work, preserves bytes, and restores Task 83's standalone Preview-only behavior when disabled.

### Verification

- Focused unit/config/router suites pass; focused changed-line coverage reports 100% lines for
  `auto-wrap.ts` and `live-line-breaks.ts`, and 96.94% for the shared formatter.
- Exact-final full Chromium coverage: 486 passed, 5 intentional skips, 0 retries; 73.36% aggregate
  e2e line coverage. The live-break wrapper reached 97.83% and the command adapter 82.24% in the
  browser report.
- Exact-final focused real VS Code: `auto-wrap.spec.ts` + `rewrap.spec.ts` pass 2/2 without retries;
  all three modes, effective Preview flow, explicit hard breaks, live disable/re-enable, stale-mode
  cancellation, IME deferral, range-local SV DOM, caret/scroll, save/reopen, and two-step undo are
  asserted.
- Exact-final `npm run test:vscode:fast`: 59/59 pass in 8.6 minutes, no retries.
- `node build.mjs`, all three typechecks, module-manifest totality, `git diff --check`, bundle and
  startup gates pass. Final measured budgets: 481 KB / 482 KB and 272 / 272 eager modules; both
  small deliberate ceiling changes are documented in their gate scripts and no engine leaked.
- Exact-final `npm run quality`: pass — lint, knip, jscpd, dependency-cruiser, root/webview audits
  (0 vulnerabilities), 2,999 unit coverage tests, and the zero-coverage-module ratchet. The isolated
  VS Code harness audit also reports 0 vulnerabilities.

Retry accounting: Phase 0's four red cases were expected test-first failures. During real-VS-Code
spec development, automatic retries repeated only harness/assertion failures: two non-scrollable
fixture versions, several pre-typing scroll-baseline variants, and one whole-document hard-break
selector. Each was root-caused and corrected; no product assertion was accepted via retry. Every
final focused, full Chromium, and FAST run passed cleanly with zero retries.

## Out of scope

- Whole-document automatic reformatting.
- Auto-wrapping paste/drop or previously existing untouched paragraphs.
- Comment-aware wrapping inside code or raw HTML.
- Mid-word hyphenation or language-aware hyphenation dictionaries.
- A ruler UI or per-language/per-file-pattern wrap columns.
- Rebuilding/forking Lute without separate Project Owner authorization.

## Completion checklist

- [x] Task 273 dependency complete and reused; no duplicate formatter exists.
- [x] Approved settings, defaults, bounds, effective reflow, and Line Wrapping grouping implemented.
- [x] Lossless soft-break identity survives IR/WYSIWYG render, spin, serialize, mode switch, save,
      and reopen; explicit hard breaks stay visible.
- [x] Trailing debounce, IME, cancellation, exclusions, and recursion guards verified.
- [x] SV, IR, and WYSIWYG wrap at the configured column with preserved caret/scroll.
- [x] Auto-wrap is a separate undo step from typing in every supported mode.
- [x] Unit, Chromium, focused real-VS-Code, coverage, build, budget, typecheck, audit, and quality
      gates pass.
- [x] Task record is marked complete, moved to `tasks/done/`, and indexed in `tasks/README.md` only
      after implementation and verification are genuinely complete.
