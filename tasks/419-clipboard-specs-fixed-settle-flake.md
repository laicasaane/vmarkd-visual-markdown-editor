# Task 419 — Two clipboard/cut e2e specs are timing-fragile (fixed `settle`, not poll-until-stable)

**Status:** 📋 planned — test robustness · **Impact:** 🟡 med (flaky CI signal, not a product bug — but a flaky gate erodes trust in every red result) · **Origin:** integration pass, 2026-07-28

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

- [ ] Replace the fixed `settle(frame, 2500)` in both specs with a **poll-until-stable** wait on the
      actual post-condition each test cares about (the document text having reached its expected
      shape / the clipboard content having landed), with a generous overall timeout.
- [ ] Check whether the same fixed-`settle` pattern is used in other specs in this family — this is
      likely a copied idiom, so fixing two instances while leaving five is a partial win. Grep for
      `settle(` across `test/vscode-e2e/` and record which ones are load-bearing waits vs. genuine
      "let animations finish" pauses.
- [ ] Include `inline-code-gap.spec.ts:154` if it shares the pattern (it needed two retries once,
      which suggests it is *more* fragile, not less).

## Out of scope

- Any change to clipboard/cut PRODUCT behaviour. These specs pass on retry — the behaviour is
  correct; only the wait is wrong. If a fix requires touching `patchCutDeleteSync` or
  `patchClipboardCollapsed`, stop: that would mean the diagnosis above is wrong and this task needs
  reopening as a product bug, not a test fix.
- Raising Playwright's retry count to paper over it. Retries hide the signal; the point is to make
  the first attempt reliable.

## Verification

- [ ] Both specs pass **on the first attempt**, not on retry, across at least 3 consecutive runs —
      including at least one run under deliberate machine load, since that is the condition that
      exposes the fixed delay.
- [ ] The polling wait fails *fast and clearly* when the post-condition genuinely never arrives
      (i.e. it must not turn a real regression into a silent timeout with an unhelpful message).

## See also

- `test/vscode-e2e/clipboard-collapsed.spec.ts`, `test/vscode-e2e/cut-selection.spec.ts`,
  `test/vscode-e2e/inline-code-gap.spec.ts`.
- Tasks [385](385-clipboard-collapsed-caret-guard.md) / [387](387-cut-merge-boundary-paragraphs.md) /
  [393](393-paste-over-selection.md) (the clipboard behaviour these specs pin — correct, not at fault).
- `AGENTS.md` already notes this suite is occasionally racy; this task is about removing one concrete,
  identified cause rather than accepting that as permanent.
