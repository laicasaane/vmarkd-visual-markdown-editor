# 488 — Rethink the undo algorithm: semantic checkpoints instead of a fixed 800 ms timer

Status: **not started — analysis / design only.** Deliberately NOT implemented; this file records the
problem and the questions to answer before anyone writes code.

Raised by the user while closing [487](done/487-structural-caret-position-for-undo-restore.md):
undo should checkpoint *smartly* — per word, per meaningful edit boundary — not on a blind timer.

## What we have today

Vditor's `Undo` (`media-src/node_modules/vditor/src/ts/undo/index.ts`) pushes an undo checkpoint on a
**debounce of `undoDelay` (default 800 ms) after the last input**, and each checkpoint is a diff of
the whole document plus a caret snapshot (`addCaret`). VMDE patches only the caret half of it
(`patchUndoCaretSplitRestore`, tasks 445 / 487) — the *when* is untouched upstream behaviour.

Consequences worth naming:

- **Checkpoint boundaries are wall-clock, not semantic.** Type fast and a whole sentence collapses
  into one undo step; pause mid-word and the word is split across two. The same edit undoes
  differently depending on typing speed, which is why undo here feels unpredictable rather than wrong.
- **It fires on a timer nobody asked for.** 800 ms after *every* edit, a full-document diff plus a
  caret capture-and-restore runs. Task 486's user-visible bug (caret snapping back after Enter) was
  only observable *because* this fires unprompted; the caret half is fixed, but the underlying "do
  work 800 ms after the user stops" design is what surfaced it.
- **Cost scales with document size, not edit size** — a whole-document diff per checkpoint. See
  [[prose-typing-lag-vditor-rebuild-reflow]] for the neighbouring known cost on large documents;
  whether checkpointing contributes measurably has NOT been measured.

## What "smart" should probably mean

The prior art (VS Code / CodeMirror / ProseMirror all converge here) is: coalesce consecutive edits
into one undo step while they stay *the same kind of edit in the same place*, and force a boundary
when any of these changes:

- **Word / token boundary** — typing crosses whitespace or punctuation
- **Edit kind flips** — insert → delete, typing → paste, typing → formatting command
- **Caret discontinuity** — the caret jumps somewhere not adjacent to the previous edit
- **Structural change** — Enter/new block, list promotion, block-type change
- **A real timeout, as a backstop only** — not as the primary rule

Design questions to settle *before* implementing:

1. **Patch vs. wrap.** Does this replace Vditor's `Undo` or wrap it? Replacing means owning undo
   entirely (large diff against upstream, our esbuild patches already carry drift risk — the anchors
   in `esbuild-shared.mjs` throw on version drift, and this would multiply them). Wrapping means
   driving `addToUndoStack` from our own boundary detector and neutralising the timer, which is a much
   smaller surface. **Wrapping is the assumed default until someone shows it can't work.**
2. **Where do boundaries get detected?** `beforeinput` gives `inputType` (`insertText`,
   `deleteContentBackward`, `insertFromPaste`, `insertParagraph`, …) — that alone covers "edit kind
   flips" and "structural change" cleanly, and is already the event the caret authority listens to for
   invalidation (ADR-0007). Word boundaries need the inserted character; caret discontinuity needs
   comparison against the previous edit's position.
3. **Does the diff cost need addressing too, or only the granularity?** Measure first — this task is
   about *when* checkpoints happen, and conflating it with *how* they're stored will sink it.
4. **What does redo do?** Currently symmetric with undo; any boundary change must keep it symmetric or
   redo starts landing in surprising places.
5. **Interaction with 487's structural caret.** Each checkpoint carries a caret position; more
   checkpoints means more caret capture/restore, so 487's correctness is a prerequisite, not optional.

## Checklist (design phase)

- [ ] Read Vditor's `Undo` end to end and write down exactly what `addToUndoStack` / `undo` / `redo`
      do, including the caret path — no summarising from memory
- [ ] Decide patch-vs-wrap with a concrete sketch of the wrap, including how the 800 ms timer gets
      neutralised without forking the class
- [ ] Measure the current checkpoint cost on a large document (the audit fixture used in 486 is a
      reasonable one) — is the whole-document diff actually a problem, or only the granularity?
- [ ] Write the boundary rules as a table (trigger → new checkpoint yes/no) and get it reviewed
      BEFORE any code
- [ ] Sketch the position-mapping layer on top of the already-bundled diff-match-patch (see above),
      and confirm it is the same primitive `caret-preserve.ts` would need to drop `{ textOffset }`
- [ ] Only then: open an implementation task with a test plan (unit tests for the boundary detector;
      real-VS-Code e2e for "type a sentence, undo once, get the whole sentence back")

## The position-mapping layer — and why `{textOffset}` disappears with THIS task, not before

Semantic checkpoints need to know where a position *moved to* after each change, not just where it
was. That is a **position-mapping** layer: take a position in the old document, push it through the
changes, get the position in the new one. It is the standard piece every serious editor has
(CodeMirror's `ChangeSet.mapPos`, ProseMirror's `Mapping`) and VMDE currently has none.

This is also the thing that unblocks retiring `{ textOffset }` from
[487](done/487-structural-caret-position-for-undo-restore.md)'s `CaretIntent`. Today `{ textOffset }`
survives in exactly one production caller — `caret-preserve.ts`'s `preserveCaretAndScroll`, restoring
the caret after a `setValue()` rebuild caused by an EXTERNAL document change (git pull, another
editor, someone else's format-on-save). It is kept there on purpose, not by neglect:

- `{ blockPath }` breaks **discontinuously** under that rebuild — one paragraph inserted above the
  caret shifts every index by one and the caret lands in an unrelated block. A path is only exact
  while the tree is the same, and here it is by definition not.
- `{ textOffset }` degrades **smoothly** — exact for changes below the caret, off by the length of
  the change for those above. Wrong, but adjacent rather than arbitrary, which is the right trade for
  a rare best-effort restore.

So swapping one address for the other is not an improvement; **mapping the position through the diff
is**. With mapping in place, a structural address becomes viable there too and `{ textOffset }` (plus
task 486's `nextEmptyBlockSibling` heuristic, which exists only to paper over it) can go.

### Lead: diff-match-patch is ALREADY in the bundle

`esbuild-shared.mjs` carries `patchDmpInterop` — a patch to Vditor's own diff-match-patch usage,
which it needs for undo. **The diff engine is already shipped and already wired into this exact
subsystem**; what is missing is only the layer that maps a position through a computed diff, not the
diff itself. Start there before considering any new dependency.

## Explicitly out of scope here

No implementation. No changes to `esbuild-shared.mjs`. Removing `{ textOffset }` is NOT a separate
task to be picked up on its own — see the section above for why it is a by-product of this one. This file exists to stop the design being
improvised inside an unrelated bugfix.
