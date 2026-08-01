# 364 — the screen jumps/scrolls when switching IR → Preview (worse with big diagrams)

**Status: ✅ FIXED** (product fix + new e2e suite + mutation-verified)

## Report

> "ekran skacze przy przełączaniu z ir na preview, szczególnie jak duży diagram jest … i ekran się
> przewija"

## What it was NOT

First hypotheses, all measured and all wrong — recorded so nobody re-walks them:

- **Not block sizing.** Per-block IR-vs-Preview heights are equal (10 of 13 d2 blocks differ by
  exactly 0px) and the document totals match (IR 748px = PV 748px on the d2 fixture). This is
  unrelated to task 362's 9px height delta.
- **Not the pin being too short.** Sampling the position every 0.5–5s after the switch shows it
  settles by ~1s and then never moves. `PREVIEW_PIN_MS` is not the problem.

## Measured symptom

Anchor = the top-level block sitting at the viewport top; how far it moves on IR → Preview:

| scroll position | drift |
|---|---|
| 30% | 79px |
| 50% | 210px |
| 75% | **783px** |

The drift GROWS with depth, which is why it reads as "the screen scrolls away".

## Root cause — the pin bailed on the preview's OWN growth

`pin()` holds the computed target for ~2s, recomputing each frame, and releases the moment the user
scrolls so it never fights them. Scrollbar drags fire no wheel/key event, so that release is detected
positionally: a `scroll` whose position isn't the value we just wrote ⇒ the user moved it.

But the preview is still GROWING while the pin runs — diagrams render async and the scroller went
from 12028px to 16686px within ~1s on the all-renderers fixture. That growth shifts `scrollTop` by
itself, the guard read it as user input, and the pin **abandoned the correction at whatever
half-rendered target it had computed**. The anchors were fine; nothing was applying them.

Fix (`media-src/src/preview-scroll-preserve.ts`): the positional bail now only counts when the
content height is UNCHANGED since our last write — growth is our own doing, not the user's. Genuine
input still releases instantly via the existing wheel/touch/keydown handlers.

```ts
if (!sc || Number.isNaN(lastWritten)) return
if (sc.scrollHeight !== lastHeight) return   // our own content still settling
if (Math.abs(sc.scrollTop - lastWritten) > 2) bailed = true
```

## Secondary finding — the dense anchors had silently stopped pairing

The module anchored on ALL top-level blocks, pairing the two panes **1:1 by index**, and fell back to
the ~22 sparse HEADING anchors when the counts differed. On the all-renderers fixture the counts DO
differ — IR 126 vs Preview 122 (IR carries a trailing edit paragraph and other structural nodes) — so
the dense path was never running, and the module's own header comment says the sparse path is exactly
what made "a tall diagram between headings land wrong" in the first place.

Now paired by longest common subsequence over coarse per-block signatures (`sigOf`/`pairBlocks`), so
IR-only nodes simply drop out and a future injected node cannot silently disable the dense path. The
heading fallback is still there but now logs to the Output channel instead of degrading in silence.

**Honest attribution:** this was NOT what the user was seeing. Measured in isolation, the pairing fix
alone left 750px of drift at 75%; the growth guard alone brought it to 6px. Keep it for accuracy
(6px → 1px) and robustness, not as the fix.

## Verification (mutation matrix, all-renderers fixture)

| variant | drift @50% | drift @75% |
|---|---|---|
| before any fix | 210px | 783px |
| LCS pairing only | 38px | 750px |
| growth guard only | 1px | 6px |
| **both (shipped)** | **0px** | **1px** |

Three round trips IR→Preview→IR now return to the exact starting offset (−146px → −146px; it crept
to −51px before).

## Tests

`test/vscode-e2e/mode-switch-parity.spec.ts` (new, 4 tests):
- the block sequences still pair densely (guards the precondition for dense anchors),
- the block you are reading stays put at **50%** and **75%** scroll — a perceptual metric, threshold
  120px. Deliberately NOT near-zero: `alignByHeadings` aligns the viewport CENTRE, so a top-anchored
  measurement keeps a small legitimate offset,
- three round trips do not creep.

Why a new file rather than extending `scroll-preserve.spec.ts`: that spec asserts only
`pvFrac > 0.3` after scrolling to 0.5, i.e. a jump of a fifth of the document passes as "preserved" —
it was green throughout this bug. Left in place (it covers the coarse case), but it is not the guard.

## Not done

- `scroll-preserve.spec.ts`'s loose `> 0.3` threshold was left as-is rather than tightened; the new
  spec supersedes it. Worth deciding later whether to keep both.
- The same `pin()` growth-vs-user ambiguity exists for `onLeavePreview` (Preview → IR, `EDIT_PIN_MS`
  400ms). The edit pane is already laid out so it does not grow, and round trips measured stable —
  but the guard is shared, so a future growing edit pane would hit the same class.
