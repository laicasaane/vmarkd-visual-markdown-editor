# Task 345 — Fountain screenplay rendering [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Real-usage audit (192 §14);
NOT scheduled. Honest rating: passionate niche, smaller than 344's.

## What it is & the effect

Fountain (fountain.io) is the plain-text screenplay standard — markdown-adjacent by
design. A ```` ```fountain ```` fence (or whole-doc mode for `.fountain`-flavoured md)
renders industry-format screenplay layout: centered character names, indented dialogue,
scene headings, transitions. Screenwriters get WYSIWYG-ish drafting + our export/PDF
pipeline (271 + a courier print theme) instead of paying for Final Draft.

## Why novel / value

Fountain apps exist (Highland, Beat); VS Code has syntax-highlight extensions only — no
rendered WYSIWYG surface. Honest: devoted but small audience; adopt only if the niche-
dialect direction (344) proves itself first.

## Feasibility

Fountain's grammar is small and line-based — a pure-TS parser + CSS layout; fence-engine
registration like 344; print theme rides 251/271.

## Decision

- [ ] **ADOPT** (after 344 validates the niche-dialect play)  ·  - [ ] **PARK** — reason: _______
