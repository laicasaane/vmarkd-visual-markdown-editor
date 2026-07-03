# Task 325 — ADR lifecycle + decision-drift detection [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled.

## What it is & the effect

For `docs/adr/*.md`: status chips (proposed/accepted/superseded) render in-editor; a
"Supersede…" command creates the successor ADR and stamps bidirectional links + statuses
into BOTH files atomically; a generated mermaid graph shows the decision lineage. The
push: an ACCEPTED ADR whose referenced code has since churned heavily gets flagged
"decision may no longer reflect reality — revisit or supersede". ADR folders stop decaying
into archaeology; the decision log becomes a living, self-auditing structure.

## Why novel

adr-tools (CLI) and log4brains (static site) manage ADR mechanics; neither lives in an
editing surface, and DECISION-DRIFT detection (code churn invalidating an accepted
decision) exists nowhere. It's the 308 radar specialized to the highest-value doc genre.

## Feasibility on our assets

Status chips = front-matter scan + the decoration pattern; supersede = two minimal-diff
edits; lineage graph = a generated mermaid fence (GitHub renders it too); churn = 308's
git plumbing. **Instant dogfood corpus: this repo's own docs/adr (ADR-0003/4/6).**

## Honest value

Niche-but-passionate audience (architecture-minded teams); the drift-flag is a
conference-talk-grade idea. High value density where ADRs are taken seriously.

## Decision

- [ ] **ADOPT** (as the 308 stack's showcase genre)
- [ ] **PARK** — reason: _______
