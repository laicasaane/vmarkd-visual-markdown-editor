# Task 535 — Make editor helpers consume mutation-local impact

**Status:** planned · **Impact:** 🔴 high on structurally rich documents ·
**Origin:** Task 534 private/generated large-document investigation ·
**Depends on:** Task 532 complete · **Blocks:** Task 536

## Goal

Make recurring editor helper work proportional to the block(s) actually changed. Preserve each
helper's current ordering and lifecycle; share a conservative mutation-impact classifier rather than
building Task 176's rejected central dispatcher.

## Confirmed problem

On the private 586-block / 4,789-node IR document, eight ordinary Backspaces produced about 4,176
mutation records while their eight required Lute block spins cost only about 8–10 ms total. Immediate
renderer blocking remained hundreds of milliseconds. The recurring selector leaders were:

- section-fold clear/reapply attributes;
- diagram preview/engine scans used by zoom, controls, retheme/cache helpers; and
- responsive-table normalization.

Task 173 already localizes the synchronous callout/code-source/html-comment decorators through
`media-src/src/editing/mutation-scope.ts`. Task 532 independently localized marker reconciliation.
The remaining helpers still discard mutation locality or schedule a full-root pass.

## Architecture

Extend the existing pure mutation-scope seam; do not centralize observer execution. The classifier
returns a conservative impact object such as:

```ts
interface EditorMutationImpact {
  full: boolean
  blocks: ReadonlySet<HTMLElement>
  structural: boolean
  modeRebuild: boolean
}
```

Exact names are implementation-owned, but the contract is fixed:

- `blocks` are connected current top-level blocks resolved from added/changed nodes;
- `structural` means top-level order/count or heading/list/container ownership may have changed;
- `modeRebuild` identifies a fresh IR/WYS surface; and
- `full` is the fail-closed result for ambiguity, detachment, broad batches, external replacement,
  streaming/finalization, or a configurable block-count safety threshold.

`record.target === editor` must **not** imply a full walk. Task 173 proved ordinary Vditor
`blockElement.outerHTML = ...` and genuine whole-editor rebuilds share that target. Resolution keys
off the added/changed nodes and batch breadth, with `characterData` resolved through its containing
block.

## Consumer scope

### Section folding — `media-src/src/nav/section-fold.ts`

- Do not clear and reapply every fold attribute for ordinary non-structural text replacement.
- Reconcile the changed heading/list container when foldability can change.
- Recompute the whole fold projection for top-level structural changes, mode rebuild, restored fold
  state, or an ambiguous batch.
- Preserve automatic reveal, persisted identities/counts, gutter hit targets, and the current
  attribute-only serializer contract.

### Responsive tables — `media-src/src/chrome/responsive-tables.ts`

- Normalize only tables contained by changed blocks for mutation-driven updates.
- Window/container resize may still normalize every table because every width can genuinely change.
- An added whole surface or ambiguous batch uses the existing full fallback.

### Diagram helpers

Apply local impact to at least:

- `media-src/src/diagrams/diagram-zoom.ts`;
- `media-src/src/diagrams/diagram-controls.ts`; and
- the mutation-driven local-hit/report scans in `render-cache-client.ts` and custom diagram discovery
  where measurement proves they wake on unrelated block edits.

Decorate/report within changed preview/block scopes. A mode switch, full Preview replacement, theme
change, hoist exit, or engine-wide configuration change retains its current wider authority.

Do not fold theme-flip viewport gating, engine rendering, or controller behavior into this task.

## Implementation constraints

- Preserve the synchronous leading pass required by no-flash decorators; do not move it to rAF.
- Preserve per-observer disposers and current relative ordering in `runFinishInit()` /
  `installDiagramRuntime()`.
- Ignore only proven decoration-only records. A batch mixing decoration and real content must pass.
- Never retain detached DOM identities across a Vditor spin; resolve the live replacement block.
- Attribute-only helper writes must not recursively amplify the fleet. Disconnect/guard or filter
  only the helper's own known writes.
- Do not alter Vditor spin scope, Task 69 serialization, ToC generation (Task 536), or host writeback
  (Task 538).

## Test-first acceptance

### Unit

- Extend `mutation-scope.test.ts` for one-block replace, character data, multi-block structural
  batch, mode rebuild, detached/mixed/decoration-only records, and threshold fallback.
- Exercise each consumer through its real observer callback with deterministic rAF/debounce control;
  direct helper calls alone do not cover routing.
- Prove non-structural text leaves unrelated fold attributes/tables/diagram wrappers byte-identical.

### Chromium

Use real Vditor with a generic document containing many headings, nested lists, tables, ordinary code,
and multiple cached/custom/native diagrams. Instrument helper full/local passes and mutation records.
Prove:

- one-block prose/list/table Backspace triggers local passes only;
- heading/list split/merge and mode switch take the wider fallback;
- zoom/control/cache behavior survives async render and block replacement; and
- exact `getValue()`, selection, scroll, focus, and one-step undo remain correct.

### Real VS Code

Create one focused single-boot spec using `largeMixedMarkdown()` plus generic heading/list/table and
multi-engine stress blocks. Wait for render readiness, then exercise ordinary insertion and eight
stepwise Backspaces in list/table/inline content.

Primary gates:

- zero named-helper full-root scans on the ordinary one-block path;
- at least 75% fewer aggregate mutation records than the pinned pre-task count on the same sanitized
  journey; and
- every structural/mode fallback fires exactly when its oracle says it should.

Record median blocking over three local no-retry runs, but do not make a tight absolute timing the
correctness gate. Run focused coverage, typechecks, build/budgets, final quality, and the focused
real-VS-Code spec per current `DEVELOPMENT.md`.

## Out of scope

- A shared observer dispatcher or observer-instance-count optimization.
- ToC/outline parsing (Task 536), incremental serializer admission (Task 537), or host propagation
  (Task 538).
- Narrowing lists to one item, changing fold UX/state, re-rendering diagrams, or new settings.

## Completion checklist

- [ ] One shared pure classifier resolves local/structural/full impact conservatively.
- [ ] Section fold, mutation-driven table normalization, and measured diagram helpers use it.
- [ ] Ordinary block edits produce no named-helper full-root pass or helper-write amplification.
- [ ] Structural/mode/external fallbacks preserve all current behavior and exact Markdown.
- [ ] Unit, Chromium, coverage, focused real-VS-Code, typecheck, build/budgets, and final gates pass.
