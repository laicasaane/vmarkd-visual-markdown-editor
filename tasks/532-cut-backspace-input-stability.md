# 532 — Restore cut and Backspace input stability

> **Status:** planned · **Impact:** 🔴 high (core destructive editing is unreliable) ·
> **Origin:** Project Owner report and exact-VSIX real-VS-Code A/B diagnosis, 2026-08-31 ·
> **Regressions of:** [Task 286](done/286-caret-marker-reveal.md) and
> [Task 293](done/293-undo-boundaries.md)

## 1. Goal

Restore ordinary destructive editing in Instant Rendering mode after the Task 294→528 queue:

- `Ctrl+X` must remove exactly the live non-collapsed selection, put that selection on the clipboard,
  reach the host document, and remain one undo step; and
- Backspace must delete predictably without whole-document marker scans, avoid programmatic selection
  rewrites on the ordinary edit path, and keep the caret at the deletion point instead of racing to
  another Markdown/DOM position.

Preserve Task 286's selection-driven Home/End/PageUp marker reveal and Task 293's command-boundary
semantics everywhere they are valid. This is a root-cause repair, not a rollback of either task.

## 2. Confirmed regression and evidence

### 2.1 Diagnostic boundary

The Project Owner supplied two packaged controls and one private, ignored 2,252-line / 94,711-byte
Markdown document:

| artifact | SHA-256 | result |
|---|---|---|
| `vmde-1.5.1-preview.vsix` | `e419ca7f153aa4c0af7a27983c9edde3dc0a50feec6663b24a132850cee0d096` | good control |
| `vmde-1.5.3-preview.vsix` | `bfa8ecd8eb468cc1bade6b6a57c5f75a7bf399e6d300bd16f37ef4bf63dc66f4` | reproduces failed cut and unstable deletion path |

The private document was copied only within ignored `tmp/` for diagnosis. **Never commit that file,
its contents, excerpts, distinctive terms, or a derived fixture.** Durable tests must use the existing
sanitized `test/vscode-e2e/large-mixed-markdown.ts` generator plus generic alpha/lorem-style unique
tokens. The original diagnostic file's hash remained unchanged after every probe.

The A/B probe ran each extracted VSIX in VS Code 1.129.0 with real keyboard input. Auto Wrap and
Preview Reflow were both off. The Project Owner's remaining active configuration was reproduced:

```json
{
  "vmde.editor.codeLineNumbers": true,
  "vmde.editor.headingColors": true,
  "vmde.editor.fontSize": "16",
  "vmde.theme.code": "github-dark-dimmed",
  "vmde.editor.fullWidth": false,
  "vmde.theme.content": "material-dark",
  "vmde.editor.wrapColumn": 120,
  "vmde.diagram.mermaid.layout": "elk",
  "vmde.editor.modifierClickLinks": false,
  "vmde.editor.autoWrapDelay": 500,
  "vmde.editor.autoWrap": false,
  "vmde.preview.reflowLineBreaks": false
}
```

The reported legacy key `vmde.theme.highlightHeadings` is no longer registered after Task 489's
clean-break settings rename; `vmde.editor.headingColors` is its current equivalent and was used in
the controlled run. Task 532 does not add a compatibility alias or otherwise change that decision.

### 2.2 Cut failure — reproduced and isolated

The same exact 29-character IR range was selected before one real `Ctrl+X` in both artifacts:

- **1.5.1:** the range remained non-collapsed through the `cut` event; the selected Markdown was
  removed and the caret collapsed at the deletion point afterward.
- **1.5.3:** the range was still correct at the `x` keydown, then collapsed roughly 0.3 seconds
  later, immediately before the `cut` event. The cut handler therefore received an empty caret and
  the selected Markdown remained.
- **1.5.3 with one diagnostic substitution:** temporarily replacing only
  `inner.undo.addToUndoStack` until the first `cut` event kept the same range alive through the
  event and restored exact-range deletion. The original method was restored in the capture-phase
  `cut` listener before Vditor's cut handler ran, so the successful deletion still exercised the
  real cut pipeline.

Root cause: `media-src/src/editing/undo-boundaries.ts` includes `x` in `MODEL_COMMAND_KEYS`. Its
capture-phase keydown handler calls `boundary()` before the browser/VS Code clipboard bridge emits
the asynchronous `cut`. The scheduled pre-action checkpoint runs Vditor's selection-mutating undo
snapshot path and collapses the live range before cut can consume it. The dedicated Task 387 cut
pipeline already creates the correct undo state; the generic command-boundary owner is both
redundant and destructive here.

### 2.3 Backspace latency and caret instability — mechanism confirmed

Task 286 changed IR marker reveal from Vditor's Arrow-only keyup path to a controller on every
`selectionchange`. The current controller:

1. scans the entire editor for expanded nodes;
2. calls Vditor's `expandMarker()`, which scans the entire editor again and calls
   `setSelectionFocus(range)` when it resolves an IR node; and
3. scans the entire editor a third time, then may restore/collapse classes after the dwell.

On the supplied large document, 1.5.3 emitted an extra programmatic `selectionchange` after inline
code Backspace that the 1.5.1 control did not. The repeated selection write is observable even when
the final caret happens to land correctly; against Vditor's synchronous block rebuild it creates the
reported race in which a stale/re-normalized range can win and move the caret. The three global scans
also put document-size work on every deletion.

The visible jump was intermittent and did not occur on every automated keypress. Acceptance must
therefore gate the mechanism—not merely sample one final caret: the recurring edit path must not call
stock selection-writing `expandMarker()`, must not perform whole-editor expanded-node queries, and
must retain a stable caret/source-offset sequence under repeated real Backspace.

## 3. Product contract

### 3.1 Cut

- A non-collapsed selection present at `Ctrl+X` keydown remains the cut range until Vditor's cut
  handler consumes it.
- Cut copies and removes exactly that range; surrounding Markdown bytes are unchanged.
- The edit reaches the host `TextDocument`, persists after save/reopen, and one Undo restores the
  pre-cut document byte-for-byte.
- Collapsed line-cut, IR/WYSIWYG/SV behavior, multi-block boundary merging, clipboard payloads, and
  Task 387's synchronous delete/input re-drive remain unchanged.
- `Ctrl+X` has one undo owner. Do not replace the removed generic boundary with a second pre-cut
  checkpoint or delay the native cut.

### 3.2 Backspace and marker reveal

- One ordinary Backspace deletes one intended source character and leaves the caret at the
  corresponding deletion point. Repeated Backspace produces a monotonic one-character source/caret
  sequence with no block, list-item, table-cell, or document jump.
- Editing inside an already visible inline marker/source remains editing; it is not reclassified as
  navigation into a previously hidden delimiter.
- Recurring selection-driven marker work is local to the previous/current inline candidates. It
  must not query the whole editor for `.vditor-ir__node--expand` on each selection change.
- Ordinary input must not call Vditor's selection-writing `expandMarker()` or otherwise invoke
  `Selection.removeAllRanges()` / `addRange()` merely to toggle marker visibility.
- Home, End, PageUp/PageDown, arrow traversal, pointer entry, programmatic caret moves, marker dwell,
  composition deferral, and hidden-delimiter normalization retain Task 286's behavior.
- A genuine navigation landing inside a newly revealed hidden delimiter may still use the central
  caret authority for one-shot normalization. A content edit inside a marker that was already
  visible may not.
- Preserve exact Markdown, focus, scroll, incremental serialization, host sync, save/reopen, and
  undo/redo. Auto Wrap and Preview Reflow remain independent and are not part of this fix.

## 4. Implementation constraints

Expected implementation surface:

- `media-src/src/editing/undo-boundaries.ts` and `.test.ts` — remove cut from the generic model-command
  boundary classification and pin clipboard/history exclusions;
- `media-src/src/editing/editor-caret.ts` and a new focused
  `media-src/src/editing/editor-caret.test.ts` — make marker target discovery and class
  reconciliation local, preserve the dwell set explicitly, distinguish navigation from authored
  input, and avoid stock selection writes on recurring edit changes;
- `media-src/e2e/marker-reveal.spec.ts` and/or the focused clipboard harness — add RED browser
  regressions for visible-marker Backspace, selection-write counts, local marker work, and exact cut;
- create `test/vscode-e2e/cut-backspace-stability.spec.ts` — one real-VS-Code boot covering exact
  selection cut, clipboard, host bytes, undo, and repeated Backspace against a generated large mixed
  document; and
- reuse `test/vscode-e2e/large-mixed-markdown.ts`; append only generic unique blocks required for
  this journey. Do not add the private document or another large committed fixture.

Do not patch generated `media/dist`, edit vendored Lute, add a setting/command/dependency, weaken the
Task 286 navigation matrix, or add a compatibility read for the old heading-setting key.

## 5. Test-first acceptance

> **For implementation agents:** use `superpowers:test-driven-development` before production
> changes, `superpowers:systematic-debugging` for unexpected behavior, and
> `superpowers:verification-before-completion` before commits or completion claims. Apply the
> repository's `vmde-lute-features`, `vmde-testing`, and `vmde-visual-debugging` skills.

### 5.1 Unit and source-level coverage

Write and run RED tests before production changes. Cover:

- `Ctrl+X` is not a generic undo-boundary command; Task 293's format/table/Enter boundaries remain;
- copy, paste, undo, redo, and collapsed/non-collapsed cut classification do not gain duplicate
  checkpoints;
- marker target resolution for inside, before, and after strong/link/code nodes without an
  editor-wide query;
- same-node motion, cross-node motion, dwell expiry, detached/rebuilt nodes, pointer entry, hidden
  marker navigation, and composition end;
- `beforeinput` editing inside an already expanded marker preserves the live range;
- ordinary plain/list/table Backspace performs no selection write from the marker controller;
- Home/End/Page navigation still normalizes a caret newly landed inside a hidden delimiter; and
- disposal cancels frames/dwell and removes every new listener.

Inspect changed-line coverage for every cut-classification, marker-target, edit/navigation,
composition, detachment, and cleanup branch.

### 5.2 Chromium acceptance

Use only sanitized generated content. Prove with real Vditor and real browser selection behavior:

- one non-collapsed IR `Ctrl+X` keeps the range alive until the cut handler, copies the expected
  generic token, removes it exactly, and leaves adjacent text intact;
- repeated Backspace in plain list prose, table content, and already-expanded inline code deletes
  exactly one character per press and keeps the caret in the same authored block;
- the marker controller causes no extra programmatic selection cycle after ordinary Backspace and
  performs no full-editor expanded-node scan;
- Home/End/PageUp and pointer marker editing retain the complete Task 286 matrix; and
- canonical `getValue()`, focus, scroll, and one-step undo remain correct.

### 5.3 Real-VS-Code acceptance

Create one focused spec and one VS Code `test()` using `largeMixedMarkdown()` plus generic unique
cut/backspace blocks. Configure the exact matrix from §2.1. Wait for editor readiness and every
generated Mermaid block before interacting.

Within the single boot:

1. create an exact non-collapsed range in IR, prove it is still non-collapsed at the real `cut`
   event, press `Ctrl+X` exactly once, and poll the clipboard/host document for the exact removal;
2. Undo once and prove the complete host document is byte-identical to its pre-cut state;
3. place the caret in generic plain list prose and issue a burst of real Backspace keys, asserting
   one-character source/caret decrements and stable block identity after every key;
4. repeat at an already-expanded generic inline-code source boundary and in a table cell;
5. assert no marker-controller selection rewrite or whole-editor expanded-node scan occurs on the
   ordinary deletion path; and
6. save, close, reopen, and prove the final bytes and caret-bearing block remain correct.

Run the final focused spec with `--retries=0`. Wall-clock timings may be recorded for comparison,
but the gates are mechanism and correctness: no pre-cut collapse, no global marker scan, no
programmatic edit-path selection rewrite, exact bytes, and stable caret offsets.

## 6. Completion and verification

Use current `DEVELOPMENT.md` as command authority. During iteration, run only the smallest focused
unit/Chromium/real-VS-Code tests; build once after source inputs stabilize.

```bash
npx vitest run --config test/vitest.config.ts \
  media-src/src/editing/undo-boundaries.test.ts \
  media-src/src/editing/editor-caret.test.ts
node build.mjs
npm run check:bundle-size
npm run check:startup-cost
npm run typecheck
npm run typecheck:strict
npm run typecheck:vscode-e2e
xvfb-run -a npm --prefix media-src run test:e2e -- marker-reveal.spec.ts copy-cut.spec.ts
env -u ELECTRON_RUN_AS_NODE xvfb-run -a \
  npm --prefix test/vscode-e2e test -- cut-backspace-stability.spec.ts --retries=0
npm run quality
git diff --check
```

- [ ] Non-collapsed `Ctrl+X` reaches cut with its exact live range and removes only that range.
- [ ] Cut clipboard, host writeback, save/reopen, and one-step byte-exact undo pass.
- [ ] Repeated Backspace preserves block/caret identity and deletes exactly one source character.
- [ ] Ordinary deletion performs no marker-controller selection write or whole-editor marker scan.
- [ ] Task 286 navigation/dwell/composition behavior remains green.
- [ ] IR, WYSIWYG, and SV clipboard/editing regressions remain green.
- [ ] The private diagnostic document and its contents are absent from tracked and staged files.
- [ ] Focused unit, Chromium, no-retry real-VS-Code, typecheck, budget, coverage, and quality gates
      pass with retries/residuals recorded honestly.
