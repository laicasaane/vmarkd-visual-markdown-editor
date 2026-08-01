# Task 255 — Fix/renumber ordered lists command

**Status:** planned · **Impact:** 🟡 med, cheap · **Origin:** task 192 §10

## Problem

After moving/deleting items the source keeps stale numbers (1,3,4 or all-1); IR editing
doesn't renumber (task 65 #9 — "Lute-side, not pursued") and sv users have no tool. The
engine already normalizes numbering on a Md→IR→Md pass — this is a command away.

## Scope

- [ ] Command `vMarkd: Fix list numbering` (palette + 215 context menu): re-serialize the
      caret's list block through Lute (the existing normalize path) with caret/scroll
      preservation; whole-doc variant `Renormalize all lists`.
- [ ] Scope the rewrite to the LIST BLOCK only (minimal-diff — don't reflow the whole doc);
      nested + mixed ordered/unordered handled by the engine (pin behaviour).
- [ ] sv mode: same command works on the source pane block.

## Out of scope

- Auto-renumber-on-edit — now **task 284** (probe disproved the "Lute bug" theory: Lute
  normalizes on spin; the stale paths are ours). 284 REUSES this task's normalize engine —
  build it shareable. Changing list STYLE (1. vs 1)) stays out.

## Verification

L1: normalize-through-Lute unit on messy fixtures (Node-Lute recipe). L2: command in
ir + sv → numbering fixed, rest of doc byte-identical, caret kept, one undo. L3: one leg
with save fidelity.
