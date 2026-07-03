# Task 284 — Auto-renumber ordered lists on edit (probe-first)

**Status:** planned — PROBE-FIRST · **Impact:** 🟡 med (MAIO parity; task 65 #9 finally pursued) · **Origin:** 192 §11 follow-up (MAIO comparison)

## Problem

MAIO auto-renumbers ordered lists as you edit; our lists can show stale numbers (1,3,4 or
all-1) until a full round-trip. **Probe (2026-07-03) localized the fault line:** Lute
normalizes numbering FOR FREE at parse and whole-list spin —
`Md2VditorIRDOM('1. a\n3. b\n7. c')` already emits `data-marker` 1./2./3. and serializes
normalized. So typing paths that widen to a list spin (the task-177 behaviour) renumber
correctly; staleness comes from edit paths that **bypass the spin**: drag-move (Vditor
discards `insertFromDrop` input — 191 Probe-4/5), our deferred cut delete (fixCut
`execCommand('delete')` fires no input — 191 batch-1 finding), selection-delete/backspace
merges, and possibly WYSIWYG-specific paths. Task 65 #9 recorded the class ("likely
Lute-side, not pursued") — the probe disproves the Lute-side theory.

## Scope

- [ ] **Probe matrix first:** per mode (ir/wysiwyg), which operations leave stale numbers —
      drag item out/in, cut item, select-across-items + Delete/Backspace, Enter-split,
      checkbox-item ops, undo of each. Pin the failing set (harness spec doubles as the
      future regression net).
- [ ] Fix = a **renumber-on-settle pass**: after a list-touching structural mutation (or on
      caret-leave of a list — the task-100 `promoteThematicBreaks`/gap-paragraph
      precedent), re-run the affected LIST block through the same Lute normalize engine
      task 255's command uses (**share it — build once**), applied as one model edit with
      caret/scroll preserved; idempotent (normalized list → no-op, no edit posted).
- [ ] Perf guard: NEVER on the per-keystroke path (edit-activity gate; task 177 exists
      because list spins are already too eager — this pass must only fire on settle of the
      specific failing operations, not add work to typing).
- [ ] Nested + mixed ordered/unordered handled by the engine (already pinned in 255).

## Out of scope

- The manual command UX (task 255 — ships first, this rides its engine), list STYLE
  changes, renumbering plain-text sv edits (sv users get the 255 command).

## Verification

L1: shared normalize engine (255's tests) + no-op idempotence unit. L2: the probe matrix
as assertions — each failing op → numbering correct after settle, exactly one edit post,
caret stable, typing inside an item triggers no extra spin (perf spy). L3 real-VS-Code:
one journey — drag an item, save → disk numbering correct.
