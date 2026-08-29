# Task 276 — Extract selection → new note (leave a `[[link]]` behind)

**Status:** planned · **Impact:** 🟡 med (PKM refactor; kortina class, ~99K installs) · **Origin:** task 192 §11

## Problem

The note-refactor primitive — cut a grown section out into its own note and link it —
doesn't exist (kortina's `newNoteFromSelection` is its proven shape). `createWikiPage`
(src/wiki.ts:102-113) is the natural creation hook but nothing drives it from a selection.

## Scope

- [ ] Command `VMDE: Extract selection to new note` (palette + task-215 context menu):
      webview posts the selection's markdown (serialize via the copy path — the exact
      markdown, not rendered text) + range; host prompts for a title (default = first
      heading/line of the selection), creates the note through the task-209 template path
      (ONE code path with wiki create-on-click), opens it beside.
- [ ] The webview replaces the selection with `[[Note Title]]` as ONE model edit (single
      undo restores both the text and — host-side — offers to delete the created file? NO:
      keep it simple, undo restores the TEXT only; the note file stays, note it in the
      toast).
- [ ] Heading handling: extracting a section starting with `## H` → the new note gets it
      promoted to `# H` (level normalize, setting-gated).
- [ ] Name collision → the existing ambiguity/picker flow from wiki create.

## Out of scope

- Extract-to-EXISTING note (append), moving attachments/images referenced by the
  selection (v2 — note it), reverse operation (inline-back; embeds 204 cover viewing).

## Verification

L1: title derivation + heading-normalize units. L2: selection → posted markdown exact
(reuses the P0-1 copy contracts), replacement chip renders, one undo restores text.
L3 real-VS-Code (mandatory): full journey — select across blocks → command → new file on
disk with template + content, source doc saved with the link, backlink appears once 201
lands (assert file content only for now).
