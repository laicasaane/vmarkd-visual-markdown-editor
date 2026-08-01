# Task 336 — Agent-instruction files mode (CLAUDE.md / AGENTS.md / rules files) [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Real-usage audit
(192 §14); NOT scheduled. **We are literally the target user — this repo's CLAUDE.md is
`@AGENTS.md`.**

## What it is & the effect

Treat the new document genre — CLAUDE.md, AGENTS.md, .cursorrules,
.github/copilot-instructions.md, skill files — as first-class:
1. **Resolved preview**: render the file WITH `@include` references inlined — exactly
   what the model will see (this repo's own CLAUDE.md→@RTK.md / @AGENTS.md chain is the
   proof of need); broken `@ref` → missing-chip styling.
2. **Token-length awareness**: the 334 counter + a genre-aware warning ("instruction
   files over ~N tok measurably dilute attention" — honest, sourced phrasing).
3. Small lints: duplicate headings across the include chain, dead relative links (55's
   engine), contradictory MUST/NEVER pairs flagged for human review (dumb text heuristic,
   no AI).

## Why novel

Agent files are among the most-edited markdown of 2025-2026 and NO tool treats them as a
genre. The @include resolution alone has zero support anywhere (each vendor's docs just
describe the convention).

## Feasibility on our assets

Include resolution = host-side read + the 204/230 inclusion machinery (data-render
read-only blocks) or a plain "resolved" Preview variant via lute-host; genre detection by
filename; lints ride md-scan + the 55 diagnostics pipe; token warnings need 334.

## Honest value

Perfect product-market fit with our actual users (and ourselves — instant dogfood).
Medium build; the resolved preview is the must-have slice, lints are garnish.

## Decision

- [ ] **ADOPT** → v1 = resolved preview + broken-@ref detection only
- [ ] **PARK** — reason: _______
