# Task 477 — "could not write your edit (the document changed underneath)" fires in normal use

**Status:** 🟢 FIXED (2026-07-31). Hypothesis 1 (our own two writers racing through the shared
`applyToDocument`) **CONFIRMED** by direct unit-test reproduction of the exact predicted rhythm —
see "Hypotheses" below. Fixed by serializing every `applyToDocument` call onto a single
`applyChain` promise in `WritebackController` (`src/writeback/writeback-controller.ts`), so two of
our own writes can never have overlapping in-flight `vscode.workspace.applyEdit` calls. Proven at
both layers: a unit test (`test/backend/writeback-controller.test.ts`) that deterministically drove
the predicted collision, and a real-VS-Code e2e (`test/vscode-e2e/writeback-own-race.spec.ts`,
real keystrokes) that recorded actual host timestamps showing zero overlap and zero errors across
6 runs. · **Impact before the fix:** 🟡 no known data loss (see "Why this is not a data-loss bug"
below), 🔴 high trust cost — it is a scary, red, user-facing error on an ordinary edit ·
**Origin:** user report

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

      **CONFIRMED 2026-07-31.** `test/backend/writeback-controller.test.ts`, describe block
      `WritebackController — task 477 own-writer race (concurrent applyToDocument)`, test "a fresh
      tick does not dispatch applyEdit while the deferred correction's own applyEdit is still
      unresolved". Drove exactly the predicted rhythm (tick → `setCleanBaseline` → tick → advance
      fake timers past `NOOP_CHECK_IDLE_MS` so `resolveNoopCheck` starts its own `applyEdit`, held
      open via a controllable promise → a fresh `syncToEditor` call while it was still
      unresolved). **Against the pre-fix code this assertion failed**: `callsRightAfterTick` was
      `3`, expected `2` — i.e. the fresh tick dispatched its OWN `vscode.workspace.applyEdit`
      immediately, overlapping the still-open deferred correction's call, exactly as predicted.
      Confirmed via `npx vitest run --config test/vitest.config.ts
      test/backend/writeback-controller.test.ts -t "task 477"` before the fix landed.
- [x] **Instrument before theorising.** Superseded by the confirmed reproduction above — once the
      mechanism was pinned down and fixed by construction (serialization), there is no longer a
      failure path left to instrument for hypothesis 1/2. The existing `this.deps.debug(...)` call
      on the failure path (now inside `applyOnce`) is unchanged and still fires with `debugLabel` +
      uri for whatever residual failure a genuine external edit (hypothesis 3) might cause.

## Hypotheses, ranked — each CONFIRMED OR KILLED by measurement

1. **Two of our own writes racing.** `applyToDocument` is shared by the routine debounced tick
   (`syncToEditor`) and the deferred no-op correction (`resolveNoopCheck`, armed on a
   `NOOP_CHECK_IDLE_MS` timer). Both build a `WorkspaceEdit` over `documentRange(document)` and
   `await applyEdit`. If a tick lands while the deferred check's edit is in flight, the second
   edit's version is stale and resolves `false` — and the loser shows the user an error, even though
   *we* caused it, not "the document changing underneath". Task 434 defect #2 already moved
   `armDeferredNoopCheck` to after the await for a closely-related ordering reason, which makes this
   family of race demonstrably live in this file.
   **CONFIRMED** — see the unit-test reproduction above. This is the mechanism; fixed by
   serialization (see "Fix" below).
2. **A save-time apply colliding with a tick.** `checkNoopOnWillSave` runs from
   `onWillSaveTextDocument` and is described as applying atomically with the save. A debounced tick
   firing into that window is the same collision as (1) with a different second party.
   **NOT SEPARATELY TESTED** — `checkNoopOnWillSave` applies via `event.waitUntil` (a `TextEdit[]`
   return), not via `vscode.workspace.applyEdit`, so it never enters `applyChain` and is a different
   code path from (1)/(2)'s shared plumbing. Left as documented residual risk (see
   `resolveNoopCheck`'s own comment on the concurrent-applyEdit ordering race) — out of scope for
   this fix, which targets the `applyToDocument`-shared callers specifically. Not observed in
   practice and no user report points at save-time specifically.
3. **A genuinely external change** — format-on-save, another extension, git, the same file open in a
   plain text editor. Still possible in principle; the fix does not touch this path, and the error
   message is accurate if it ever fires for this reason. No evidence either way — the confirmed
   mechanism (1) fully explains the report (rare, single, ordinary-typing trigger) without needing
   this.
4. **Stale `documentRange(document)`** — the range is computed from a `document` reference captured
   before the `await`, so a document that grew between capture and apply yields a range that no
   longer covers it. **Subsumed by (1)'s fix**: serialization means `documentRange(document)` is now
   only ever computed once no other one of our own writes is in flight, so `document` cannot have
   moved out from under it due to OUR OWN concurrency. Not separately tested as a standalone
   hypothesis; not needed once (1) is fixed.

## Fix

**Confirmed as (1)/(2)-class (our own concurrency)** → per the fix direction below, the user should
never see an error at all for a self-inflicted collision.

`WritebackController` (`src/writeback/writeback-controller.ts`) now chains every
`applyToDocument` call onto a single `applyChain: Promise<void>` field. `applyToDocument` is now a
thin queue-entry wrapper; the actual write (echo-suppression flags, `WorkspaceEdit` construction,
`applyEdit`, failure handling) moved into a new private `applyOnce`, which only starts once every
earlier queued call has fully settled (landed OR failed). Two of our own writers — `syncToEditor`'s
tick and `resolveNoopCheck`'s deferred correction — can therefore never have overlapping in-flight
`vscode.workspace.applyEdit` calls, which structurally eliminates the race: there is no "lost race"
left to retry against, because the second call's `WorkspaceEdit` is only ever constructed after the
first has already landed (or failed) — so no explicit retry-on-`false` logic was needed on top of
the queue. A failed `applyOnce` still surfaces its error (unchanged path, still covers hypothesis 3)
and does not block whatever is queued behind it (regression-tested).

- If (3) ever gets evidence in a future report — keep notifying, but make the message distinguish a
  genuine external edit from our own race, since today they are indistinguishable to the user. Not
  needed now: (1) fully explains this report.
- The notification is still unconditional and unthrottled for a genuine hypothesis-3 case. Even for
  the honest case, a burst of identical modals would be its own defect — not addressed here, out of
  scope for this fix.

## Testing

Per AGENTS.md, both layers, and the writeback path is host-side so it is unusually well-suited to
unit tests:

- [x] **Unit** — `test/backend/writeback-controller.test.ts`. The pre-existing "recovers when
      applyEdit resolves false" test (task 151 invariant: `lastSyncedContent` NOT advanced,
      `pendingWebviewContent` cleared) stayed green through the fix unmodified. Two NEW tests pin
      the same invariant now that writes are queued: "a failed write does not block a later queued
      write" (both for `syncToEditor`'s message) and "a failed deferred-correction write does not
      block a later tick" (the sibling `resolveNoopCheck` message at ~line 281) — both call sites
      and both user-facing strings covered per the task brief.
- [x] **Unit** — the directed race test described above ("a fresh tick does not dispatch applyEdit
      while the deferred correction's own applyEdit is still unresolved") — confirmed the
      pre-fix reproduction, then pinned the fixed behaviour: the second write is queued (not
      dispatched) until the first settles, both eventually land, no error, exactly the content
      expected (`baseline text\n\n\n\n`).
- [x] **Real-VS-Code e2e** — `test/vscode-e2e/writeback-own-race.spec.ts`. Forcing the EXACT
      tick-vs-deferred-correction window via real keyboard timing turned out to be unreliable (a
      keystroke typed right as the correction's `applyEdit` was detected in flight consistently
      failed to produce a further edit-sync tick at all across 6 attempts — most likely a focus/DOM
      side effect of the undo dance used to arm the correction, not a `WritebackController` issue;
      the unit test above is what pins that exact pairing deterministically). The e2e instead forces
      two ORDINARY closely-spaced real-keystroke ticks into the same shared `applyToDocument`/
      `applyChain` path (same fix, same code, more reliable to force via real keys), widening the
      real race window by patching `vscode.workspace.applyEdit` in the extension host with an
      artificial 500ms delay and recording real host timestamps. Run `xvfb-run -a npm --prefix
      test/vscode-e2e test -- writeback-own-race.spec.ts --repeat-each=5`: **6/6 total runs green**
      (1 initial + 5 repeats), zero retries needed, e.g. `applyEdit windows: [0,551] [551,1063]
      errors=[]` — the second write's `start` lands exactly at (never before) the first write's
      `end`, every time. Also asserts data safety end to end (both keystrokes' content survives a
      real save, tab goes non-dirty).
- [x] Coverage confirmed: `applyOnce`/`applyToDocument`'s queueing branches are exercised by the
      unit tests above (both the immediate-queue-empty path and the queued-behind-another-write
      path).

## Notes

- Do NOT "fix" this by lowering the message's severity or dropping it. Until (1)–(4) are
  discriminated, the message may be the only signal that a real external-edit collision happened.
- The `applyToDocument` failure path is shared; a fix must be checked against **both** call sites
  (`syncToEditor` and `resolveNoopCheck`) and both user-facing strings.
