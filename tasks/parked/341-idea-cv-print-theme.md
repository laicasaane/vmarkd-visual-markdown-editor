# Task 341 — CV/resume print theme (resume.md → beautiful PDF) [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Real-usage audit (192 §14);
NOT scheduled. Rider on 271 (PDF pipeline).

## What it is & the effect

People keep `resume.md` in git and fight for a decent PDF (jsonresume/md-cv is a whole
ecosystem of half-working tools). We'll already have export+PDF (53/251/271) — the delta
is a dedicated **CV print theme**: tight typography, sidebar-ish sections via simple
heading conventions, front-matter contact block rendered as a header, one page by default.
`resume.md` → Ctrl+E → a PDF you'd actually send.

## Why novel / value

Nobody in the editor world owns this journey end-to-end offline. Cheap rider once 271
exists; grateful, shareable audience. Honest: it's a THEME + docs, not new machinery.

## Feasibility

A content-theme CSS variant + `@media print` rules (251's block) + front-matter mapping
(207's parser). Verify via one fixture → PDF snapshot.

## Decision

- [ ] **ADOPT** (after 271)  ·  - [ ] **PARK** — reason: _______
