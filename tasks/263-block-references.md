# Task 263 — Block IDs + block references (`[[note#^id]]`, `![[note#^id]]`)

**Status:** planned · **Impact:** 🟡 med (PKM power users) · **Depends:** 203 + 204 · **Origin:** task 192 §10

## Problem

Explicitly deferred by the backlog and owned by nobody: task 203 resolves the PAGE and
ignores `^block` ("needs block IDs — future"); task 204 excludes `^block` embeds;
`WikiLinkPattern` has no `^` semantics. The Obsidian block-reference / Notion synced-block
analog is a defining PKM power feature.

## Scope

- [ ] Authoring: command `Copy block reference` — appends ` ^id` (short nanoid) to the
      caret's block and puts `[[note#^id]]` on the clipboard; `^id` suffixes render as a
      dim affordance (data-render), round-trip as plain text.
- [ ] Index: wiki-cache indexes `^ids` per file (scan + watcher — the existing skeleton).
- [ ] Resolve: `[[note#^id]]` chip opens the note and scrolls to the block (source-map;
      extends 203's resolution helper); `![[note#^id]]` transcludes exactly that block
      (single-block slice through 204's read-only inclusion container, live-refresh with
      it).
- [ ] Missing id → missing-chip styling (never offer to create a file — the 203 lesson).

## Design input (added 2026-07-03): kramdown IAL — our engine's NATIVE block-attribute dialect

Our bundled Lute (SiYuan's engine) already ships the FULL kramdown-IAL API unused —
`SetKramdownIAL`/`SetKramdownBlockIAL` (280 hits in lute.min.js, zero uses in our code).
Flipping it gives parse + round-trip of `{: id="x" custom-k="v"}` per block for FREE:
durable block identity AND arbitrary metadata with no parser work, plus read-compat with
SiYuan-exported markdown. **Decision for this task's design phase:** `^id` (Obsidian
convention) stays the DEFAULT — IAL braces render as literal junk on GitHub/Obsidian —
but offer IAL as an opt-in dialect + SiYuan-import path. Verify SetKramdownIAL's
interplay with the IR spin + minimal-diff writeback before committing either way.

## Out of scope

- Auto-assigning ids on every block, id refactoring on block move across files, Logseq
  block-embedding semantics beyond single-block.

## Verification

L1: id generator/parser + index units. L2: chip resolve + embed slice render, round-trip
byte-stable, copy-command output exact. L3 real-VS-Code (mandatory): two-file journey —
copy ref in A, paste in B, click → A opens scrolled to the block; embed renders it.
