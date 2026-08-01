# Task 292 — Void-block interaction model: gap cursor + node selection

**Status:** planned · **Impact:** 🟡 med (closes a whole bug class) · **Origin:** task 192 §12 (ProseMirror patterns)

## What it is & the effect

Two ProseMirror-ecosystem inventions for blocks that contain no editable text (rendered
diagrams, `<hr>`, tables-as-blocks, images):

1. **Gap cursor** (`prosemirror-gapcursor`, in every Tiptap starter): a visible caret
   position at boundaries where no text position exists — before a document that STARTS
   with a table/diagram, between two adjacent rendered blocks, after a trailing one.
2. **Node selection** (PM `NodeSelection`, Lexical equivalent): click a void block's
   edge → the whole node is visually selected; Backspace deletes it cleanly, arrows step
   over it, Ctrl+C copies its markdown source.

**Today in vMarkd:** we have POINT fixes only — the transient gap paragraph after code
fences (`gap-paragraph.ts`) and hr step-across (`hr-nav.ts`); a doc starting with a
diagram is un-clickable-above, deleting a diagram means entering its source and deleting
text, and each new void-block edge case becomes its own bug (the task-100 class).
**After:** every void boundary is reachable by click/arrows, and a rendered block can be
selected/deleted/copied as a UNIT — one general mechanism instead of per-block patches.

## Scope

- [ ] **Inventory first:** all void/render block types (hr, 18 diagram families, tables,
      block images, thematic breaks) × boundary positions — the matrix IS the spec.
- [ ] Gap cursor = generalize the PROVEN transient-`<p>` mechanism (self-cleaning, so
      nothing ever leaks into saved markdown — better fit than PM's fake selection): on
      click/Arrow at a void boundary with no adjacent text block, spawn it; reclaim on
      caret-leave (existing observeGapParagraphs machinery, new triggers).
- [ ] Node selection: click on the rendered surface's padding/edge (NOT the interactive
      diagram area — respect the Ctrl-zoom gate) → overlay selection ring on the block;
      Backspace/Delete removes the block (one model edit), Ctrl+C copies its markdown
      source (the IR copy path), arrows exit to gap cursor / neighbours, Esc deselects
      (fits task 288's ladder).
- [ ] Supersedes future one-off nav bugs: fold the hr-nav behaviours into the general
      matrix (keep hr-nav.ts until parity is proven, then retire).

## Out of scope

- Multi-node selection (task 259's drag covers moving; 288 covers block→doc), cut/paste
  of node selections beyond copy+delete.

## Verification

L1: boundary-matrix unit over block-type fixtures. L2: the full click/arrow/delete/copy
matrix per family representative (hr, mermaid, table, image); `getValue()` exact after
each op; transient p never serializes (existing gap nets extend). L3 real-VS-Code
(mandatory): doc-leading diagram click + delete + undo journey.
