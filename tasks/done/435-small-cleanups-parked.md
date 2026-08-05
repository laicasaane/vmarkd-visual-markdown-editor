# Task 435 — Two small cleanups parked from the `/simplify` pass

**Status:** ✅ **DONE — both done 2026-07-29.** ·
**Impact:** ⚪ nil at runtime; readability/drift only · **Origin:** `/simplify` reuse + altitude
reviews, 2026-07-29

Both were found by the branch-wide cleanup pass and deliberately left out of it: one was
pre-existing debt that predates the branch, the other was too small to be worth the churn that day.
They were recorded so they were a decision, not an oversight — and then done on request.

- [x] 1. `echarts-fit.ts` + `markmap-fit.ts` use the shared `debounce()`
- [x] 2. the uploaded-file markup table moved out of the dispatcher into `upload-handler.ts`

## 1. Hand-rolled trailing debounce instead of `debounce.ts`

`media-src/src/echarts-fit.ts` and `media-src/src/markmap-fit.ts` each open-code the same
trailing-debounce block:

```ts
let trailing = 0
win.addEventListener('resize', () => {
  win.clearTimeout(trailing)
  trailing = win.setTimeout(fit, TRAILING_MS) // 120
})
```

`media-src/src/debounce.ts` already provides this and is already used by `responsive-tables.ts`.

**Why it was parked:** the pattern predates this branch — it is not something these 50 commits
introduced — and `markmap-fit.ts` was not touched by the branch at all, so fixing only the other half
would have left the pair inconsistent.

**Done:** both swapped, together, so the pair stays consistent. The semantics were checked first and
do match exactly — `debounce.ts` is trailing-only and clears the pending timer on each call, which is
what both files hand-rolled. Two things deliberately NOT changed:

- echarts-fit stays on a **window `resize` listener**, and markmap-fit stays on window `resize` ONLY
  (never a Mutation/ResizeObserver) — the flicker/0×0-collapse traps both files document.
- markmap-fit keeps its **dual cadence**: only the SETTLE half is the shared debounce; the LIVE
  per-rAF re-fit is untouched, so the tree still tracks a drag instead of snapping at the end.

One knowing seam: `debounce()` schedules on the module realm's `setTimeout`, not the injected
`win`'s. In the webview they are the same window, and `fit()` reads `win.document` either way — noted
in a comment at both call sites.

## 2. `handleUploaded` branches on `.wav` inside the generic dispatcher

`media-src/src/message-router.ts` (`handleUploaded`) inlines a `.wav`-vs-everything-else branch to
pick the inserted markup, rather than delegating to a table-driven inserter. `upload-handler.ts`
already owns the OUTGOING upload path but has no "markup for this uploaded kind" counterpart.

**Why it was parked:** two branches, ~10 lines. But it was the one per-file-type special case sitting
directly in the generic dispatch function — the seam that would accrete an `if` per embeddable kind.

**Done:** `uploadedMarkup(href)` now lives in `upload-handler.ts`, next to the OUTGOING half of the
same feature, driven by an `EMBED_BY_EXT` table; `handleUploaded` is a one-line loop over it. A new
embeddable kind is a row. Unit-tested in `upload-handler.test.ts` (audio, fallback, no-extension
href).

One intentional behaviour change, small enough to fold in: extensions now match
**case-insensitively**. `endsWith('.wav')` meant a `.WAV` upload came back as an image link.

## Related
The rest of that pass landed in `021d4aa` (STDLIB descriptor, `insertAfterStart`,
`d2ConfigFromOptions`, `src/message-shape.ts`, shared `ZWSP`, dead d2 colour walks, the
FONT_SIZE/PROSE_LH pin). The other two parked findings have their own files:
[434](434-issemanticnoop-whole-doc-reserialize-per-tick.md) and the sprite-composite note in
[437](../437-pretty-icons-in-dark-mode.md).
