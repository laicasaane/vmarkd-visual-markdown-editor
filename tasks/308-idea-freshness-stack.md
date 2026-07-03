# Task 308 — Docs freshness stack: contract · staleness radar · delta digest · reverse impact [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled. Four stages of ONE coherent stack — adopt incrementally or park whole.

## What it is & the effect

The answer to "is this doc still true?", in four composable stages:
1. **Freshness contract + one-click attestation** — front matter declares
   `last-reviewed` + `review-every: 90d`; status-bar badge (fresh / due in 12d / OVERDUE);
   one click stamps date + git identity + a CONTENT HASH (so edits after the attestation
   are exposed); a "Review due" tree lists overdue docs.
2. **Dependency Staleness Radar** — the editor knows which workspace files a doc cites
   (links/refs/includes); an amber chip lands on the EXACT PARAGRAPH whose cited file
   changed since your review: "src/auth.ts: 12 commits since your review".
3. **Review Delta Digest** — when a review is due, don't re-read 2000 words: a collapsible
   per-section digest of the commits that touched each section's referenced files since
   the last attestation. Review = read 6 commit subjects, attest. 2 minutes, not 20.
4. **Reverse Impact** — before you commit code, a tree shows "4 docs cite files in this
   diff" with jump-to-the-citing-paragraph (+ CODEOWNERS owner). Docs get fixed at the
   moment of divergence, not discovered rotten a year later.

## Why novel

Swimm is the only neighbour — proprietary format + CI service. Offline, on plain
markdown, with per-PARAGRAPH attribution (our block↔line source map) — shipped nowhere.
Stage 3 exists in NO product (code review has "review the diff"; doc review never got it).

## Feasibility on our assets

Front-matter scan = md-scan primitives; badge/tree = shipped status-bar + outline-tree
patterns; stamping = minimal-diff writeback; file-change queries = the proven git-diff.ts
API path; the doc→file reference index inverts wiki-cache's existing structure; chips ride
the block↔line source map. All host-side; zero webview architecture risk.

## Honest value

Stages 2+4 are the killer daily-drivers for any repo with docs/; stage 1 is their enabling
substrate; stage 3 is what makes the contract sustainable instead of a nag. Low demo-wow,
very high team-trust-wow. Arguably the highest-leverage CLUSTER of the creative batch.

## Decision

- [ ] **ADOPT** → stage 1+2 first (contract + radar), 3+4 follow
- [ ] **PARK** — reason: _______
