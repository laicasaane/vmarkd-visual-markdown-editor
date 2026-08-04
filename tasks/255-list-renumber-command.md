# Task 255 — Fix/renumber ordered lists command

**Status:** done for ir/wysiwyg; sv split off to **task 495** (2026-08-04, explicit user decision) · **Impact:** 🟡 med, cheap · **Origin:** task 192 §10

## Problem

After moving/deleting items the source keeps stale numbers (1,3,4 or all-1); IR editing
doesn't renumber (task 65 #9 — "Lute-side, not pursued") and sv users have no tool. The
engine already normalizes numbering on a Md→IR→Md pass — this is a command away.

## Scope

- [x] Command `vMarkd: Fix list numbering` (palette only — 215's context menu is still
      `planned`, its entry lands when 215 ships): re-serialize the caret's list root through
      Lute (`SpinVditorIRDOM`/`SpinVditorDOM` — the existing normalize path, same primitive
      `list-backspace.ts` already proved) with caret/scroll preservation via `<wbr>` +
      `setRangeByWbr`; whole-doc variant `Renormalize all lists` (`vmarkd.renormalizeAllLists`).
      `media-src/src/editing/list-normalize.ts`; wired through
      `src/app/commands.ts` → `fix-list-numbering`/`renormalize-all-lists` messages
      (`src/shared/protocol.ts`, `media-src/src/bridge/message-router.ts`).
- [x] Scope the rewrite to the LIST BLOCK only (minimal-diff — don't reflow the whole doc):
      `findEnclosingListRoot`/`collectListRoots` scope to top-level `<ul>/<ol>` roots only;
      nested + mixed ordered/unordered handled by the engine (pin behaviour). One undo step
      regardless of how many roots changed (Vditor's undo snapshot is per-`execAfterRender`
      call, not per-mutation — verified in e2e).
- [x] sv mode: split off to **task 495** — measured that Vditor's `setValue()` wraps the
      ENTIRE sv-mode document in ONE `<div data-block='0'>` (`vditor/src/index.ts:317`;
      per-paragraph divs only appear after a local edit re-spins a sub-region), so the
      ir/wysiwyg `outerHTML`-spin approach doesn't transfer directly. User decision
      (2026-08-04): ship ir/wysiwyg now, sv gets its own task rather than a rushed/coarser
      in-scope fix.

## Out of scope

- Auto-renumber-on-edit — now **task 284** (probe disproved the "Lute bug" theory: Lute
  normalizes on spin; the stale paths are ours). 284 REUSES this task's normalize engine —
  build it shareable. Changing list STYLE (1. vs 1)) stays out.
- Context-menu entry (215, still `planned`) — palette-only for now, by explicit user decision
  (2026-08-04).

## Verification

L1: `list-normalize.test.ts` — `findEnclosingListRoot` unit coverage (nested/mixed/blockquote/
editor-boundary cases) in jsdom; the DOM-mutating half needs a real Lute+IVditor (same
rationale as `list-backspace.test.ts`), covered by L2/L3 instead — matches this codebase's
established split (`list-backspace.ts` itself sits at ~17% vitest-only coverage for the same
reason).
L2: `media-src/e2e/list-normalize.spec.ts` (7 tests, harness) — caret-scoped fix (incl. nested
sublist), no-op outside a list, caret preserved after the swap, one-undo-step, whole-doc
renormalize with byte-identical surrounding content, no-op on a listless doc, one-undo-step
for the batch. Staleness is injected via a raw `<li>.remove()` (no Lute spin) since Vditor's
own initial parse already renumbers on load — a fixture loaded with wrong numbers reads back
already-correct.
L3: `test/vscode-e2e/list-normalize.spec.ts` — real VS Code, executes
`vmarkd.fixListNumbering`/`vmarkd.renormalizeAllLists` via `vscode.commands.executeCommand`
(proves the host→postMessage→message-router wiring, not just the webview functions directly),
IR + WYSIWYG. sv leg pending the scope decision above.
