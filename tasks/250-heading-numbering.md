# Task 250 — Automatic heading numbering (1.2.3)

**Status:** planned · **Impact:** 🟡 med (writer/academic) · **Origin:** task 192 §10

## Problem

No way to see or maintain section numbers (grep → 0). Spec authors renumber `2.3.1` by
hand after every insert.

## Scope

- [ ] **Tier 1 — display-only** (near-zero risk): CSS counters on h1–h6 behind
      `vmarkd.headingNumbers` (default off), applied in edit + preview surfaces via a body
      class; numbers also shown in the outline panel + explorer tree labels. IR edit
      surface renders the number as decoration chrome (never serializes).
- [ ] **Tier 2 — write-back commands**: "Write section numbers into headings" / "Remove
      section numbers" — pure function over heading lines host-side (strip-then-apply so
      it's idempotent; existing numbers of any style recognized), through the minimal-diff
      writeback.
- [ ] Config: start level (skip H1 title), numbering style (`1.2.3` v1 only).

## Out of scope

- Per-heading opt-out attributes, appendix-style A.1 numbering, auto-write-back on edit
  (commands only — silent rewrites of user text are a trap).

## Verification

L1: numbering + strip/apply units (skips, gaps, setext headings, existing numbers).
L2: counters render per mode, outline shows numbers, `getValue()` untouched in tier 1;
tier-2 command output pinned. L3: one leg — toggle on, write back, save, disk correct.
