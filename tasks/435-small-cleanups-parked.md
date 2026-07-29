# Task 435 — Two small cleanups parked from the `/simplify` pass

**Status:** 📋 **OPEN — filed, low value, do them only while already in the file.** ·
**Impact:** ⚪ nil at runtime; readability/drift only · **Origin:** `/simplify` reuse + altitude
reviews, 2026-07-29

Both were found by the branch-wide cleanup pass and deliberately left out of it: one is
pre-existing debt that predates the branch, the other is too small to be worth the churn today. They
are recorded so they are a decision, not an oversight.

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

**Why parked:** the pattern predates this branch — it is not something these 50 commits introduced —
and `markmap-fit.ts` was not touched by the branch at all, so fixing only the other half would leave
the pair inconsistent. Worth doing the moment either file is opened for a real change.

⚠ Check before swapping: `debounce.ts`'s timing semantics must match (trailing-only, same clearing
behaviour). The resize path is one of the two places where a behaviour change is visible as flicker —
see the `preview-gutter-echarts-fit` note that echarts-fit must stay on a WINDOW resize listener and
never a Mutation/ResizeObserver.

## 2. `handleUploaded` branches on `.wav` inside the generic dispatcher

`media-src/src/message-router.ts` (`handleUploaded`) inlines a `.wav`-vs-everything-else branch to
pick the inserted markup, rather than delegating to a table-driven inserter. `upload-handler.ts`
already owns the OUTGOING upload path but has no "markup for this uploaded kind" counterpart.

**Why parked:** two branches, ~10 lines. It is the one per-file-type special case sitting directly in
the generic dispatch function, so it is the seam that would accrete `if`s if audio/video/other
embeddable kinds are added — which is exactly when to do this, and not before.

## Related
The rest of that pass landed in `021d4aa` (STDLIB descriptor, `insertAfterStart`,
`d2ConfigFromOptions`, `src/message-shape.ts`, shared `ZWSP`, dead d2 colour walks, the
FONT_SIZE/PROSE_LH pin). The other two parked findings have their own files:
[434](434-issemanticnoop-whole-doc-reserialize-per-tick.md) and the sprite-composite note in
[431](431-pretty-icons-in-dark-mode.md).
