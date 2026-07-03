# Task 312 — Draft snapshots with RENDERED prose diff [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled.

## What it is & the effect

Name a snapshot of your draft ("after first edit pass"), keep writing, then open a
rendered comparison: the page looks like your normal preview but deleted prose is struck
through in red and new prose glows green — **as formatted text, not markdown source**.
Comparing drafts becomes reading an edited manuscript, not decoding git line soup.

## Why novel

Google Docs has rendered version diffs; NO markdown editor does (Typora/Obsidian/MarkText
show source diffs at best). Our combination: block-level diff finds changed blocks,
word-level diff inside them, rendered through the SAME Lute engine as the editor —
pixel-faithful to what you write in.

## Feasibility on our assets

Snapshots → globalStorage; diff-lines.ts is the dependency-free differ; minimal-diff's
splitBlocks segments so only CHANGED blocks get word-diffed and re-rendered (lute-host's
per-call budget respected); display = a panel or preview overlay.

## Honest value

Real revision-workflow value (revision is where books are made) + strong demo legible to
non-programmers. Honest caveat: writers who live in git already get ~60% from source
diffs. Pairs with 311 (takes) and 326 (fresh ink) as the "revision suite".

## Decision

- [ ] **ADOPT** (bundle-decide with 311/326)
- [ ] **PARK** — reason: _______
