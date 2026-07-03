# Task 302 — Diagram Time Machine [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative-audit proposal
(192 §13); NOT scheduled. Shares its render core with 301 — decide the pair together.

## What it is & the effect

Select any diagram and scrub a slider through its whole git history: each commit's version
renders as a real diagram, flipbook-style, adds/removes highlighted between adjacent
frames; one click restores an old version of just that fence. "When did we drop the queue
from this architecture?" stops being `git log -p` archaeology — you watch the architecture
evolve like stop-motion and jump back to any frame.

## Why novel

Version history for diagrams exists only inside SaaS tools for their proprietary formats;
nobody does it for fenced diagrams in markdown, offline, across engines — and nobody else
HAS a render cache that makes it nearly free.

## Feasibility on our assets

`repo.show(ref, rel)` (the git-diff.ts pattern) generalizes to any revision; `md-scan.ts`
extracts the fence per revision; the 184 cache means a 50-commit history with 6 distinct
diagram states costs 6 renders EVER; restore = minimal-diff writeback of one fence.

## Honest value

Demo-wow is exceptional (the scrubbing flipbook sells itself); day-to-day value is real
but occasional — an archaeology tool, not an everyday one. If only one of 301/302 is
adopted, 301 first.

## Decision

- [ ] **ADOPT** (after/with 301 — shared core)
- [ ] **PARK** — reason: _______
