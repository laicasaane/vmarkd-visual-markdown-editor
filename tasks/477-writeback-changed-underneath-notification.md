# Task 477 — "could not write your edit (the document changed underneath)" fires in normal use

**Status:** 🔴 OPEN — reported 2026-07-31 by the user, seen in their real editor. **Not yet
reproduced.** Mechanism not established, but narrowed: the user reports it during **ordinary
typing**, **singly and rarely**, which makes hypothesis 1 (our own two writers racing) the lead and
yields a falsifiable prediction — see the trigger item below. · **Impact:** 🟡 no known data loss (see "Why this is not
a data-loss bug" below), 🔴 high trust cost — it is a scary, red, user-facing error on an ordinary
edit · **Origin:** user report

## The report

The user sees this notification in VS Code:

> [vMarkd] vMarkd: could not write your edit (the document changed underneath). Your change is still
> in the editor — save again.

Emitted at `src/writeback/writeback-controller.ts:166`, passed as `errorMessage` into
`applyToDocument`, and shown at line 205 on exactly one condition: `vscode.workspace.applyEdit()`
**resolved `false`**. Note it *resolves* false rather than throwing — that is documented VS Code
behaviour when the edit's document version no longer matches, and the code comment at line 194
already says so.

The sibling message at line 281 ("could not restore the clean baseline after an undo") comes from
the same `applyToDocument` plumbing via `resolveNoopCheck`. **Assume both are the same bug until
measured otherwise** — anything found here should be checked against that path too.

## Why this is not a data-loss bug (and what it still costs)

This is worth stating up front so nobody "fixes" it by making the message go away. The failure
handling is deliberate and, on the data-safety axis, correct — task 151 item 2:

- `lastSyncedContent` is **not** advanced on a failed write. Advancing it would mark webview and
  disk as reconciled while disk still held the old text, and the change listener would then never
  re-push. That is the actual data-loss shape, and it is guarded.
- `pendingWebviewContent` is cleared, and the user's text is still in the editor.

So the text is safe and the advice in the message ("save again") is honest. **The cost is trust**:
a red error on a routine keystroke teaches the user that saving is unreliable, and it trains them
to ignore a message that would matter if it ever fired for a real reason. That is the bug.

## What is NOT yet known — do not skip this

The user's report is a **symptom only**. No repro steps, no document, no timing, no idea whether it
fires once per session or constantly. Do not start from a hypothesis below and go patch it — that
is the exact failure mode recorded in this repo before (measuring a mechanism, then asserting a
symptom that was never observed). **Reproduce first, or instrument first.**

- [x] **Ask the user for the trigger.** Answered 2026-07-31: **during ordinary typing**, and
      **singly and rarely** — not in bursts, not tied to save or undo. This is evidence, not proof,
      but it fits hypothesis 1 and fits hypothesis 3 badly (no external tool is touching the file
      while they type), so 1 is now the lead.

      **Falsifiable prediction this buys us.** `NOOP_CHECK_IDLE_MS = 1200`. So the deferred no-op
      check fires only after a **1.2 s pause**, and its `applyEdit` is then in flight for however
      long VS Code takes. The predicted collision window is therefore: *type → pause ≥1.2 s → the
      deferred check wakes and starts its apply → resume typing inside the few ms its await is
      open → the tick's edit loses on version and shows the error.* That window is milliseconds
      wide and requires a specific pause-then-resume rhythm — which is exactly why it would be
      **rare and single rather than bursty**, matching the report on the one axis a guess would
      most easily have got wrong.

      This is a **prediction to be tested, not a conclusion.** It is cheap to attack directly:
      drive that rhythm in a unit test with a slow `applyEdit`, or temporarily shrink
      `NOOP_CHECK_IDLE_MS` to widen the window and try to reproduce by hand. If forcing the exact
      predicted rhythm does NOT reproduce it, hypothesis 1 is wrong and the instrumentation below
      is the fallback — do not quietly reinterpret a failed repro as "still probably the race".
- [ ] **Instrument before theorising.** `applyToDocument` already calls `this.deps.debug(...)` on the
      failure path (line 201) with the uri. Widen that one line — to the vMarkd Output channel, per
      house rule, never `console.log` — to record what would actually discriminate between the
      hypotheses: `document.version` at edit-construction vs at failure, the `debugLabel`
      (`syncToEditor` vs the `resolveNoopCheck` caller), elapsed ms across the `await`, and whether
      another apply was in flight. Ship this even if the fix lands later; it is cheap and the next
      report then arrives with evidence attached.

## Hypotheses, ranked — each to be CONFIRMED OR KILLED by measurement, not by reading

1. **Two of our own writes racing.** `applyToDocument` is shared by the routine debounced tick
   (`syncToEditor`) and the deferred no-op correction (`resolveNoopCheck`, armed on a
   `NOOP_CHECK_IDLE_MS` timer). Both build a `WorkspaceEdit` over `documentRange(document)` and
   `await applyEdit`. If a tick lands while the deferred check's edit is in flight, the second
   edit's version is stale and resolves `false` — and the loser shows the user an error, even though
   *we* caused it, not "the document changing underneath". Task 434 defect #2 already moved
   `armDeferredNoopCheck` to after the await for a closely-related ordering reason, which makes this
   family of race demonstrably live in this file. **Check first.**
2. **A save-time apply colliding with a tick.** `checkNoopOnWillSave` runs from
   `onWillSaveTextDocument` and is described as applying atomically with the save. A debounced tick
   firing into that window is the same collision as (1) with a different second party.
3. **A genuinely external change** — format-on-save, another extension, git, the same file open in a
   plain text editor. This is the only case where the message text is *accurate*. If measurement
   lands here, the fix is not to suppress but to make the message say which.
4. **Stale `documentRange(document)`** — the range is computed from a `document` reference captured
   before the `await`, so a document that grew between capture and apply yields a range that no
   longer covers it.

## Fix direction (deliberately not chosen yet)

Do not pick until a hypothesis is confirmed. Recording the shape so the choice is informed:

- If (1)/(2) — **our own concurrency** — the user should never see an error at all: serialize the
  applies (a single in-flight promise / apply queue), and on a lost race **retry against the fresh
  document** rather than notifying. A self-inflicted collision is not something to apologise to the
  user for; it is something not to do.
- If (3) — keep notifying, but the message should distinguish a genuine external edit from our own
  race, since today they are indistinguishable to the user.
- Either way: the notification is currently unconditional and unthrottled. Even for the honest case,
  a burst of identical modals is its own defect.

## Testing (required before this can close)

Per AGENTS.md, both layers, and the writeback path is host-side so it is unusually well-suited to
unit tests:

- [ ] **Unit** — `test/backend/`, alongside the existing writeback-controller tests. Force
      `applyEdit` to resolve `false` and assert the invariant that actually matters: `lastSyncedContent`
      is NOT advanced, `pendingWebviewContent` is cleared, and the next change re-pushes. Assert the
      current behaviour first (it should already be green — it is the 151 guarantee), then the new
      behaviour once the fix lands.
- [ ] **Unit** — a directed test for whichever race is confirmed: drive a tick and the deferred/save
      apply into overlap and assert exactly one write lands and no error is shown.
- [ ] **Real-VS-Code e2e** (`test/vscode-e2e/`) — this is a save/document-mutation behaviour, so the
      L2-vs-L3 distinction applies: synthetic events change `getValue` without driving Vditor's real
      edit-post pipeline. Prove the mutation→save wire with **real keys**. Model on the existing
      `save-fidelity.spec.ts` / `undo-dirty-probe.spec.ts`, which already exercise this controller.
- [ ] Coverage confirmed for the new code.

## Notes

- Do NOT "fix" this by lowering the message's severity or dropping it. Until (1)–(4) are
  discriminated, the message may be the only signal that a real external-edit collision happened.
- The `applyToDocument` failure path is shared; a fix must be checked against **both** call sites
  (`syncToEditor` and `resolveNoopCheck`) and both user-facing strings.
