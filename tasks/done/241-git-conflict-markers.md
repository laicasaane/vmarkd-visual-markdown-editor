# Task 241 — BUG: merge-conflicted markdown renders garbage and saving corrupts the markers

**Status: ✅ DONE (2026-07-27).** Conflicted files are detected on open and handed to the plain text
editor. The richer `SetGitConflict` option is **rejected on evidence** — see below.

**Impact:** 🟡 med (episodic but destructive) · **Origin:** task 192 §10 (probe-verified)

## `SetGitConflict(true)` does not work — rejected, with the evidence

The task called it "a fix the bundled Lute already ships". The setter is there and it does parse the
markers, but Lute ships **no Vditor renderer** for the resulting node types. With the flag on,
`Md2VditorIRDOM` on the canonical conflict returns, literally:

```
not found render function for node [type=NodeGitConflict, Tokens=]not found render function for
node [type=NodeGitConflictOpenMarker, Tokens=<<<<<<< HEAD]…
```

`VditorIRDOM2Md` then writes that string into the document — so the "fix" replaces the whole file
with error text. `Md2VditorDOM` (WYSIWYG) behaves identically, and a spin makes it worse: the
`=======` inside the captured content grew to over 300 characters. Only `Md2HTML` has a renderer
(`<div class="language-git-conflict">`), and the editor does not use that path.

The byte-stability gate the task set for this option therefore fails outright, and option 1 is the
whole fix rather than a stopgap.

## What shipped

`src/git-conflict.ts` — `hasGitConflictMarkers`, a pure detector requiring the full ORDERED triple
(`<<<<<<<`, then `=======`, then `>>>>>>>`, each alone on its line, CRLF-tolerant, diff3
`|||||||` form included). `resolveCustomTextEditor` checks it BEFORE constructing the session —
there is no safe read-only middle ground while the serializer is in the loop — disposes the panel,
opens the file with the `default` editor, and shows a non-modal warning offering
**"Open in vMarkd anyway"** (per-session, per-file, so a false positive costs one click).

**One trade-off, stated rather than buried:** fenced code blocks are NOT skipped, so a markdown file
that *documents* a conflict inside a ``` fence is flagged. The alternative — skipping fences —
would miss a real conflict git wrote inside a fenced block, and a destroyed file costs more than
one click. Pinned by a test so the choice cannot be reversed by accident.

## Verification

- **Unit** (`test/backend/git-conflict.test.ts`, 15): real conflicts incl. CRLF/diff3/bare markers;
  and the false positives the task named — a setext `=======` heading, a 7-deep blockquote, the
  markers out of order, a divider of the wrong length, and the inline-in-prose form this very file
  uses.
- **e2e, real VS Code** (`git-conflict.spec.ts`): a conflicted file lands in the plain text editor
  with no vMarkd tab and **byte-identical on disk**; a clean document still opens in vMarkd.
  **Verified to fail without the detector** (the conflicted case goes red, the control stays green).

## Problem

Probe on `'<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature'`: the `=======` line turns
the block into a setext **H1**, `>` lines become 7-deep nested blockquotes, and one IR
round-trip mangles the markers (`=======` → `=========`; `>>>>>>> feature` explodes into a
staircase of `>>>>>>>`/`>>>>>>`/…) — after a save **git can no longer recognize the
conflict**. vMarkd is a custom editor for .md, so users land on conflicted files
accidentally. Bonus: the bundled Lute already ships an unused fix — `SetGitConflict(true)`
renders a `<div class="language-git-conflict">` block (probe-verified present in
`lute.min.js`).

## Scope

- [x] **Cheapest robust fix first:** host-side detection on open → notice + the plain TEXT editor.
      Zero serialization risk by construction.
- [x] Evaluate `SetGitConflict(true)` — probed and **REJECTED**; the byte-stability gate fails,
      because Lute has no Vditor renderer for those nodes. Evidence recorded above.
- [x] Re-check after resolve — **not** via a file watcher, which the transient notice made
      unnecessary: there is no persistent banner to clear, and the detector simply runs again the
      next time the file is opened. Noted rather than silently dropped.

## Out of scope

- An in-editor conflict-resolution UI (accept ours/theirs) — VS Code's merge editor owns
  that; we only need to not destroy the file.

## Verification

L1: marker-detection unit (false positives: `=======` as setext under a real heading is
LEGAL markdown — detector needs the full `<<<<<<<`/`=======`/`>>>>>>>` triple). L3: open a
conflicted fixture → banner shown, text editor opened, file bytes untouched.
