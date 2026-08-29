# Task 258 — Section folding in the editor (fold a heading's subtree)

**Status:** planned · **Impact:** 🟡 med (long docs) · **Origin:** task 192 §10

## Problem

Typora/Obsidian/Notion all fold sections; VMDE's only answer to long docs is the outline
panel. No folding exists anywhere (grep ours + vendored Vditor → 0; task 206's fold is
callout-only, 222 is drag-reorder).

## Scope

- [ ] Chevron affordance on heading hover (gutter — the 35px gutter is the natural home);
      section = heading + blocks to the next ≤-level heading (task 222's section engine —
      SHARED, build once).
- [ ] Hide via a CSS class on member blocks (attribute-only, zero text mutation →
      round-trip safe by construction); folded heading shows a count hint ("… 12 blocks").
- [ ] Auto-unfold when: the caret moves into the folded range (arrow-nav/selectionchange),
      a find match lands inside, or an anchor/outline navigation targets it.
- [ ] Persist fold state per doc in webview state (survives tab switch; NOT in the file).
- [ ] Keyboard: fold/unfold at caret via command + chord (coordinate with 244's
      key-capture work).

## Phase 2 (added 2026-07-03): list-item (bullet) folding

- [ ] Outliner-family parity (Logseq/SiYuan fold any bullet): chevron on list items that
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
