# Task 520 — Rewrap every paragraph in the document

> **Status:** ⏸️ BLOCKED — approved 2026-08-28; implement after task 519 closes.
> **Impact:** 🟡 medium — document-wide, Markdown-aware formatting command.
> **Depends on:** task 273 (complete) and task 519 (the command and product identifiers below use
> its canonical `vmde` namespace).

## 1. Problem.

Task 273 added `Rewrap Paragraph/Selection`, but reformatting a document still requires selecting
the entire file or invoking the command paragraph by paragraph. Add an explicit command that
rewraps every eligible paragraph in the active Markdown document, regardless of the current caret
or selection, while retaining task 273's Markdown-safety guarantees.

## 2. User-visible contract.

- Add `vmde.rewrapDocument`, titled `Rewrap Document`, to the command palette and the Visual
  Markdown Editor webview context menu. Show it only for the active `vmde.editor` custom editor.
- Do not change `vmde.rewrap`, its `Rewrap Paragraph/Selection` title, or its Alt+Q behavior.
- Do not assign a default keyboard shortcut to the document-wide command.
- Use the existing resource-scoped `vmde.editor.wrapColumn` value. Do not add another setting or a
  separate document-wrap column.
- Run in SV, IR, and WYSIWYG. The current selection determines only the logical caret that must be
  restored; it never limits the document command's formatting scope.
- If no eligible paragraph changes, finish as a silent no-op without adding an undo checkpoint or
  scheduling a host writeback.

## 3. Formatting and transaction requirements.

- Reuse task 273's Markdown-aware formatter. Rewrap every eligible prose, list, blockquote, and
  callout paragraph from byte offset `0` through the end of the document.
- Preserve task 273's prefix handling, Unicode display-width accounting, word-boundary behavior,
  long-word behavior, explicit two-space and backslash hard breaks, newline convention, and
  idempotence.
- Continue to leave fenced code and diagrams, front matter, tables, math, and every other
  formatter-excluded block byte-identical. Blank-line paragraph boundaries remain boundaries; do
  not merge separate paragraphs into one flow.
- Apply all changed paragraphs as one editor transaction. Do not loop through paragraphs with one
  `setValue`, undo checkpoint, host sync, or asynchronous render cycle per paragraph.
- Preserve the logical caret, editor scroll position, active mode, and focus. A changed document
  creates exactly one undo step, and one undo restores the complete pre-command Markdown.
- Keep the host writeback coherent with the existing minimal-diff pipeline. The command may produce
  one contiguous changed span from the first changed paragraph through the last, but must not emit
  a series of independently observable partial-document states.
- Reuse the existing command error path and fail closed: serialization or caret-marker ambiguity
  must leave the original Markdown in place and must not leak a private marker into the document.

The expected implementation shape is a second host/webview command routed through the existing
rewrap modules:

- `package.json`: declare and place `vmde.rewrapDocument` without changing the existing binding.
- `src/app/commands.ts` and `src/shared/protocol.ts`: forward one `rewrap-document` message.
- `media-src/src/bridge/message-router.ts` and `media-src/src/boot/main.ts`: route the new action
  through injected dependencies.
- `media-src/src/editing/rewrap-command.ts`: share task 273's mode mapping and transaction, replacing
  only the requested range with the whole-document range.
- `media-src/src/editing/rewrap-markdown.ts`: change only if a full-range formatter defect is proven;
  do not fork a second wrapping engine.

Follow the final names and identity constants produced by task 519 if its implementation adjusts
how command IDs are centralized. Prefer that authority over duplicating string literals from this
task.

## 4. Out of scope.

- Auto-format on save, format-on-open, or document-wide wrapping while typing.
- A new wrap-column setting, per-language columns, ruler inference, or workspace-wide formatting.
- Rewrapping code comments, tables, math, diagram source, front matter, or other excluded blocks.
- Changing the existing paragraph/selection command, Alt+Q, automatic line wrapping, or live line
  break rendering.
- Formatting unopened files, multiple tabs, folders, or the workspace.

## 5. Verification.

Use the VMDE testing skill and the exact commands in `DEVELOPMENT.md`. Build from the repository
root before Chromium or real-VS-Code tests.

### 5.1. Unit and host wiring.

- Extend `media-src/src/editing/rewrap-markdown.test.ts` with a whole-range document containing
  several separated paragraphs, nested list/quote prefixes, explicit hard breaks, Unicode, a long
  word, and protected blocks. Assert every eligible paragraph changes, protected bytes do not,
  the final paragraph is included with and without a trailing newline, and a second pass is
  byte-identical.
- Extend `media-src/src/editing/rewrap-command.test.ts` to prove document scope ignores a smaller
  current selection, maps the caret, performs one apply/sync transaction, creates no transaction on
  a no-op, and restores the original bytes when application fails.
- Extend the manifest, registered-command, protocol/router, and configuration tests to prove the
  new command ID, title, menu visibility, absence of a default keybinding, one host message, and
  reuse of `vmde.editor.wrapColumn`.
- Run focused coverage and confirm every new executable line is covered; do not accept only a
  whole-file percentage.

### 5.2. Chromium webview behavior.

Extend the rewrap harness/spec with a realistic mixed document in each of SV, IR, and WYSIWYG:

- place the caret inside one middle paragraph and invoke the document action without selecting the
  document;
- assert eligible paragraphs before and after the caret are rewrapped;
- assert fences, tables, math/front matter, explicit hard breaks, and paragraph boundaries retain
  their expected bytes and semantics;
- assert caret, scroll, active mode, one host sync, and one-step undo;
- assert an already-normalized document is a no-op; and
- assert no rewrap marker remains in Markdown or rendered DOM.

### 5.3. Real-VS-Code acceptance.

Extend `test/vscode-e2e/rewrap.spec.ts` or add one focused adjacent spec that executes
`vmde.rewrapDocument` through `vscode.commands.executeCommand`. In SV, IR, and WYSIWYG, prove the
real host-to-webview route reformats multiple eligible paragraphs across the entire on-disk
document while preserving excluded content, logical caret, scroll, and one-step undo. Assert the
document reaches the extension host once as the complete final value; a Chromium-only result does
not satisfy this acceptance item.

## 6. Completion checklist.

- [ ] Task 519 is closed and all implementation uses its canonical identifiers.
- [ ] `Rewrap Document` is discoverable and the existing paragraph/selection command is unchanged.
- [ ] All eligible paragraphs are rewrapped in one transaction in SV, IR, and WYSIWYG.
- [ ] Excluded Markdown, hard breaks, caret, scroll, focus, mode, and one-step undo are preserved.
- [ ] Unit, focused coverage, Chromium, and focused real-VS-Code acceptance pass.
- [ ] Applicable type, build, bundle/startup, quality, and task-required gates pass with retries and
      residuals recorded honestly.
- [ ] The final diff excludes generated artifacts, `LOCAL_AGENT_TASK.md`, and unrelated changes.
- [ ] Move this file to `tasks/done/`, update `tasks/README.md`, and create the focused local commit
      only after every acceptance item is complete. Do not push.
