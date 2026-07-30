# Task 419 — Two clipboard/cut e2e specs are timing-fragile (fixed `settle`, not poll-until-stable)

**Status:** ✅ DONE (2026-07-30) · **Impact:** 🟡 med (flaky CI signal, not a product bug — but a flaky gate erodes trust in every red result) · **Origin:** integration pass, 2026-07-28

## Problem

Two real-VS-Code specs fail on attempt 1 and pass on retry, reproducibly across independent runs:

- `test/vscode-e2e/clipboard-collapsed.spec.ts:230` — "a real selection still cuts normally"
- `test/vscode-e2e/cut-selection.spec.ts:298` — "IR: cutting a selection spanning THREE paragraphs
  merges the remainder into ONE, loses nothing"

Observed across **three** separate `test:vscode:fast` runs on 2026-07-28: twice under machine load
(several agents working concurrently) and **once on a deliberately quiet tree with nothing else
executing**.

**Per-spec recurrence data — start with the most reliable reproducer:**

| Spec | Contended run | Quiet run | Notes |
|---|---|---|---|
| `cut-selection.spec.ts:298` | flaked, 1 retry | **flaked, 1 retry** | **Best reproducer.** Recurred with a *byte-identical* failure signature (same wrong-merge text) and the same single-retry recovery in both conditions. |
| `clipboard-collapsed.spec.ts:230` | not seen | flaked, 1 retry | Only surfaced on the quiet tree — so load is not a precondition. |
| `inline-code-gap.spec.ts:154` | flaked, **2 retries** | passed first attempt | Most *severe* when it fires (needed two retries) but least reproducible. Lowest priority; include only if it shares the pattern. |
| `d2-label-halo.spec.ts:38` | flaked, 1 retry (load avg ~10-12) | — | **Not a clipboard spec — same fixed-`settle(frame, 12_000)` pattern, a THIRD family member.** Confirmed not a product regression: the same-session diff to `d2-render.ts` (tasks 394/396/421) touched only `fill`/`stroke` colour VALUES on emit sites that already existed, never the emit structure, count, or timing. Converted to `expect.poll` on the real post-condition (edge-label count) during the 2026-07-28 session — now passes in ~12s instead of racing a fixed 12s delay; kept here as evidence the fixed-`settle` idiom is copied well beyond the two clipboard specs this task was scoped around. |

Two things follow from this table, and both matter for whoever fixes it:
1. **Two of the three flaked on a QUIET tree**, so "it was just agent contention" does not explain
   this away — machine load worsens it but is not the cause.
2. **`cut-selection.spec.ts:298` reproducing byte-for-byte across both conditions is the strongest
   single argument that this is test-timing fragility rather than a product race.** A genuine race
   in product code would be expected to shift shape or severity between a loaded and an idle
   machine, not fail identically and recover identically every time.

**This is test fragility, not a product race — attributed, not assumed.** The integration pass
checked specifically:
- Both specs exercise clipboard/cut code from tasks 385/387/393 (`patchCutDeleteSync`,
  `patchClipboardCollapsed` in `media-src/esbuild-shared.mjs`), which predate the 2026-07-27/28
  refactor session entirely.
- `esbuild-shared.mjs` *did* change that session, but only inside `patchEchartsThemeInit`
  (task 418's per-file animation guard). `patchCutDeleteSync` appears nowhere in that diff.
- None of the other files changed that session (host decomposition/405, engine split/409,
  cache key/408, message routing/148) is anywhere near the clipboard path.
- A genuine data-corruption or product race would not recover identically on a single retry, every
  time, in both contended and quiet conditions.

**The mechanism:** both specs use a fixed `settle(frame, 2500)` delay after `Ctrl+X` rather than
polling until the document state is stable. A fixed delay is a bet on machine speed; it loses under
any load variance, and it will keep losing more often as the suite and the fixtures grow.

## Scope

- [x] Replaced every settle-then-read-then-assert triple in `clipboard-collapsed.spec.ts` and
      `cut-selection.spec.ts` with `expect.poll(() => docText/readClip(...), { message, timeout:
      10_000 })` — not just the two named lines. Once in the files, `cut-selection.spec.ts` turned
      out to have the idiom guarding **five** separate assertion points across its four tests (not
      just the one named at `:298`), and one of them (the double-undo in the multi-block test) had
      a fixed `settle()` between two mutating actions with NO read in between at all — that one was
      strengthened to poll for the FIRST undo's effect (typed char gone) before firing the second
      undo, not just left as a blind sleep. Where a settle guarded a UI transition with no
      immediately-following read/assert (mode-switch waits, the post-boot settle in `boot()`), it
      was left alone — converting those risked inventing a new signal to poll for something that
      isn't actually what the task's flake data implicates.
- [x] Grepped `settle(` (and the inline `setTimeout(r, N)` variant with no named helper) across
      `test/vscode-e2e/`. Findings:
  - `clipboard-collapsed.spec.ts`, `cut-selection.spec.ts`, `inline-code-gap.spec.ts` — same family,
    all fixed (see below). `d2-label-halo.spec.ts` — already fixed in the 2026-07-28 session
    (`.poll(` on the edge-label count, cited in this file's own Problem section); left untouched.
  - Genuine "let it settle" pauses that are NOT load-bearing waits on an assertion (left as
    sleeps, not converted): the post-boot `settle(frame, 1500)` in every file's `boot()` (before any
    interaction happens, nothing to poll for yet) and the post-mode-switch settle inside
    `switchToWysiwyg()` (in `inline-code-gap.spec.ts`, called from two tests — the ONE call site
    that immediately reads `docText` after it, in the first test, now polls at the call site
    instead, which covers the same ground without touching the shared helper).
  - Did **not** do a suite-wide census beyond this family (945s of sleeps across 145 files per
    task 447/451) — that's task 451's scope, not this one; this task's grep was specifically "the
    same fixed-settle pattern in specs in this family," which the clipboard/cut/inline-code-gap
    trio satisfies.
- [x] Included `inline-code-gap.spec.ts:154` — it shares the exact pattern. Converted it, and while
      in the file also converted its three sibling tests (they share the identical idiom; one of
      them — "typing next to glued inline code…" — had ALREADY been hand-tuned from a 1500ms to a
      4500ms fixed delay chasing "an observed flake" instead of fixing the actual bet-on-machine-speed
      cause, which is exactly the failure mode this task exists to eliminate).

## Out of scope

- Any change to clipboard/cut PRODUCT behaviour. These specs pass on retry — the behaviour is
  correct; only the wait is wrong. If a fix requires touching `patchCutDeleteSync` or
  `patchClipboardCollapsed`, stop: that would mean the diagnosis above is wrong and this task needs
  reopening as a product bug, not a test fix.
- Raising Playwright's retry count to paper over it. Retries hide the signal; the point is to make
  the first attempt reliable.

## Verification

- [x] Ran all three specs together (`clipboard-collapsed.spec.ts cut-selection.spec.ts
      inline-code-gap.spec.ts`, 11 tests) **3 consecutive times**, 2026-07-30:
      run 1 = 11 passed (2.0m), run 2 = 11 passed (2.0m), run 3 = 11 passed (2.5m) — **every test,
      every run, on the first attempt, zero retries.** Previously (this same session's FAST-tier
      run, before this fix) `cut-selection.spec.ts:346` flaked once and needed a retry with the old
      fixed-`settle` code — same file, same mechanism, direct before/after evidence.
  - **Partial credit on "deliberate machine load":** I did not run a dedicated stress harness
    alongside these runs. All 3 runs happened on a machine with genuine ambient load throughout this
    session — multiple other agents were concurrently active in this same repo (building, running
    their own tests, writing files) the entire time, which is the same "several agents working
    concurrently" condition the Problem section's contended-run data was gathered under. I'm not
    ticking this as a fully-satisfied deliberate-load test since I didn't orchestrate a synthetic
    load generator; the ambient multi-agent load is the closest available approximation and it did
    not reproduce the flake even once.
- [x] **Corrected after a self-review caught two problems with the first pass:**
  1. Every `expect.poll(...)` originally set an explicit `timeout: 10_000` — below the project's
     own `expect: { timeout: 20_000 }` default (`playwright.config.ts`). Removed the explicit
     overrides everywhere so all polls inherit the 20s project default instead — generous headroom
     over the 1.5–2.5s fixed delays being replaced (and over the `inline-code-gap` case that had
     already been hand-bumped to 4500ms chasing this exact flake), without inventing a second timeout
     policy that could itself go stale.
  2. The three compound-condition polls (`clipboard-collapsed.spec.ts` "a real selection still cuts
     normally", `cut-selection.spec.ts` "a selection crossing from a paragraph into a list…",
     `inline-code-gap.spec.ts` "typing next to glued…") originally combined their conditions with
     `&&` into a single boolean and asserted `.toBe(true)` — which on a genuine timeout prints only
     `expected true, received false`, not which condition failed. **This violated the task's own
     "fails fast and clearly" verification bullet**, caught before checking the box, not after.
     Rewrote all three to return a named `{condition: boolean, ...}` object and assert
     `.toEqual({...all true})`, so a timeout's diff names the exact failing condition.
- [x] **Verified the fix for real, not just by inspection**: in `clipboard-collapsed.spec.ts`'s "a
      real selection still cuts normally" test, temporarily changed the `zuluSurvives` check to look
      for a string that can never appear (`'Anchor line ZULU-TEMP-419-REDCHECK'`), ran that one test
      solo. It failed after the full 20s × 3 attempts (retries: 2) with:
      `- "zuluSurvives": true, + "zuluSurvives": false` in the diff, with `bravoGone: true` and
      `firstLineGone: true` shown passing alongside it — exactly pinpointing the one failing
      condition, not a bare `expected true`. Reverted immediately; `grep -n ZULU` confirms only the
      original string remains.
- [x] Re-ran all 11 tests once more after both fixes: **11 passed, zero retries** (4.0m — some
      individual tests took noticeably longer than the earlier passes, e.g. one at 50.8s vs ~11s
      before, consistent with this session's observed machine-load variance; still comfortably
      inside the inherited 20s-per-poll / 90s-per-test budget and none needed a retry).
- [x] `npm test` (`npx vitest run --config test/vitest.config.ts`) unaffected (test-only changes to
      `test/vscode-e2e/`, no `src/` or `media-src/` edits) — confirmed green earlier in this session
      (2066 passed) after task 420; nothing in `src/`/`media-src/` changed since.
- [x] `npx tsc --noEmit -p test/vscode-e2e` — "No errors found".
- [x] `./node_modules/.bin/biome check` on the three touched spec files — clean (after
      `--write` auto-formatted a few lines each pass).

## See also

- `test/vscode-e2e/clipboard-collapsed.spec.ts`, `test/vscode-e2e/cut-selection.spec.ts`,
  `test/vscode-e2e/inline-code-gap.spec.ts`.
- Tasks [385](385-clipboard-collapsed-caret-guard.md) / [387](387-cut-merge-boundary-paragraphs.md) /
  [393](393-paste-over-selection.md) (the clipboard behaviour these specs pin — correct, not at fault).
- `AGENTS.md` already notes this suite is occasionally racy; this task is about removing one concrete,
  identified cause rather than accepting that as permanent.
