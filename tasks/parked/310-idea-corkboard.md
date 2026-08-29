# Task 310 — Corkboard: sections as draggable index cards [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled.

## What it is & the effect

A Scrivener-style corkboard panel: every section of the document becomes an index card —
heading, synopsis, word count. Restructuring a long draft stops being blind scroll-and-
cut-paste: you drag cards around like on a real corkboard and the markdown reorders
underneath, untouched sections keeping their EXACT original bytes. The twist: the synopsis
lives in an HTML comment under the heading — which VMDE already renders visibly in the
editor (html-comment.ts) — so the card text and the in-document note are the same thing.

## Why novel

Scrivener/Ulysses have corkboards as standalone apps; NOTHING in the VS Code or
markdown-WYSIWYG world ships one (Obsidian Longform manages separate files, no board over
one document). This is THE feature people leave editors for Scrivener over.

## Feasibility on our assets

outline-tree's parseHeadings gives fence-safe section boundaries with line numbers; a card
drag = pure line-range move through minimal-diff writeback (clean git diff); lute-host
renders each card's preview host-side (per-section chunks under its 10KB budget);
html-comment.ts guarantees synopsis round-trip safety. Shares the section engine with
258/289.

## Honest value

Daily-driver for long-form writers (fiction, docs, theses) + high demo-wow. The strongest
writer-persona magnet in the batch.

## Decision

- [ ] **ADOPT** (pairs naturally with 222/289 — one section-engine family)
- [ ] **PARK** — reason: _______
