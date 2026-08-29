# Task 252 — Book compile: flatten `![[embeds]]`/includes at export

**Status:** planned · **Impact:** 🟡 med (book-length docs) · **Depends:** 204 (embeds), pairs with 53 · **Origin:** task 192 §10

## Problem

Once task 204 lands, a master doc of chapter embeds can be VIEWED — but nothing compiles
it into one deliverable: embeds are data-render containers, so task 53's `getHTML()` export
would drop or double-serialize them. No flatten/merge story exists (grep → nothing).

## Scope

- [ ] Command `VMDE: Merge to single markdown` + an "flattened" option on task 53's
      export: host-side recursive resolve of `![[note]]` (reuse 204's wiki-cache
      resolution + cycle guard verbatim), producing one markdown/HTML artifact.
- [ ] Correctness details: heading-level offset per embed depth (chapter H1 → H2 under a
      book H1 — setting-gated), asset/link path rewriting relative to the output doc,
      footnote/reference-def de-duplication (rename colliding ids — pin the scheme).
- [ ] Pure host/Node work over the lute-host prerender — fully L1-testable.

## Out of scope

- Code-snippet includes (task 230 renders live; at flatten time they inline naturally via
  the same resolver — verify, don't re-implement), TOC generation for the merged doc
  (task 253's command works on the output), partial/selective compile.

## Verification

L1 (the bulk): resolver units — nesting, cycles, heading offset, path rewrite, footnote
collisions, missing target → marked gap in output. L3: one journey — master doc with two
chapter embeds → merged markdown on disk correct end-to-end.
