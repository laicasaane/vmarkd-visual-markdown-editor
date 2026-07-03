# Task 241 — BUG: merge-conflicted markdown renders garbage and saving corrupts the markers

**Status:** planned — BUG · **Impact:** 🟡 med (episodic but destructive) · **Origin:** task 192 §10 (probe-verified)

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

- [ ] **Cheapest robust fix first:** host-side detection of conflict markers on open
      (`^<{7} |^={7}$|^>{7} ` heuristic) → non-modal banner "This file has merge conflicts"
      + open in the plain TEXT editor (or read-only webview) until resolved. Zero
      serialization risk by construction.
- [ ] Evaluate the richer option: `SetGitConflict(true)` + styled ours/theirs block —
      ONLY if the IR round-trip of that node proves byte-stable first (Node-Lute probe
      gate); otherwise record the rejection here.
- [ ] Re-check after resolve: file watcher clears the banner when markers disappear.

## Out of scope

- An in-editor conflict-resolution UI (accept ours/theirs) — VS Code's merge editor owns
  that; we only need to not destroy the file.

## Verification

L1: marker-detection unit (false positives: `=======` as setext under a real heading is
LEGAL markdown — detector needs the full `<<<<<<<`/`=======`/`>>>>>>>` triple). L3: open a
conflicted fixture → banner shown, text editor opened, file bytes untouched.
