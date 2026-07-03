# Task 318 — Prose Blame: hover a paragraph → who wrote it, when, why [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled.

## What it is & the effect

Hover any paragraph, table or diagram in the RENDERED doc → a quiet chip: who wrote it,
when, in which commit ("Anna, 2024-11-03, 'narrow DB scope per infra review'"); click
through to the commit or the block's full history. "Who decided we support only Postgres?"
stops meaning blame-on-raw-markdown archaeology with mental line→prose mapping.

## Why novel

Blame is universal for code and nonexistent for rendered prose — no WYSIWYG editor can do
it (no git or no block↔line map). GitLens blames source lines, not blocks of a rendered
document.

## Feasibility on our assets

The hard part is SHIPPED: the block↔line source map (used by edit-sync + the diff
gutters). vscode.git exposes blame; git-diff.ts shows the injection pattern; the hover
chip = data-render DOM; per-block history = `git log -L` over the block's range.

## Honest value

Solid daily value for team docs in a repo (specs/ADRs/runbooks); zero for solo scratch
notes. Cheap — excellent value/cost. Pairs with the 308 freshness stack thematically.

## Decision

- [ ] **ADOPT**
- [ ] **PARK** — reason: _______
