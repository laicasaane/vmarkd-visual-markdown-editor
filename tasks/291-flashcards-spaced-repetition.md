# Task 291 — Flashcards / spaced repetition over markdown (design-first)

**Status:** planned — DESIGN-FIRST · **Impact:** 🟡 med (PKM/learning persona) · **Origin:** task 192 §12 (SiYuan/Logseq lineage)

## What it is & the effect

SiYuan (built-in, FSRS scheduler) and Logseq (`#card` + cloze) let any note block become a
flashcard reviewed on a spaced-repetition schedule — study material lives IN your notes,
not in a separate Anki deck. Obsidian's Spaced Repetition plugin proves the same works
**file-based**, with zero database: card markers in the text, scheduling state in a
trailing HTML comment.

**Today in vMarkd:** nothing — the only wholly-untasked large feature of the block-editor
family. **After:** a student/self-learner marks lines as cards while taking notes
(`#flashcard`, `Q::A`, cloze via `==mark==`), hits "Review due cards", and a side panel
quizzes them with our own renderer (math/diagrams/code in cards for free); tomorrow's due
set is computed by the scheduler. Notes stay plain markdown readable everywhere.

## Scope

- [ ] **Design phase first:** adopt the Obsidian-SR-compatible format (proven, portable):
      card = `#flashcard`-tagged block or `Q::A` line; cloze = `==masked==` (task 225's
      mark syntax); scheduling state = trailing `<!--SR:!2026-07-10,4,270-->` comment.
      Decide: comment-in-file (SR-compatible, syncs with the vault) vs workspace sidecar
      (cleaner files) — lean comment for interop, verify the IR round-trip of trailing
      comments first (comments already render invisible; pin byte-stability).
- [ ] Host: card extraction in the wiki-cache scan (tags 205 machinery helps); scheduler =
      SM-2 first (simple, SR-compatible), FSRS later.
- [ ] Review UI: a webview side panel rendering the card front/back through the EXISTING
      render pipeline; grade buttons (Again/Hard/Good/Easy) rewrite the SR comment via
      WorkspaceEdit.
- [ ] Commands: `Review due cards` (workspace / current doc), due-count in the status bar
      (optional, quiet).

## Out of scope

- Anki import/export v1, media-only cards beyond what the renderer gives, FSRS optimizer,
  per-deck settings beyond folder scoping.

## Verification

L1 (the bulk): marker/cloze parser, SR-comment round-trip byte-stability, SM-2 scheduler
matrix. L2: cloze masking renders in the panel; grading rewrites exactly the comment.
L3 real-VS-Code (mandatory): fixture vault → review session end-to-end, files on disk
carry updated SR comments, docs still render normally in the editor.
