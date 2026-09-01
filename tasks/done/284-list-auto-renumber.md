# Task 284 — Auto-renumber ordered lists on edit (probe-first)

**Status:** done — 2026-08-31 · **Impact:** 🟡 med (MAIO parity; task 65 #9 finally pursued) · **Origin:** 192 §11 follow-up (MAIO comparison)

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

- [x] **Probe matrix first:** per mode (ir/wysiwyg), which operations leave stale numbers —
      drag item out/in, cut item, select-across-items + Delete/Backspace, Enter-split,
      checkbox-item ops, undo of each. Pin the failing set (harness spec doubles as the
      future regression net).
- [x] Fix = a **renumber-on-settle pass**: after a list-touching structural mutation (or on
      caret-leave of a list — the task-100 `promoteThematicBreaks`/gap-paragraph
      precedent), re-run the affected LIST block through the same Lute normalize engine
      task 255's command uses (**share it — build once**), applied as one model edit with
      caret/scroll preserved; idempotent (normalized list → no-op, no edit posted).
- [x] Perf guard: NEVER on the per-keystroke path (edit-activity gate; task 177 exists
      because list spins are already too eager — this pass must only fire on settle of the
      specific failing operations, not add work to typing).
- [x] Nested + mixed ordered/unordered handled by the engine (already pinned in 255).

## Out of scope

- The manual command UX (task 255 — ships first, this rides its engine), list STYLE
  changes, renumbering plain-text sv edits (sv users get the 255 command).

## Verification

L1: shared normalize engine (255's tests) + no-op idempotence unit. L2: the probe matrix
as assertions — each failing op → numbering correct after settle, exactly one edit post,
caret stable, typing inside an item triggers no extra spin (perf spy). L3 real-VS-Code:
one journey — drag an item, save → disk numbering correct.

## Completed implementation

The probe corrected this task's old fault matrix. Since Task 387's synchronous cut re-drive, real
non-collapsed cut and selection Delete already run Vditor's whole-list spin and renumber correctly
in both IR and WYSIWYG. Enter/list/checklist structural paths are likewise spin-owned. The durable
stale path is contenteditable drag/move: the source deletion and target insertion can bypass a
whole-list spin.

`list-normalize.ts` now detects stale `data-marker` sequences recursively (including nested ordered
lists and non-1 starts) and normalizes only connected stale top-level roots. Already-normalized
lists are true no-ops: no Lute spin, no `execAfterRender`, and no edit post. The auto controller
captures drag source/target roots, adds a newly-created target root at settle, uses Task 161's shared
220 ms quiet gate, and batches every stale root through Task 255's existing Lute engine as one edit.
It records a pre-drag undo boundary, preserves the dragged item's logical text offset and scroll,
and invalidates competing caret intents only at the drag gesture/settle. Undo/Redo themselves do
not schedule repair, so Redo history cannot be cleared. Disposal makes an already-deferred callback
inert. Ordinary input types return before even resolving runtime context.

### Verification evidence

- TDD RED proved normalized lists previously spun/posted and that a cross-list drag without the
  controller leaves `1. beta, 1. first, 2. second, 3. third`. Final focused unit coverage passes
  **24/24** for idempotence, nested-only staleness, local/new roots, drag caret/checkpoint, ignored
  input types, mode/runtime changes, and deferred disposal.
- Focused Chromium passes **9/9**: a real pointer/DataTransfer drag plus IR/WYSIWYG cut, selection
  Delete, two-stale-root drag, and ordinary-typing spin-count contrasts. Cut/Delete require no new
  repair; drag normalizes both roots; typing performs only its normal Vditor spin.
- The final real-VS-Code journey passes **1/1** in 16.6 s with `--retries=0`, proving the production
  controller, exact host bytes, caret/scroll, one-step Undo/Redo, and saved disk bytes. Playwright
  cannot deliver a native selected-text drag through VS Code's nested OOPIF (the gesture no-ops even
  with verified selection and text-side coordinates), so this layer uses real `DragEvent`s with one
  shared `DataTransfer` and explicitly performs the browser default DOM move. The Chromium layer is
  the native-drag proof; the real-VS-Code layer is the custom-editor/host/undo/save proof.
- Final build, lint, webview/strict/VS Code e2e typechecks, bundle/startup budgets (**557/558 KB**,
  **283/283** eager modules), full coverage (**244 files / 3,499 tests**, 75.98% statements / 68.56%
  branches / 78.54% functions / 77.91% lines), and the 14-module coverage ratchet pass.

The single aggregate `npm run quality` invocation passed brand checks, lint, jscpd, and dependency
boundaries. Its task-specific unused export was removed and the focused knip rerun returned only the
pre-existing `yazl` finding. Audit remained network/policy-blocked exactly as recorded in Task 532;
coverage's sandbox `spawnSync ... EPERM` failures were rerun successfully outside that process
sandbox. No dependency files changed. No automatic test retries were used; iterative real-VS-Code
candidates diagnosed undo-boundary and caret-authority interactions before the final clean run.
Per queue policy, no FAST, full Chromium, or full real-VS-Code suite was run. Two review rounds found
no remaining critical, important, or minor issues.

## 1.4.0 release-gate follow-up (2026-09-01)

Task 541 corrected one stale pre-Task-284 Chromium oracle: after removing an item from the second of
two ordered lists, only that root is stale, so the idempotent normalization authority correctly
returns one touched root rather than two. Existing unit coverage independently proves that a
canonical ordered root performs no Lute spin and posts no edit. The corrected full-file Chromium run
passes 16/16 without retries and retains byte-equivalence checks for all non-marker content.
