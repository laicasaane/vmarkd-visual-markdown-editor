# Task 201 — Wiki backlinks panel

**Status:** planned · **Impact:** 🔴 high · **Origin:** task 192 §3 (top PKM gap)

## Problem

No way to answer "what links to this note" — the #1 PKM expectation once wiki-links exist.
There is no reverse index anywhere: `WikiCache` maps key→URIs only (`src/wiki-cache.ts:10-11`).
The forward parser already exists (`extractWikiTargets`, `src/wiki-core.ts:63`), so the
reverse index is buildable from data we already scan.

## Scope

- [ ] Host: extend `WikiCache` with a reverse index (target-key → source URIs + link spans),
      built during the existing scan and updated incrementally by the existing watcher +
      on save.
- [ ] UI: a **Backlinks** tree view (pattern: `src/outline-tree.ts`) listing linking docs
      for the active markdown document, one child per occurrence (line preview), click →
      open the linking doc (at that line once task 52's reveal-line lands; file-level
      until then).
- [ ] Count also plain relative-md links (`[x](./note.md)`) if cheap — the parser sees the
      text anyway; else scope to `[[wiki]]` v1 and note it.
- [ ] Refresh on active-editor change + cache updates; empty-state message.

## Out of scope

- Unlinked mentions (task 211, depends on this), graph view (task 208), webview-side panel
  (native tree view is the right surface).

## Verification

- L1 backend: reverse-index unit — build, incremental update on change/delete/rename,
  pipe-label links, ambiguity (two files same key).
- L3 real-VS-Code (mandatory): fixture vault → open note B, backlinks view lists A; edit A
  removing the link → view updates. (No L2 — host-side feature.)
