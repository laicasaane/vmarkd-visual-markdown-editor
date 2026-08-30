# Task 258 — Section folding in the editor (fold a heading's subtree)

**Status:** DONE 2026-08-31 · **Impact:** 🟡 med (long docs) · **Origin:** task 192 §10

## Problem

Typora/Obsidian/Notion all fold sections; VMDE's only answer to long docs is the outline
panel. No folding exists anywhere (grep ours + vendored Vditor → 0; task 206's fold is
callout-only, 222 is drag-reorder).

## Scope

- [x] Chevron affordance on heading hover (gutter — the 35px gutter is the natural home);
      section = heading + blocks to the next ≤-level heading (task 222's section engine —
      SHARED, build once).
- [x] Hide via a CSS class on member blocks (attribute-only, zero text mutation →
      round-trip safe by construction); folded heading shows a count hint ("… 12 blocks").
- [x] Auto-unfold when: the caret moves into the folded range (arrow-nav/selectionchange),
      a find match lands inside, or an anchor/outline navigation targets it.
- [x] Persist fold state per doc in webview state (survives tab switch; NOT in the file).
- [x] Keyboard: fold/unfold at caret via command + chord (coordinate with 244's
      key-capture work).

## Phase 2 (added 2026-07-03): list-item (bullet) folding

- [x] Outliner-family parity (Logseq/SiYuan fold any bullet): chevron on list items that
      have child lists, fold = hide the nested `<ul/ol>` subtree; persist collapse state
      per doc in workspaceState (NOT in the file — SiYuan's IAL-persisted fold is the
      block-DB way; ours belongs in editor state). Costlier than heading folding: the
      list DOM is re-spun on edit, so collapse state must be re-asserted via
      MutationObserver (the callouts pattern). Only pays off for deeply nested notes —
      phase 2, not core.
- NOTE: task 289 (section hoisting) SHARES this task's section-range engine — build the
  engine once, first consumer wins.

## Out of scope

- Fold-all/level-N presets v1 (trivial follow-up), folding non-heading blocks other than
  the phase-2 bullets (details = 257), remembering folds across machines.

## Verification

L1: section-range unit (reuse 222's tests). L2: fold hides blocks + `getValue()` untouched,
caret-enter unfolds, edit inside neighbour keeps folds, undo/redo unaffected. L3
real-VS-Code (mandatory): fold + scroll + mode switch round-trip; serialization fidelity.

## Implementation

- `nav/section-fold.ts` consumes the shared Task 289 section-range primitive and applies only
  serializer-invisible attributes to heading members and nested list subtrees. CSS supplies the
  gutter chevrons and folded-block count without injecting editor content.
- Heading identity and nested-list paths are stored per document in webview state and VS Code
  `workspaceState`; the controller reapplies them after mode switches and Vditor DOM replacement.
- Selection changes, find matches, outline/anchor navigation, and source-line reveal all open the
  containing fold before targeting it. `vmde.toggleSectionFold` and the platform fold chord toggle
  the section at the caret.

## Verification evidence

- Focused Vitest: 9/9 section folding/range tests passed; the final focused cross-layer set passed
  149/149 tests. Full coverage passed 233 files / 3,408 tests; the zero-coverage ratchet stayed
  15/15.
- `node build.mjs`: passed. Bundle/startup gates passed at 540/542 KB, 276/276 eager modules, and
  29.4/34 KB for the largest eager module; lazy-engine budgets were unchanged.
- Focused Chromium `section-fold.spec.ts --retries=0`: 4/4 passed, covering gutter activation,
  exact Markdown, auto-unfold, mode/DOM rebuild, and nested-list persistence.
- Focused real VS Code `section-fold.spec.ts --retries=0`: 1/1 passed (7.3 s test), covering the
  command chord, WYSIWYG rebuild, close/reopen persistence, source reveal, list folding, exact host
  value, and disk fidelity. An earlier candidate retained persisted WYSIWYG mode while the test
  waited only for IR; the final locator accepts the active edit surface and passed without retries.
- The final quality stages passed after permitting the sandbox-required npm audit and child-process
  fixtures. `knip` retains the unrelated baseline `yazl` finding in
  `test/backend/package-local-preview-core.test.ts`; all audits found zero applicable
  vulnerabilities. Per the queue's minimal-test policy, no full Chromium, FAST, or full real-VS-Code
  suite was rerun.
