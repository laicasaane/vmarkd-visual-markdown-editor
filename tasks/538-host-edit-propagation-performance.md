# Task 538 — Attribute and reduce the host edit-propagation tail

**Status:** 🚧 in progress (instrument-first) · **Impact:** 🔴 high when host sync exceeds edit debounce ·
**Origin:** Task 534 structured-fixture propagation measurement · **Depends on:** Task 537

## Goal

Attribute the complete webview-edit → host `TextDocument` latency, then optimize only the measured
dominant stage while preserving minimal-diff bytes, dirty state, undo-to-clean, and external-edit
correctness.

## Confirmed boundary

After Task 532, structured-fixture journeys still took about 1.17–1.38 s from the end of an edit burst to a
new host `TextDocument.version`. Temporarily admitting the document to Task 69 eliminated webview
full IR serializations but did not materially reduce Backspace propagation. Therefore the remaining
tail is not safely attributable from renderer counters alone.

The 94,711-byte document is below `WritebackController.MINDIFF_CAP` (100,000), so it is eligible for
block-level minimal-diff matching and deferred semantic-no-op work. The same document-change event
also refreshes image references, schedules Git diff/gutters, refreshes status/outline state, and
participates in echo suppression. These are candidates, not assumed causes.

## Phase 0 — stage instrumentation

Add test/debug-only correlated timing around one edit generation/request ID. Attribute at least:

### Webview

- pending-edit quiet wait and actual callback start;
- `snapshotMarkdown` / incremental update / full fallback;
- `postMessage` construction and payload size; and
- duplicate schedules/callbacks for one logical burst.

### Extension host writeback

- message receipt/queue delay;
- `WritebackController.syncToEditor` equality check;
- `minimalDiffWriteback`, original-block cache hits/misses, and per-block host Lute reserialize;
- explicit-block handling and deferred semantic-no-op work;
- `WorkspaceEdit` construction and `vscode.workspace.applyEdit` await; and
- echo-state completion/document version.

### Document-change followers

- `document.getText()` acquisition;
- `ImageAssetWatcher.refresh` extraction/path comparison;
- Git diff scheduling, HEAD lookup, diff compute, and `diff-info` post;
- host Markdown Outline/status refresh; and
- webview gutter mapping/render if a tracked-file control enables it.

Use monotonic timestamps in each process and report durations local to that clock; do not compare raw
renderer and extension-host clock origins. Correlate with a generated request ID carried only in
debug/test instrumentation. Production default behavior must emit no perf telemetry or source text.

## Decision gate

Run the same journeys on:

- a small tracked Markdown control;
- a generic complex sub-700-block runtime fixture;
- the existing 2,000-line mixed generator; and
- `test/vscode-e2e/fixtures/large-structured-synthetic.md`.

Use at least three no-retry samples per scenario on one built candidate with no concurrent
real-VS-Code run. Proceed to optimization only when one stage or coherent stage family accounts for
at least 30% of the post-debounce tail or >=150 ms median. If no stage meets that gate, close as a
measured no-change result and retain only cheap test instrumentation that materially improves future
diagnosis.

## Candidate remedies (choose from evidence, do not bundle)

### Minimal-diff/cache dominated

Maintain source-block/canonical caches across edits and recompute only changed structural windows,
or move cold baseline preparation off the first write. Preserve the clean disk baseline and exact
per-block fallback. Do not reuse webview DOM ranges as host source authority.

### `WorkspaceEdit` dominated

Use the smallest already-proven ranged edit from minimal-diff output instead of a full-document
replacement, but only if version/race/echo handling stays atomic and tests prove identical dirty and
undo behavior.

### Document followers dominated

Consume `TextDocumentContentChangeEvent.contentChanges` or cached indexes for the specific expensive
follower. Keep full rebuild on external/broad/ambiguous changes. Do not create one general host AST
unless multiple measured consumers justify it.

### Duplicate webview callbacks dominated

Unify logical-burst generation ownership so settle input cannot create a second full host post after
the first callback has begun. Preserve immediate save flush and the final latest-content guarantee.

Only the winning family enters this task's implementation diff. File a separate task for any second
independent opportunity instead of expanding scope.

## Correctness constraints

- Preserve the clean-baseline contract: untouched source bytes remain untouched and undo-to-open can
  clear the dirty state.
- A failed/conflicting `applyEdit` never advances echo/last-synced state or loses the webview edit.
- Explicit save, autosave, menu/command save, close-with-save, external edits, file rename, and
  concurrent extension edits retain current behavior.
- Git gutters, image replacement refresh, outline/status updates, and host/webview echo suppression
  remain correct even when their internal scan is made incremental.
- No source contents or payloads in production logs; fixture paths may appear only in test output.
- Do not weaken Task 537's full-authoritative save audit or change Markdown normalization semantics.

## Test-first acceptance

### Unit

- Stage-timer/correlation aggregation including overlapping, cancelled, failed, duplicate, and stale
  generations.
- RED/GREEN coverage for the selected dominant-stage optimization and every conservative fallback.
- Existing minimal-diff, semantic-noop, git-diff, image watcher, EditorSession, DocSync, and
  writeback-controller tests stay green.

### Real VS Code

One focused single-boot generated journey must exercise insertion, Backspace in list/table/inline
content, save, undo-to-clean, external replacement, and tracked-file gutter refresh. Assert source
bytes/disk/dirty/version outcomes outside instrumentation.

Performance acceptance after the decision gate:

- >=40% median reduction in the attributed dominant stage; and
- target median host propagation <=600 ms for the tracked structured-fixture journey, or a documented
  evidence-backed platform floor if the chosen stage passes its reduction but another independent
  stage becomes dominant.

Do not hide a missed target by increasing debounce. Report every stage before/after and any
unattributed remainder. Run focused no-retry samples, unit/coverage, host typecheck/build, final
quality, and focused real-VS-Code acceptance per current `DEVELOPMENT.md`.

## Out of scope

- Webview mutation/ToC work (Tasks 535/536), serializer admission (Task 537), Git algorithm redesign
  without measured dominance, telemetry, new settings, or a general persistent Markdown AST.
- Multiple independent optimizations in one implementation diff.

## Completion checklist

- [ ] Correlated stage evidence attributes the post-debounce tail across required scenarios.
- [ ] One stage meets the decision gate, or the task closes honestly as no-change.
- [ ] Only the measured dominant stage family is optimized with conservative fallbacks.
- [ ] Propagation/stage target, bytes, dirty, undo, save, external-edit, gutter/image/outline nets pass.
- [ ] Unit/coverage, typecheck/build, focused real-VS-Code, and final gates pass.
