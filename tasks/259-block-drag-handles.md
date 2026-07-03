# Task 259 — Block drag handles: reorder ANY block by mouse (Notion-style)

**Status:** planned · **Impact:** ⚪ low-med · **Depends:** shares task 222's engine · **Origin:** task 192 §10

## Problem

Only drags in the codebase are outline WIDTH-resize and Vditor's selected-text drag.
Task 222 reorders heading-sections via the OUTLINE only — there is no in-editor handle to
grab a paragraph/list/code fence/table and move it (the Notion staple).

## Scope

- [ ] Hover gutter handle (⋮⋮) on every top-level `data-block` node; HTML5 drag with a
      drop indicator line between blocks; drop = ONE model edit + one undo step.
- [ ] Generalize task 222's section-move engine from heading-sections to arbitrary block
      ranges — list items WITH children are the tricky case (drag the whole item subtree;
      pin the nesting rules).
- [ ] Modes: ir/wysiwyg v1 (sv is raw text — out); keyboard alternative = Alt+Up/Down
      block move (cheap, pairs with 244; same engine).
- [ ] Must not fight text-selection drag (handle-originated drags only) nor the diagram
      zoom gate.
- [ ] **Drop-cursor indicator** (added 2026-07-03, prosemirror-dropcursor parity): a 2px
      horizontal line at the exact target boundary while dragging — pure overlay from
      dragover→nearest-block-boundary; ALSO shown for OS-file image drops (the only drag
      that exists today, currently indicator-less).
- [ ] **Handle click-menu**: clicking (not dragging) the ⋮⋮ handle opens the task-298
      "turn into" menu + delete/duplicate — the Notion handle contract.

## Out of scope

- Cross-document drag, multi-block selection drag v1, Notion column layouts.

## Verification

L1: block-range move units (list subtrees, around tables/diagrams, doc edges).
L2: drag paragraph below code fence → `getValue()` exact, one edit post, one undo; Alt+Up/
Down parity. L3 real-VS-Code (mandatory): drag over the real pipeline + save fidelity.
