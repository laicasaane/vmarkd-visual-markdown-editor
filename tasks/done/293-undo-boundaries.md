# Task 293 — Undo grouping boundaries (audit + fixes)

**Status:** DONE 2026-08-31 · **Impact:** 🟡 med (undo quality = trust) · **Origin:** task 192 §12

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

- [x] Keep the dmp snapshot ENGINE (no architecture change); add **forced
      `addToUndoStack` flushes on boundary events** from the VMDE layer (or a small
      registry-anchored patch): before+after paste, on Enter (block split), around
      toolbar/model commands (bubble 285, turn-into 298, table ops), before a Lute spin
      that PROMOTES syntax (autoformat-revert = snapshot immediately pre-promotion).
- [x] Pin the contract in a unit matrix: type-pause-type (merges), type+paste (2 steps),
      autoformat+Ctrl+Z (reverts to literal), format-command mid-typing (3 steps),
      the 191 P0-16 one-paste-one-step net stays green.
- [x] Coordinate with the mode-aware undoDelay waits the 191 test infra documents (the
      contract change must update those helpers, not fight them).

## Out of scope

- Cross-session undo, changing undoDelay itself, VS Code-side undo coupling (task 181's
  parked dirty-dot concern stays separate).

## Verification

L1: the boundary matrix (fake clock). L2: harness — each scenario's Ctrl+Z step count
exact; existing undo nets (undo-dirty-probe class) green. L3 real-VS-Code: paste →
Ctrl+Z ×N journey with disk verification (extends 190's undo-redo-steps plan).

## Implementation

- `editing/undo-boundaries.ts` keeps Vditor's diff-match-patch stack and installs one capture-phase
  controller for paste, Enter, mutating format/table/cut chords, and toolbar/panel actions. Ordinary
  input only tracks whether an unflushed typing group exists, so quick prose keeps Vditor's normal
  `undoDelay` coalescing.
- A capture-phase `input` check recognizes literal IR promotion triggers (`# `, list markers,
  quotes) after the browser inserts the space but before Vditor's bubble-phase Lute spin. The
  pre-promotion DOM and promoted DOM become adjacent checkpoints, so one undo restores the exact
  visible literal marker in a paragraph.
- Boundary finalization cancels Vditor's pending merged timer, adds at most one post-action snapshot
  (skipping it if Vditor already advanced the stack), and invokes the normal input callback. This
  preserves host sync while preventing delayed caret-only entries. Ctrl/Cmd+V is owned only by the
  paste event; clipboard/history/navigation chords cannot duplicate a boundary.

## Verification evidence

- Unit matrix: 18/18 tests passed for literal-promotion classification, pending-timer cancellation,
  non-cancelling post checkpoints, and mutating format/table chord classification without
  clipboard/history duplication. Focused init/module-boundary checks and strict type checks passed.
- Focused Chromium `undo-boundaries.spec.ts --retries=0`: 5/5 passed for ordinary typing merge,
  Enter, type/paste/type, exact visible `# ` demotion, and format-command grouping. Focused coverage
  reports 84.67% lines for `undo-boundaries.ts`.
- Focused real VS Code `undo-boundaries.spec.ts --retries=0`: 1/1 passed (6.2 s final paired run),
  proving three distinct undo steps for typing → real clipboard paste → typing and exact host/disk
  recovery. The existing `paste-real.spec.ts` one-paste/one-undo regression passed 1/1 (8.8 s) on
  the same final no-retry run. `undo-redo-steps.spec.ts` also passed on the preceding candidate;
  it was not repeated after the paste-only checkpoint refinement because history chords are
  explicitly excluded from the new controller.
- `node build.mjs`: passed. Bundle/startup gates passed at 545/548 KB, 279/279 eager modules, and
  29.4/34 KB largest module; lazy-engine budgets were unchanged.
- Full coverage: 237 files / 3,438 tests passed; aggregate 74.50% statements / 67.56% branches /
  77.20% functions / 76.33% lines, with the zero-coverage ratchet at 15/15.
- Final quality: brand, lint, jscpd, dependency boundaries, npm/vendor audits, coverage, and the
  coverage ratchet passed. Knip retains only the unrelated `yazl` baseline in
  `test/backend/package-local-preview-core.test.ts`. Early Chromium and real-VS-Code candidates
  exposed sentinel/timing, clipboard-caret, and duplicate delayed-checkpoint issues; each was fixed
  before the final no-retry evidence. Per the queue policy, no full Chromium, FAST, or full
  real-VS-Code suite was run.
