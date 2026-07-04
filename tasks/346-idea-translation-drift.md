# Task 346 — Translation-pair drift: keep docs/en and docs/pl in sync [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Real-usage audit (192 §14);
NOT scheduled. The 308 freshness stack with a LANGUAGE-PAIR axis.

## What it is & the effect

OSS/docs maintainers keep `docs/en/x.md` + `docs/pl/x.md` and lose track of which
sections drifted. Pair files by path convention (configurable), then: per-SECTION drift
status ("EN changed in 3 places since PL was last synced" — git dates per section range),
a side-by-side view aligned by headings, and a "mark synced" attestation stamping the
pair (the 308 hash mechanism). Translators stop diffing whole files by eye.

## Why novel / value

Translation platforms (Crowdin) own strings, not markdown docs; git-based doc-translation
teams have NOTHING in-editor. Per-section attribution via our source map is the same
unique trick as 308. Honest: valuable for a specific (but real) maintainer profile;
medium build.

## Feasibility

Pairing = path convention + wiki-cache's file index; per-section drift = 308's git
plumbing over section ranges (258's engine); side-by-side = two render panes (sv split
machinery precedent); attestation = 308's stamp. Adopt realistically AFTER 308.

## Decision

- [ ] **ADOPT** (after 308)  ·  - [ ] **PARK** — reason: _______
