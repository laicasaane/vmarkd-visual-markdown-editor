# Task 311 — Takes: paragraph alternatives with a live switch [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled.

## What it is & the effect

Keep 2-3 versions of any paragraph side by side, like takes in a recording studio: one is
"live" (in the document), the others fold away as HTML comments right below it; a small
tab strip above the paragraph auditions each take in place. Rejected phrasings stop dying
in scratch files — the losers stay IN the file, invisible in export/GitHub, travel through
git, and are always one click from returning. "Which opening is better" — THE recurring
editing problem — gets a mechanism.

## Why novel

Nobody ships paragraph-granular alternatives: Ulysses/Scrivener version whole sheets;
Google Docs suggestions are edits, not parallel takes. The comment serialization makes it
fully portable — the file stays valid markdown everywhere.

## Feasibility on our assets

The hard part is solved in-repo: html-comment.ts PROVES commented content renders visibly
AND round-trips byte-safe. Live↔take swap = a two-block swap via minimal-diff writeback;
the switcher UI = data-render injected nodes (documented house pattern); source-map ties
takes to line ranges.

## Honest value

High daily value for serious writers; moderate demo-wow, compounding in use. Cheap
relative to its distinctiveness.

## Decision

- [ ] **ADOPT**
- [ ] **PARK** — reason: _______
