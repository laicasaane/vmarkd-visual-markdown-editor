# Task 342 — Invoice & letter documents (templates + front-matter + calc + print) [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Real-usage audit (192 §14);
NOT scheduled. Pure COMPOSITION of planned parts.

## What it is & the effect

Freelancers hand-fill invoice docs monthly. Compose what we already plan into the
md-invoice workflow: a template (209/221) with front-matter data (207: client, number,
dates), a line-items table whose **total is computed by calc chips (313)** — frozen into
text on export — and a print theme (251) → PDF (271). Same skeleton serves formal
letters. The file stays plain markdown in git.

## Why novel / value

Invoice SaaS exists; a git-friendly, offline, plain-text invoice flow is a real
self-hosted-crowd wish. Honest: near-zero NEW machinery — the value is the recipe + one
theme + docs; adopt only as a showcase once 313/271 land.

## Feasibility

Template + theme + a docs page. The only new code: "freeze computed chips on export"
(a 313 scope line — cross-noted there when adopted).

## Decision

- [ ] **ADOPT** (as a 313+271 showcase)  ·  - [ ] **PARK** — reason: _______
