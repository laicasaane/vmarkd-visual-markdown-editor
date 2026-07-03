# Task 222 — Outline: drag headings to restructure the document

**Status:** planned · **Impact:** ⚪ low · **Origin:** task 192 §5

## Problem

Both outline surfaces navigate only: the webview panel's drag is width-resize
(`outline-resize.ts`) and the explorer tree has no `DragAndDropController`
(`src/outline-tree.ts`). Moving a section means manual cut/paste of its whole subtree.

## Scope

- [ ] Section-move engine (the real work, shared by both surfaces): given heading H, its
      section = H + content up to the next heading of level ≤ H's; move before/after
      another section as ONE model edit + ONE undo step. Edge cases: front-matter stays
      first, trailing section, setext headings, headings inside code fences (source-map
      knows real blocks — reuse it).
- [ ] Explorer tree: `TreeDragAndDropController` wiring → WorkspaceEdit/model edit through
      the session.
- [ ] Webview panel: HTML5 drag on outline items with a drop indicator; same engine via a
      message.
- [ ] Optional guard: level-preserving move only in v1 (no promote/demote on drop).

## Out of scope

- Drag BETWEEN documents, promote/demote by horizontal drop position, multi-select drag.

## Verification

- L1: section-move engine unit — the full edge-case matrix above (this is where the value
  is; be exhaustive).
- L2: webview panel drag → document text reordered, `getValue()` exact, caret/scroll sane,
  one undo restores.
- L3 real-VS-Code (mandatory): tree-view controller invoked directly (`handleDrag`/
  `handleDrop` — native DnD isn't drivable), document persisted correctly after save.
