# Task 527 — Callout/alert authoring parity across source, IR, WYSIWYG, and toolbar

**Status:** planned · **Impact:** 🔴 high · **Origin:** Project Owner request, 2026-08-30

## Goal

Make VMDE feature-complete for creating and managing its existing Markdown callouts/alerts. A user
must be able to add, edit, change, and remove a callout through all of the authoring paths that VMDE
exposes:

1. direct Markdown source changes;
2. a contextual IR tool;
3. the contextual WYSIWYG tool; and
4. a first-class pinned-toolbar control available in every editable mode.

This task completes **authoring parity**, not syntax-dialect expansion. Task 106 already renders the
supported `[!TYPE]` blockquotes, and Task 179 already makes their IR source/body editable without
caret loss. The missing product layer is a coherent create/change/remove workflow: IR has no
contextual type/title tool, WYSIWYG can change an existing callout but cannot create/remove one, and
the pinned toolbar has no callout action.

## Current behavior and authority

- `media-src/src/editing/callouts.ts` owns the source marker parser, the IR/Preview dual-node
  decoration, the WYSIWYG title/marker decoration, and the existing WYSIWYG type/title controls.
- The saved Markdown remains the only persisted state. A callout is a blockquote whose first line is
  `[!TYPE]` plus an optional title; injected controls/previews never become document content.
- Directly typing, pasting, renaming, or deleting the marker already reclassifies the block. That
  source-driven behavior remains authoritative and must stay live.
- The current supported registry is GitHub's five alert types first (`note`, `tip`, `important`,
  `warning`, `caution`) plus VMDE's existing common callout types. This task exposes that existing
  registry; it does not add aliases, folding, or new dialects.

## Product contract

| Operation | Direct source | IR contextual tool | WYSIWYG contextual tool | Pinned toolbar |
|---|---|---|---|---|
| Add a callout | Type/paste a valid marker | Convert a plain blockquote | Convert a plain blockquote | Insert or convert in IR/WYSIWYG/SV |
| Edit body | Edit source/body directly | Edit body directly | Edit body directly | Not duplicated in the panel |
| Change type | Rewrite the marker | Type selector | Type selector | Type selector |
| Change title | Rewrite marker-line title | Optional title input | Optional title input | Optional title input |
| Remove callout | Delete the marker | Remove action | Remove action | Remove action |
| Observe source changes | Immediate reclassification | State refreshes from source | State refreshes from source | Current state/checkmark refreshes |

The toolbar is the universal **creation** path. Contextual IR/WYSIWYG tools are optimized for a
plain blockquote or an existing callout. They must not require Task 285's future selection bubble,
Task 259's future drag handle, or Task 215's future context menu.

## Interaction semantics

### Add or convert

- **Empty block:** insert `> [!NOTE]\n> ` and place the caret in the body.
- **Collapsed caret in an ordinary paragraph:** convert that whole block to a `NOTE` callout,
  preserving inline Markdown and placing the caret at the corresponding logical body position.
- **Non-empty selection within one supported prose block:** convert the selected/current block
  without losing its text; the structural action is one undo step.
- **Plain blockquote:** insert the marker as its first quoted line instead of wrapping it in a second
  blockquote.
- **Existing callout:** do not nest another callout. Open/pre-fill the controls and update only the
  requested marker fields.
- **Unsupported or ambiguous selection** (cross-block mixed structures, table, fenced/void block):
  disable the conversion and leave the document/selection unchanged. Do not guess or partially
  rewrite content.

### Change type or title

- Changing the type rewrites only `[!OLD]` to the selected supported type and preserves the optional
  fold suffix, title, body, quote spacing, and nested content bytes that are outside that marker.
- Changing the title rewrites only the marker-line title. An empty title restores the visual default
  derived from the type and leaves no trailing marker-line whitespace.
- Controls read their state from the current source each time they open and refresh when direct
  source edits or a mode switch change that source. There is no parallel UI state to reconcile.

### Remove

- The safe remove operation converts the callout to a normal blockquote by deleting only its marker
  line and preserving every body line, nested block, and inline byte that need not change.
- Converting the result to a paragraph is broader/lossier block-transform work and remains in Task
  298; it is not folded into the safe callout removal action.

### Transactions and focus

- Every toolbar/contextual action is one model transaction and one undo step.
- Preserve the logical selection/caret, editor focus, and scroll position. Opening a panel may focus
  a native control; applying or dismissing it returns focus to the originating block.
- No-op changes do not post an edit or create an undo entry.
- Escape dismisses the panel. Tab/Shift+Tab traverse its controls. The existing `Ctrl/Cmd+Enter`
  callout activation route must reach the contextual controls in both IR and WYSIWYG.

## Design

### 1. Shared callout model and actions

Extract the reusable authoring contract from `editing/callouts.ts` without changing the established
dual-node rendering behavior:

- one exported callout-type registry and marker parser/formatter;
- pure transforms for insert/convert, update type, update title, and remove;
- one mode-aware action layer that applies a transform through VMDE/Vditor's normal model pipeline,
  restores logical selection, and requests exactly one spin/edit transaction; and
- one source-derived context shape used by every control (`kind`, current type/title, supported
  action, disabled reason).

Do not implement three DOM-rewrite variants. IR uses `VditorIRDOM2Md`, WYSIWYG uses `VditorDOM2Md`,
and SV is raw text; adapters may locate the logical target differently, but all must call the same
pure Markdown operation and transaction contract.

### 2. Pinned toolbar control (required)

Add a custom `callout` item beside the existing `quote` item in
`media-src/src/chrome/toolbar.ts`. Its panel contains:

- a supported-type `<select>` with GitHub's five alert types first;
- an optional title `<input>`;
- a dynamic Insert / Convert / Apply action; and
- Remove Callout when the current target is already a callout.

The item is present in IR, WYSIWYG, and SV, disabled in Preview/read-only state, and carries the
toolbar current-state class when the caret target is a callout. It participates in the repository's
existing overflow system: add its cluster to `toolbar-overflow.ts`, extend the authored-item
completeness assertion, and make its submenu obey the shared dismissal, `aria-haspopup` /
`aria-expanded`, and roving-focus contracts. Add a VMDE-owned icon and localized accessible label;
do not claim or shadow a VS Code keybinding.

The toolbar must snapshot the editor range before focusing its panel and restore it before applying
an action, following the existing custom-link control's range discipline.

### 3. IR contextual tool

Add a callout-specific panel anchored to the current IR plain blockquote/callout rather than waiting
for the generic future bubble/handle/context-menu tasks. For an existing callout it exposes the same
type, title, and remove controls as the toolbar; for a plain blockquote it exposes Make Callout.

Any injected IR control is transient UI outside the editable source, `contenteditable=false`, and
explicitly Lute-invisible (`data-render="1"`/`"2"` as appropriate). Reapply it through the existing
scoped/idempotent callout lifecycle after Vditor spins a block. It must never become marker/body text,
change `serializeForHost()`, or steal a body-edit caret.

### 4. WYSIWYG contextual tool

Retain Vditor's `customWysiwygToolbar` integration, but make it an adapter over the shared controls
and actions. Existing callouts expose type, title, and remove. A plain blockquote exposes Make
Callout. The title/type controls gain explicit accessible names and use the same validation,
transaction, no-op, focus-return, and source-refresh behavior as the IR/toolbar surfaces.

### 5. Source and mode parity

- Manual source changes remain sufficient to add/change/remove a callout without using UI.
- SV shows raw Markdown; it does not gain fake rendered contextual chrome. The pinned toolbar still
  performs the same source transformation in SV.
- Switching SV ↔ IR ↔ WYSIWYG immediately reflects the canonical marker, type, title, body, and
  toolbar/contextual state.
- Preview remains read-only and only renders the resulting callout.

## Fidelity and safety invariants

- Existing valid callouts are byte-identical after merely opening/dismissing any tool.
- Injected tool DOM is absent from full `getValue()`, incremental `serializeForHost()`, clipboard
  Markdown, saved files, and mode-switch output.
- Full and incremental IR serialization agree after every action.
- A supported marker typed manually, a tool-generated marker, and a mode-switched marker produce the
  same callout model and controls.
- Unknown `[!TYPE]` markers retain the current raw-blockquote fallback; tools never silently coerce
  them.
- Preserve current caret-entry, arrow navigation, click-to-edit, source-on-focus, rewrap, paste,
  undo/redo, and scoped-observer behavior.

## Verification

### L1 — unit/DOM

- Table-driven pure transform matrix: empty block, paragraph, selection, plain quote, existing
  callout, custom title, marker whitespace, multi-paragraph quote, nested list/inline content,
  unsupported block, no-op, and remove.
- Registry/parser/formatter agreement: every exposed type parses and renders; unsupported values are
  rejected without mutation.
- Context-state derivation and one-transaction/no-op behavior.
- Shared control labels/state/actions; IR injected UI is Lute-invisible.
- Toolbar configuration: item order beside Quote, Preview disabled state, all-mode availability,
  overflow inventory/cluster, submenu ARIA, dismissal, and keyboard traversal.

Run changed-line coverage for every new/extracted module and confirm the task's branches are not in
the uncovered-line list.

### L2 — Chromium with real Vditor

- **Source-driven:** type/paste `[!NOTE]`, change it to `[!WARNING] Title`, remove the marker, and
  assert live classification plus exact Markdown in IR/WYSIWYG/SV.
- **Toolbar journey in each edit mode:** insert/convert → type body → change type/title → remove →
  undo/redo, asserting exact `getValue()`, caret/focus, and one-step transactions.
- **IR contextual journey:** plain quote → callout; existing callout type/title/remove; source/body
  editing remains caret-safe; tool DOM never serializes.
- **WYSIWYG contextual journey:** the equivalent native-control operations and source fidelity.
- Switch modes after each mutation and assert the next surface/tool derives the same state.
- Exercise narrow toolbar overflow/More, reopen/dismiss, current-state updates, keyboard entry,
  Escape return, and `showToolbar=false` without breaking contextual/source paths.

### L3 — real VS Code (mandatory)

After `node build.mjs`, add and run a focused real-webview spec using a real fixture:

1. create a callout through the pinned toolbar in IR;
2. edit its body directly;
3. change its type/title through the IR contextual tool;
4. switch to WYSIWYG and change it again through the WYSIWYG tool;
5. switch to SV and verify/edit the literal marker;
6. switch back to IR, remove it through the toolbar, undo, save, close, and reopen; and
7. assert exact on-disk Markdown, restored callout state, no injected DOM leakage, and no focus/caret
   regression.

Include a real toolbar-overflow leg at narrow width and a keyboard-only control-entry leg. Build
first and run under `env -u ELECTRON_RUN_AS_NODE xvfb-run -a`; Chromium evidence does not substitute
for this spec.

### Routine gates

- Focused unit tests and changed-line coverage while iterating.
- Focused Chromium specs and the focused real-VS-Code spec.
- `npm run lint:ci`, all applicable type checks, bundle/startup budgets, coverage/module ratchet, and
  `npm run quality` once on the final candidate, using `DEVELOPMENT.md` as the command authority.

## Ownership and overlap

- **Tasks 106/179/459/484:** shipped foundations and regressions; preserve them.
- **Task 221:** remains the generic snippets/hint-menu task. Its callout template is no longer the
  primary or required callout creation path; Task 527 owns first-class insertion.
- **Task 298:** remains the broad paragraph/heading/list/quote/fence transform matrix. It must reuse
  Task 527's callout transforms rather than implement a second callout conversion path.
- **Task 191 P1-11:** Task 527 owns the implementation plus real-VS-Code native-control coverage;
  Task 191 remains the audit/history reference.
- **Task 265:** Task 527 owns accessible names and keyboard behavior for controls it creates;
  Task 265 retains the broader editor/screen-reader program.
- **Tasks 206/231/257:** aliases/folding, `:::` admonitions, and `<details>` are separate syntax or
  compatibility work and are not acceptance dependencies here.
- **Tasks 215/259/285:** context menu, drag handle, and selection bubble may consume the shared
  action core later, but this task does not wait for or implement those broader surfaces.

## Completion checklist

- [ ] Direct source add/change/remove stays live and exact.
- [ ] Pinned toolbar can insert/convert/change/remove in IR, WYSIWYG, and SV.
- [ ] IR contextual tool can create from a plain quote and change/remove an existing callout.
- [ ] WYSIWYG contextual tool has the same plain-quote/existing-callout contract.
- [ ] All surfaces share one parser/registry/action core and derive state from Markdown.
- [ ] One action equals one undo step; no-op equals no edit.
- [ ] Caret, focus, scroll, mode-switch, save/reopen, and byte-fidelity invariants pass.
- [ ] Controls are labeled and keyboard-operable; toolbar overflow/dismissal behavior passes.
- [ ] Unit, changed-line coverage, focused Chromium, focused real-VS-Code, budgets, type checks, and
      final quality gates are recorded honestly.
- [ ] Task 527 is moved to `tasks/done/` and `tasks/README.md` is updated only after every acceptance
      item is complete.
