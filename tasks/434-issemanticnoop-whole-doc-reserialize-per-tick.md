# Task 434 — `isSemanticNoop` reserializes the WHOLE document on every edit-sync tick

**Status:** ✅ **FIXED (2026-07-30).** The whole-doc `isSemanticNoop` check no longer runs on every
debounced edit-sync tick. `minimizeWriteback` (the cheap, per-block-memoized path) still runs on
EVERY tick unchanged — typed content reaches disk with no added latency. The expensive check is
DEFERRED to a separate 1200ms idle timer (`WritebackController.NOOP_CHECK_IDLE_MS`), with
`checkNoopOnWillSave` as a correctness backstop wired to `vscode.workspace.onWillSaveTextDocument` so
EVERY save (any trigger — keybind, command palette, menu, auto-save, close-with-save-prompt) reflects
the final decision atomically, even if the idle timer hasn't fired yet. See "Implementation" below.
· **Impact:** 🟡 real, confirmed by measurement, now bounded to ~once per genuine pause instead of
never running less than every tick · **Origin:** `/simplify` efficiency review, 2026-07-29; measured
under task 412's parallel perf pass and implemented per team-lead direction, 2026-07-30

## The finding

`WritebackController.syncToEditor` (`src/writeback-controller.ts:114`) calls
`isSemanticNoop(baseline, content, reW)` (`src/minimal-diff-writeback.ts:129`) on every debounced
edit-sync tick — `edit-sync.ts` posts `command:'edit'` on a 250 ms debounce, on every document under
the 100k-char `MINDIFF_CAP`.

**Correction (task 412 pickup, 2026-07-30):** the "~4×/s while typing" framing above is WRONG —
`createPendingEdit` (`media-src/src/pending-edit.ts`) is a pure TRAILING debounce with no `maxWait`:
`schedule()` clears and restarts the timer on every keystroke, so `onIdle` (→ `postEdit` → the
`command:'edit'` that reaches `syncToEditor`) fires ONLY after a ≥250ms pause, never on a fixed
cadence during continuous fast typing. The real frequency is "once per pause the user actually takes"
— for prose with normal punctuation/thinking pauses that's plausibly every 1-3s during an active
editing burst, not 4/s. This doesn't make the finding go away (see "Measured" below), but it changes
the magnitude: fewer occurrences than filed, each still costing real time.

The baseline side is already memoized (`cleanBaselineCanonical`), so the cost is **one whole-document
Lute reserialize of the just-typed content per tick**. During normal typing the answer is always
`false` — the content really did change — so that reserialize is thrown away, and
`minimizeWriteback(baseline, content)` on the next line reprocesses the same document anyway through
its own per-block memoized cache.

`minimal-diff-writeback.ts:18-19` explicitly tells callers to memoize reserialize and gate it by
document size. The per-block path honours that; this whole-doc check does not.

## Why it was NOT fixed on the spot

This is the layer that fixes **"the tab stays dirty after undo-to-start"**: when the editor's output
is semantically identical to the clean baseline, the caller restores the baseline bytes VERBATIM so
the document returns to disk exactly. It exists precisely to catch what the block splitter cannot —
the IR round-trip collapses loose lists to tight, but BOTH sides collapse identically, so the
comparison stays robust.

Every cheap pre-check proposed for it (e.g. "only run when the block-split is byte-identical after
trimming") is a **guess at the canonicalization semantics**, and getting it wrong reintroduces a
dirty-state bug rather than a slow one. Verifying a change here needs the clipboard/undo real-VS-Code
set, which is already the flakiest part of the suite (`paste-real`, `cut-selection` — task 419).

## Measured (task 412 pickup, 2026-07-30)

Timed `reserializeMarkdown(ROOT, md)` warm (after `prewarmLute` + a 1s settle, matching
`lute-host.test.ts`'s own pattern — `prewarmLute` is `setTimeout(fn, 0)` fire-and-forget, so calling
it and measuring in the same tick under-measures to ~0ms; caught this on the first pass), on
realistic mixed content (prose + a table + a code fence + a list, repeated to size), average of 5
warm calls per size:

| doc size | reserializeMarkdown (warm) |
|---|---|
| 10,157 chars | ~74 ms/call |
| 32,133 chars | ~222 ms/call |
| 100,111 chars | ~1,036 ms/call (at `MINDIFF_CAP` — the worst case actually exercised; larger docs already skip this via the cap) |

Verdict on the task's own escape hatch: **this is NOT single-digit ms.** Even a modest 10KB document
pays ~74ms of EXTENSION HOST (not webview) main-thread block per occurrence, growing super-linearly
(consistent with `lute-host.ts`'s own documented curve for the sibling `Md2VditorIRDOM` function —
`reserializeMarkdown` does more work per call: parse + repair passes + serialize, so costs roughly
3× that table's numbers per size). Combined with the corrected frequency above (once per ≥250ms
typing pause, not 4/s), the practical picture is: during an active editing burst on a document in the
tens-of-KB range, every natural pause costs tens to low-hundreds of ms of host-thread block, thrown
away in the (overwhelmingly common) case where the answer is "no, not a no-op" — this reproduces
column-for-column what the original finding described, just at the corrected cadence.

**Environment note + a second data point (team-lead run, same day):** the numbers above came from a
QUIET `vitest`/jsdom process (extension-host Lute, warm, no concurrent load) on this machine. The team
lead independently ran the same measurement script under this session's ambient CONCURRENT load
(several other agents' test suites running in parallel in the same checkout) and got 308ms@10KB /
712ms@32KB / 2019ms@100KB — 3-4× higher, same shape, same conclusion. Both are the EXTENSION HOST
environment (Node, via `src/lute-host.ts`), never the webview — worth restating since a number from
this path says nothing about webview main-thread cost. The spread between the two runs is itself a
data point: this call's cost is sensitive enough to system load that "single-digit ms" was never in
reach at any realistic load, quiet or busy.

## Implementation (2026-07-30, per team-lead direction)

The decoupled-cadence design below (originally proposed as the safe alternative to an undo-detection
heuristic) is now shipped:

- **`minimizeWriteback` is unconditional on every tick, unchanged** — nothing that reaches disk
  changed, and typed content lands with no added latency. Only WHEN the whole-doc `isSemanticNoop`
  equality check runs changed.
- **`WritebackController.armDeferredNoopCheck`/`resolveNoopCheck`** (`src/writeback-controller.ts`):
  every tick arms (cancelling any prior) a `NOOP_CHECK_IDLE_MS` (1200ms) timer against the tick's
  baseline. If no later tick re-arms it, it fires and re-reads the CURRENT document (not a stale
  snapshot from arm time) — if that's a genuine no-op, restores the baseline bytes verbatim via the
  same `applyEdit` discipline `syncToEditor` always used (echo-suppression flags, failure recovery).
  1200ms leaves comfortable margin under `undo-dirty-probe.spec.ts`'s existing 2000ms post-undo wait
  (unchanged) while meaningfully coalescing a bursty typing session's short pauses.
- **`WritebackController.checkNoopOnWillSave`** — the correctness backstop. The webview's own Ctrl+S
  interception (`save-flush.ts`) only ever sees that one literal keystroke; a command-palette save,
  File-menu save, auto-save, or the close-with-"Save"-prompt flow never touch it. So the backstop is
  wired HOST-SIDE instead, to `vscode.workspace.onWillSaveTextDocument` (registered in
  `src/editor-session.ts`, filtered by `activeUri` like the existing `onDidSaveTextDocument`
  listener), which fires for every save trigger uniformly. It cancels the pending deferred timer
  (resolving now makes it redundant), runs the SAME `isSemanticNoop` check synchronously against
  whatever's currently in the document, and returns a corrective `TextEdit[]` handed to
  `event.waitUntil` — VS Code applies it ATOMICALLY with the save. No separate follow-up write, no
  race with the save itself.
- **Disposal**: `WritebackController.disposeNoopCheck()` cancels any pending timer, called from the
  panel's `onDidDispose` teardown (mirrors `DocSyncController.disposeTimer`'s existing pattern) so a
  closed tab can't fire a stray `applyEdit` against a gone document. `setCleanBaseline` also cancels
  the timer (a save landing makes the OLD baseline's comparison moot).
- **Known residual risk, judged acceptable, documented rather than engineered around**: if the
  deferred timer's own corrective `applyEdit` is still in flight (a few ms) at the EXACT moment a save
  also lands, both could in principle write the SAME baseline bytes — idempotent, not a correctness
  bug, and the window is narrow enough (a `setTimeout` firing vs. an explicit user/command save
  landing within single-digit milliseconds of each other) that a full write-serialization queue was
  judged not worth the added complexity. Flagged here rather than silently assumed away.

Sound-by-construction: a real semantic no-op is caught EITHER by the deferred timer (if the user goes
quiet) OR by the willSave backstop (if they save first) — never neither. This changes WHEN the
correction lands, never WHETHER.

## Verification

- **Unit** (`test/backend/writeback-controller.test.ts`): 15 tests — the tick no longer calls
  `isSemanticNoop` synchronously; the deferred timer fires and restores baseline after the idle
  window; a later tick re-arms instead of stacking; a genuine (non-no-op) settle does nothing;
  `disposeNoopCheck`/`setCleanBaseline` cancel a pending timer; `checkNoopOnWillSave` returns the
  correct `TextEdit[]` (or `[]`) and itself cancels the pending timer. Caught a real cross-test mock
  leak while writing these (`mockReturnValueOnce` queued-but-never-consumed by a cancelled-timer test
  bled into a later test via `clearAllMocks()`, which doesn't clear the queue — fixed with
  `mockReset()` + re-asserting the default).
- **Unit** (`test/backend/editor-session.test.ts`): 3 new tests — `onWillSaveTextDocument` reaches
  `WritebackController` without throwing under cold Lute (degrades to "no correction", never wrongly
  corrects or throws), the `activeUri` filter ignores other documents, and panel dispose calls
  `disposeNoopCheck` exactly once.
- **Unit** (`test/backend/vscode-mock.ts`): added a minimal `TextEdit` class and
  `onWillSaveTextDocument`/`fireWillSaveTextDocument` mock support (didn't exist before — nothing in
  this codebase used `onWillSaveTextDocument` prior to this task).
- **Real-VS-Code e2e, NEW** (`test/vscode-e2e/noop-check-on-save.spec.ts`, 2 tests, run 3× total —
  clean/clean/one-flaky-retry-under-heavy-concurrent-load-unrelated-to-logic):
  1. the deferred idle timer ALONE (no save) restores the clean baseline within its own ~1200ms
     window, polled with a 3s ceiling — deliberately tighter than `undo-dirty-probe.spec.ts`'s 2000ms
     so this pins the NEW mechanism's own cadence specifically.
  2. saving IMMEDIATELY after a revert-to-baseline (poll for the undo to land in the host document,
     then save with no added delay — deterministic, not a fixed sleep racing the undo loop's own
     variable pacing) still lands the EXACT baseline bytes on DISK, proving the willSave backstop —
     not the timer — is what caught it in that race.
- **Real-VS-Code e2e, RE-RUN UNCHANGED** (existing specs, exactly as the team lead required):
  `undo-dirty-probe.spec.ts` — 2 runs, both green, `textMatchesDisk=true` (Layer 1 intact).
  `save-fidelity.spec.ts` — 2 runs, both green, minimal-insertion + untouched-block assertions intact.
- **Gates**: `npm test` (157 files / 2153 tests), `node build.mjs` (the real `tsc -p ./` backend
  typecheck — `npm run typecheck` only covers `media-src/`), `biome check` — all clean on every file
  touched for this task.

## Related
`src/minimal-diff-writeback.ts`, `src/writeback-controller.ts`, `media-src/src/edit-sync.ts` (the 250 ms
debounce), `media-src/src/pending-edit.ts` (the trailing-debounce implementation), task
[419](419-clipboard-specs-fixed-settle-flake.md) (the flaky set that must verify it).
