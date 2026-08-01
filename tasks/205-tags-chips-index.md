# Task 205 — Tags: `#tag` chips + workspace index

**Status:** planned · **Impact:** 🟡 med · **Origin:** task 192 §3

## Problem

`#tags` typed in a note stay plain text — no renderer, no index, no panel (grep → 0).
Obsidian/Logseq users expect chip rendering and click-to-list-tagged-notes.

## Scope

- [ ] Tokenizer: `#tag` (word chars, `/` for nesting, `-_`), only when preceded by
      start/whitespace and NOT inside code/math/links/headings-as-`#`/front-matter — the
      false-positive matrix is the hard part; unit-pin it exhaustively. Gate the whole
      feature behind `vmarkd.tags.enabled` (default off — `#` collisions are real in
      technical docs).
- [ ] Webview: render as a chip (the `custom-renderer.ts` wiki-chip pattern —
      Lute-invisible `data-render` span; serialization round-trips the plain `#tag` text;
      wire the serializer like `wiki-serialize.ts`).
- [ ] Host: tag index in the wiki scan (tag → files+counts); front-matter `tags:` counted
      too once task 207 lands (note the dependency, don't block). The index is also a
      building block for the task-105 dataview epic — keep its shape queryable.
- [ ] Click → quick-pick of notes carrying the tag (the `onListWikiPages` pattern,
      `extension.ts:727-752`); optional later: a Tags tree view.

## Out of scope

- Tag renaming/refactor, tag autocomplete hint (`#` hint — note as follow-up), styling
  per-tag colours.

## Verification

- L1: tokenizer unit — the full false-positive matrix (code, urls, `# heading`, w mid-word,
  front-matter) + nested tags.
- L2: chip renders in ir/wysiwyg/preview, round-trip byte-stable, edit-adjacent typing
  doesn't corrupt (the wiki-chip test patterns).
- L3 real-VS-Code (mandatory): chips over the real pipeline + click → quick-pick lists the
  tagged fixture files.
