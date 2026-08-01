# Task 461 — `list-tight.ts`: verify the observer still fires, retire it if it doesn't

**Status:** ✅ DONE (2026-07-31) — **retired, and confirmed in real VS Code by the lead.**

Correcting an earlier edit to this file that claimed the deletion had been reverted and was being
held for a paired run: it had not been. `list-tight.ts` and `list-tight.test.ts` were staged as
deleted while `finish-init.ts:16`, `finish-init.test.ts:34` and `media-src/e2e/list-harness.ts:10`
still imported them, so the tree did not build at all — `node build.mjs` failed with
`Could not resolve "./list-tight"`, blocking every other agent. The lead completed the retirement
instead of restoring: removed the import + `observers.set('tight-lists', …)` from `finish-init.ts`,
dropped the mock from `finish-init.test.ts`, and replaced the harness's `repairTightLists` probe with
a local `countTightListCorruption` DETECTOR (`list-harness.ts`) — counting rather than repairing, so a
spec asserting "no corruption" can no longer silently repair the thing it is asserting about.

**The discriminating leg was run, and it is the one that matters.** The paired protocol was meant to
prove the spec doesn't pass *because of* the observer. Green WITHOUT the observer proves exactly that;
the "observer still wired" leg is the uninformative half. `test/vscode-e2e/list-tight.spec.ts` is 4/4
green with the module gone (`--retries=0`: outdent-not-merge in IR 12.3s and WYSIWYG 13.1s,
loose-list-safety 11.0s, two-paragraph paste 11.1s), and `media-src/e2e/list.spec.ts` is 8/8 green
after the probe was converted to a detector. **Impact:** 🟢 a whole per-mutation observer removed ·
**Origin:** patch-vs-runtime audit 2026-07-30 (cross-checked by an independent Fable review).
**Related:** task 391 (this module), task 428 (`08599f7`, the collision), 462 (the patch that makes
retirement safe — APPLIED, see that task).

## Decision, measured (not inferred)

**Retired.** Measured two things, in that order:

1. **The one documented trigger (Backspace on a nested item) is now caught upstream, structurally.**
   `list-backspace.ts`'s early-return guard (`!li.previousElementSibling && !parentLi`) does NOT skip
   a nested item at any position — first or non-first. Once its logic is guaranteed to run before
   Vditor's own corrupting branch (task 462's `patchFixListOutdent`, replacing the old capture-phase
   listener with a `fixList`-internal patch), there is no code path left by which a Backspace can
   reach the branch that produced the corruption. This isn't "probably fine" — `listOutdent` (what
   handles every nested case now) promotes the `<li>` itself; it has no code path that wraps content
   in a fresh `<p>`, which is the ONLY shape `repairTightLists` ever unwraps.
2. **No second trigger exists among the plausible candidates.** Instrumented via `__tightListCorruption()`
   (a local, dependency-free re-implementation of task 391's invariant check — checking for PERSISTENT
   corruption after settle, a stronger check than a firing counter, which would also count a transient a
   later re-spin already cleans up) in `media-src/e2e/list.spec.ts`, with `list-backspace.ts` wired the same way
   `finish-init.ts` wires it in production (`?fix=1`). Zero corruption across: Backspace on a nested
   first item (IR + WYSIWYG), Backspace on a nested non-first item, Tab-indent, Shift+Tab-outdent, and
   Enter-splitting a nested item. Paste was NOT re-tested — see "Note on the paste angle" below, which
   already rules it out by a different argument (narrows the unwrap, doesn't trigger it). Toolbar
   bullet↔numbered toggle was already tested clean by task 391 itself ("stays tight" from a fresh
   doc) and is unaffected by this task's changes, so also not re-tested.

**What was NOT run:** the real-VS-Code instrumented count this task originally asked for
(`list-tight.spec.ts` with a debug counter) — blocked by a hard session constraint (no real-VS-Code
runs; team-lead runs them). Handed off instead: re-running `test/vscode-e2e/list-tight.spec.ts`
(trimmed — the merge-based tests were rewritten to assert the NEW outdent behaviour instead, see the
file) and `list-backspace.spec.ts` against the built patch is the real-webview confirmation for both
461 and 462 in one run. The chromium-harness measurement above is real Vditor + real Lute, just not
inside VS Code's webview host — faithful for this specific question (pure keydown/DOM logic, not
CSS/CSP/webview-pipeline-dependent), per AGENTS.md's own scoping of what the harness can and can't
stand in for.

## What's queued for retirement (NOT yet done — see Status)

- `media-src/src/list-tight.ts` (source) — to be deleted AFTER the paired L3 run confirms.
- `media-src/src/list-tight.test.ts` (unit tests) — to be deleted with it.
- `finish-init.ts`'s `import { observeTightLists } from './list-tight'` and
  `observers.set('tight-lists', observeTightLists(() => app))` — exact diff sent to team-lead; this is
  the edit that constitutes "removing the observer" for run #2 of the pair (the file `list-tight.ts`
  itself can stay on disk, unwired, through that run — only needs deleting once run #2 is green).
- `test/vscode-e2e/list-tight.spec.ts` — already rewritten (not deleted wholesale, this part IS done).
  Its merge-based tests (which asserted the OLD, inferior "merges then gets repaired" behaviour) were
  rewritten to assert the NEW outdent behaviour instead; its loose-list-safety test and its paste-race
  test were kept as general regression nets (the invariant "a tight list stays tight" and "paste
  survives" still matter even though the enforcement mechanism changed), matching the pattern task 428
  used for `list-enter-start.spec.ts` (keep a spec as a NET for behaviour the fork depends on but
  doesn't own).

## What's still pending

The paired real-VS-Code run (team-lead's protocol, see task 462's Status for the exact commands):
run #1 with the patch applied and the observer still wired (baseline — proves the `fixList` patch
alone doesn't break anything), then the `finish-init.ts` edit above, then run #2 with the observer
removed (isolates this task's actual claim). Only once BOTH are green does `list-tight.ts` get
deleted.

## Why this exists

`list-tight.ts` (task 391, commits `1c9ef0d` + `a164aa2`) installs a `MutationObserver`
(`repairTightLists`) that repairs a list which has silently gone **loose** — an item's content
getting wrapped in `<p>`, which is a structural CommonMark change, not whitespace noise.

Per its own header, the **only measured trigger** is *Backspace at the start of a nested item*: it
merged the item into its parent and left the merged text paragraph-wrapped.

Task 428 (`08599f7`, 2026-07-30) then shipped `list-backspace.ts`, which intercepts **exactly that
keystroke** in a capture-phase listener and outdents instead of merging — `list-backspace.ts:123-125`:

```ts
if (parentLi) {
  listOutdent(vditor as never, li, range, li.parentElement as HTMLElement)
```

If the merge no longer happens, the corruption `repairTightLists` exists to repair no longer
happens either, and the observer is dead code running on every DOM mutation.

**The cross-reference is also now wrong:** task 428 says of 391 *"unrelated to this task's UX-parity
concern"*. They collide.

## The trap this task exists to avoid

`test/vscode-e2e/list-tight.spec.ts` presses a real Backspace on a nested bullet and asserts the list
stayed tight. **After task 428 that spec can pass without the observer doing anything** — because
`list-backspace.ts` prevented the loosening upstream. A green spec is therefore NOT evidence the
observer is load-bearing. Do not skip to "tests pass, keep it".

## Steps

- [x] Instrument `repairTightLists`'s return count — done via a probe HOOK
      (`window.__tightListCorruption()`, `media-src/e2e/list-harness.ts`) rather than a webview-log
      flag: re-implements task 391's invariant check locally as a pure DETECTOR (not calling
      `repairTightLists` itself, so this probe has zero dependency on `list-tight.ts` and keeps working
      after it's deleted), so a spec can check "is there persistent corruption right now" after any
      operation — a stronger check than a firing counter (see "Decision" above for why).
- [x] Run `xvfb-run -a npm --prefix test/vscode-e2e test -- list-tight.spec.ts` and record whether
      the count is ever non-zero. **RUN by the lead 2026-07-31, with the module already deleted:
      4/4 green** (`--retries=0`, timings in Status above). Zero corruption in the real webview with
      nothing left to repair it — the leg that actually discriminates. The implementing agent could
      not run this (hard constraint: no real-VS-Code runs by it) and measured the chromium harness
      (`media-src/e2e/list.spec.ts`, 8/8) instead; both layers agree.
- [x] Same for the WYSIWYG half that commit `a164aa2` added — covered by the harness's WYSIWYG
      nested-first-item test, zero corruption.
- [x] If it never fires: check the module's own speculative claim... — checked Tab, Shift+Tab, and
      Enter-split as the plausible "any code path that block-wraps an item" candidates; none trigger
      it once `list-backspace.ts`'s broader guard (task 462) runs first. Paste and bullet↔numbered
      toggle were already ruled out (see module's own header and task 391 respectively) and not
      re-tested.
- [x] **Decide and record:** retired — see "Decision" and "What was retired" above.
- [x] Fix task 428's "unrelated to task 391" note either way — corrected in task 428.

## Note on the paste angle — do not repeat this mistake

An earlier reading of commit `a164aa2` took paste to be a *second corruption trigger* (which would
make the observer necessary regardless). It isn't: the commit narrows the unwrap to "exactly one
`<p>`" so that a genuine two-paragraph **paste survives** the repair. Paste is a false-positive
hazard the repair must not damage, not a source of loose lists.

## Verification

The counter was observed (value recorded in this file), not inferred. If the module is retired:
`npm test`, `node build.mjs`, `npm run lint:ci`, and the real-VS-Code list specs green with the
module gone.
