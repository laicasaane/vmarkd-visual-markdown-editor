# Task 229 — Clickable code references (`src/foo.ts:123`)

**Status:** planned · **Impact:** 🟡 med (dev, daily in tech docs) · **Origin:** task 192 §9

## Problem

Code references like `src/edit-sync.ts:42` — the bread and butter of design docs, reviews
and incident notes — are inert text. Devs expect click → the file opens in the TEXT editor
at that line (the convention every terminal/linkifier follows).

## Scope

- [ ] Tokenizer: workspace-relative path + `:line[:col]` in prose AND inside inline code
      (`` `src/foo.ts:42` `` is how people actually write them — for inline code add the
      click affordance without altering the rendered text).
- [ ] Resolution: validate against the workspace host-side (new small message or reuse the
      wiki page-list cache pattern); unresolved paths stay plain (no dead-link chips).
- [ ] Click (policy-consistent: Ctrl+click by default) → host `showTextDocument` with a
      `selection` at line/col — the plain text-editor path, NOT the custom editor (that
      direction is task 52's reveal-line).
- [ ] Rendering: subtle affordance (underline-on-hover), Lute-invisible decoration
      (`data-render` span in prose; attribute-only for inline code — no DOM injection
      inside `<code>`, see the wysiwyg-highlight pattern).

## Out of scope

- Symbol links (`foo#myFunction`), permalink generation, cross-repo paths, hover preview
  of the target lines (possible later via the task-230 fetch wire).

## Verification

- L1: tokenizer unit (path shapes, `:line:col`, windows separators, guards: URLs,
  full-line fences).
- L2: prose + inline-code affordance render, round-trip byte-stable, Ctrl+click posts the
  open request with line/col.
- L3 real-VS-Code (mandatory): Ctrl+click → text editor opens at the exact line
  (`activeTextEditor.selection` asserted via `evaluateInVSCode`).
