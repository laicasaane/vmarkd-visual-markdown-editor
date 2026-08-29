# Task 293 — Undo grouping boundaries (audit + fixes)

**Status:** planned · **Impact:** 🟡 med (undo quality = trust) · **Origin:** task 192 §12

## What it is & the effect

ProseMirror/Lexical treat undo grouping as core UX: a paste is its own undo step, Enter
starts a new group, the first Ctrl+Z after a markdown autoformat reverts to the literal
text you typed. Vditor records undo as whole-doc diff-match-patch snapshots on ONE fixed
timer — `addToUndoStack` inside `setTimeout(…, undoDelay)` with `undoDelay: 800`
(`ir/process.ts:74-76`, `Options.ts:129`).

**Effect today:** anything that happens within 800ms merges into one step — type a word,
quickly paste a paragraph, keep typing → one Ctrl+Z nukes all three; there's no
autoformat-revert (typing `# ` + text then Ctrl+Z can't get the literal `# ` back); a
toolbar command mid-typing fuses with the prose around it.
**After:** predictable steps — paste/Enter/toolbar commands/syntax promotion are their own
boundaries, matching what 30 years of editors trained users to expect.

## Scope

- [ ] Keep the dmp snapshot ENGINE (no architecture change); add **forced
      `addToUndoStack` flushes on boundary events** from the VMDE layer (or a small
      registry-anchored patch): before+after paste, on Enter (block split), around
      toolbar/model commands (bubble 285, turn-into 298, table ops), before a Lute spin
      that PROMOTES syntax (autoformat-revert = snapshot immediately pre-promotion).
- [ ] Pin the contract in a unit matrix: type-pause-type (merges), type+paste (2 steps),
      autoformat+Ctrl+Z (reverts to literal), format-command mid-typing (3 steps),
      the 191 P0-16 one-paste-one-step net stays green.
- [ ] Coordinate with the mode-aware undoDelay waits the 191 test infra documents (the
      contract change must update those helpers, not fight them).

## Out of scope

- Cross-session undo, changing undoDelay itself, VS Code-side undo coupling (task 181's
  parked dirty-dot concern stays separate).

## Verification

L1: the boundary matrix (fake clock). L2: harness — each scenario's Ctrl+Z step count
exact; existing undo nets (undo-dirty-probe class) green. L3 real-VS-Code: paste →
Ctrl+Z ×N journey with disk verification (extends 190's undo-redo-steps plan).
