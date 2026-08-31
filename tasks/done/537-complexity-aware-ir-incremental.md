# Task 537 — Admit complex IR documents incrementally without a first-edit freeze

**Status:** ✅ complete · **Impact:** 🔴 high for sub-700-block structurally rich documents ·
**Origin:** Task 534 Task-69 gate A/B · **Depends on:** Tasks 535 and 536 for final comparison

## Goal

Replace Task 69's fixed `>=700` top-level-block admission with a complexity-aware decision and seed
the exact incremental cache outside the first edit's critical path.

## Confirmed problem

`media-src/src/bridge/edit-sync-tuning.ts` enables incremental IR serialization only from 700
top-level blocks. The sanitized 2,000-line generator has about 915 blocks and exercises Task 69. The
tracked `test/vscode-e2e/fixtures/large-structured-synthetic.md` corpus has only 586 top-level blocks
but 4,789 descendant nodes, 336 list items, 504 inline
candidates, and a full IR snapshot of about 154–170 ms. It therefore takes the “small” full-serialize
path on every host sync.

During two 12-character insertion journeys the structured-fixture probe observed two edit-sync full
serializations after settle. Once mutation-driven blocking stretched event processing beyond the
250 ms pending-edit window, the trailing timer could resolve around later settle input and amplify
the delay.

A temporary `INCREMENTAL_MIN_BLOCKS=500` experiment proved Task 69 helps after initialization:

| Metric | stock 700 gate | temporary 500 gate |
|---|---:|---:|
| initial exact cache baseline | about 167 ms full snapshot | about 467 ms full + 586 block layouts |
| unchanged exact snapshot | about 150 ms | about 2.4 ms |
| second insertion host propagation | about 565 ms | about 362 ms |
| settled-edit full IR serializations | one or two | zero |

Lowering the constant is rejected because it moves a visible 467 ms pause onto initial cache
construction and block count alone still cannot model nested complexity.

## Architecture and spike gate

Phase 0 must compare these seed strategies on the tracked structured fixture and generated controls.
Record renderer longtasks, extension-host CPU time, readiness, first edit, unchanged snapshot,
memory, and byte fidelity.

### Candidate A — host canonical snapshot plus time-sliced block layout (recommended first)

Use the already shared vendored Lute in the extension host to produce canonical initial Markdown
outside the renderer. Pass it through the init payload only for documents whose cheap complexity
signature predicts incremental benefit. In the webview, construct Task 69's per-block range/layout
state in bounded batches after first paint, yielding between batches. The cache becomes ready only
after complete byte-equality validation.

### Candidate B — post-paint webview seed

Run the existing full reset after the editor is visible and idle, but split any separable per-block
layout work across frames. Kill this candidate if the unavoidable full Lute call creates a renderer
longtask above the acceptance budget or competes with diagram readiness.

### Candidate C — lazy first-sync seed with busy feedback

Keep construction on first required sync but yield a visible busy state first. This is the safe
fallback/control, not the preferred solution; it preserves correctness but does not meet the
first-edit responsiveness goal.

Choose A unless evidence proves host computation/message size or cross-realm canonical differences
make it unsafe. If no candidate meets the seed budget and exactness gate, close this task as a
measured no-change decision; do not ship a lower threshold alone.

## Complexity admission

Admission uses only cheap init-time facts already available or measured once before editing. Evaluate
a conservative deterministic score from:

- source character/line count;
- top-level block count;
- nested structural/editable node counts (lists/items/tables/inline-rich blocks); and
- IR serialized-DOM length if it can be acquired without a new recurring full read.

Calibrate against measured full-serialize cost, not one document. The classifier returns
incremental/ordinary plus a reason string for test/debug evidence. It must admit the tracked
fixture's aggregate shape and retain the cheap ordinary path for genuinely small documents.

Do not continuously time `getValue()` to decide admission: paying the slow operation is the problem.
Do not add a user threshold setting.

## Cache lifecycle and safety

- One authoritative cache per editor/mode lifecycle; Auto Wrap and Preview reuse Task 529's existing
  `snapshotMarkdown()` seam, never a second cache.
- External `setValue`, streaming, mode exit/re-entry, extension-driven exact edits, or detected drift
  invalidates/reseeds conservatively.
- Before readiness, snapshots fall back to current authoritative `getValue()`; pending seed state
  never supplies partial Markdown.
- Explicit save always performs the current full-authoritative audit. Drift posts/saves the full
  result, logs once, invalidates, and self-heals exactly as Task 69 does today.
- Preserve structural-window behavior and do not narrow top-level lists/containers.

## Test-first acceptance

### Unit/Node fuzz

- Complexity classifier matrix around small/simple, large-flat, nested-sub-700, and 700+ cases.
- Seed state machine: batches, cancellation, invalidation, stale owner/mode, error, retry, and disposal.
- Host/webview canonical equivalence across paragraphs, headings, nested/loose/ordered lists, tables,
  quotes, fences, refs/footnotes, HTML, callouts, wiki/code-reference decoration, and LF/CRLF.
- Retain Task 69's 4,000-edit fuzz with zero drift/fallback for valid edit sequences.

### Chromium

- A complex sub-700-block generated document is admitted; unchanged snapshot uses zero full Lute
  serializations after readiness.
- Edit/split/merge/paste/undo/mode/external update keep incremental == full `getValue()`.
- Seed never exposes partial data and cancels cleanly on re-init/disposal.

### Real VS Code

One focused single-boot comparison covering a small control, the existing 2,000-line generator, and
`test/vscode-e2e/fixtures/large-structured-synthetic.md`. Primary gates:

- complex sub-700 document is admitted for a recorded structural reason;
- unchanged snapshot median <=10 ms after readiness;
- no cache-construction renderer longtask >50 ms after the editable surface is ready;
- the first user edit adds no cache-construction pause >50 ms;
- exact host/disk bytes, save audit, undo/redo, Auto Wrap, Preview entry/reuse, mode switch, and
  save/reopen pass.

Run three local no-retry timing samples for claims, then focused coverage, typechecks, build/budgets,
quality, and the focused real-VS-Code spec per `DEVELOPMENT.md`.

## Out of scope

- WYSIWYG incremental serialization (Task 167), SV streaming (Task 188), Worker spin/Lute fork,
  changed Task-69 window semantics, or host writeback optimization (Task 538).
- A lower fixed constant, user setting, automatic SV switch, or duplicated Auto Wrap/Preview cache.

## Completion checklist

- [x] Evidence selects a seed strategy or closes the task by its kill rule.
- [x] Complexity admission handles nested sub-700 documents without penalizing small controls.
- [x] Cache readiness/invalidation is single-sourced and never exposes partial/stale Markdown.
- [x] Unchanged/first-edit budgets and exact authoritative save/fuzz gates pass.
- [x] Unit/fuzz, Chromium, coverage, focused real-VS-Code, and final gates pass.

## Completion evidence

- Candidate A shipped: the extension host creates one Lute-canonical seed only for cheap
  source-signature candidates, while the webview measures the mounted IR structure and lays out
  block ranges atomically in bounded post-paint batches. Small controls do not load host Lute or
  scan their mounted DOM for a seed.
- The shared classifier admits the tracked 586-block structured fixture for `nested-structure`,
  retains Task 69's `>=700` block route, and leaves ordinary documents on `getValue()`. External
  updates and exact IR transactions replace stale ownership with a new seed; user input,
  disposal, mode changes, streaming, and drift invalidate conservatively. Pure mode-transition
  callbacks rebaseline without posting mode-canonicalized bytes to the host.
- Task 69's seed state is atomic and cancellable, and its 4,000-edit deterministic fuzz remains
  byte-exact. The focused unit set passed 150/150 after final review; the module-boundary gate
  passed 7/7, including the deliberate narrow `session->lute` host edge.
- The final Chromium suite passed 6/6, covering ordinary and 700-block gates, edit/split/merge,
  invalidation, sub-700 atomic seeding, external reseeding, partial-state fallback, and cancellation.
- Three final serialized real-VS-Code runs against
  `test/vscode-e2e/fixtures/large-structured-synthetic.md` passed with `--retries=0`. Snapshot
  medians were 1.6/1.5/1.9 ms; maximum seed batches were 6.5/13.0/7.8 ms; all runs recorded zero
  seed-attributed long tasks. The cache-specific first edit was one small-block Lute call under
  50 ms. Exact host/disk bytes, undo/redo, Auto Wrap snapshot reuse, Preview reuse, external update,
  IR/WYSIWYG switching, save audit, and save/reopen passed.
- The final build is 594.4 decimal KB. Explicit budgets pass at 595 KB, 288 eager modules, and
  29.5/34 KB largest eager module; `main.meta.json` shows only the shared classifier and edit-sync
  product glue, with no renderer/dependency leak.
- The final frozen quality run passed lint, duplication, dependency rules, audits, 249 files / 3,636
  tests, the zero-coverage-module ratchet, and coverage at 76.45% statements / 68.96% branches /
  79.42% functions / 78.45% lines. Its sole failure is the pre-existing Knip report for unlisted
  `yazl` in `test/backend/package-local-preview-core.test.ts`. The routine real-VS-Code tier remains
  deferred to Task 534's final combined candidate.
