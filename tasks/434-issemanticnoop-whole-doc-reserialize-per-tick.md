# Task 434 — `isSemanticNoop` reserializes the WHOLE document on every edit-sync tick

**Status:** 📋 **OPEN — filed, deliberately not fixed.** · **Impact:** 🟡 unmeasured; one whole-doc Lute
pass per debounce tick while typing · **Origin:** `/simplify` efficiency review, 2026-07-29

## The finding

`WritebackController.syncToEditor` (`src/writeback-controller.ts:114`) calls
`isSemanticNoop(baseline, content, reW)` (`src/minimal-diff-writeback.ts:129`) on every debounced
edit-sync tick — `edit-sync.ts` posts `command:'edit'` on a 250 ms debounce, so ~4×/s while the user
is actively typing, on every document under the 100k-char `MINDIFF_CAP`.

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

## If this is picked up

1. **Measure first.** Time `reserializeWhole(content)` on a large real document and multiply by the
   tick rate; the finding is currently a reading of the code, not a number. If it is single-digit ms
   there is nothing here.
2. Any gate must be **sound, not heuristic** — it may only skip the check in cases where a semantic
   no-op is impossible by construction. A defensible one: run it only when the document could
   plausibly have returned to the baseline, i.e. gate on the editor's own undo/dirty signal rather
   than on document shape.
3. Ship it with `undo-dirty-probe.spec.ts` + the cut/paste specs green, and re-run them more than
   once — a single green pass on that set does not mean much.

## Related
`src/minimal-diff-writeback.ts`, `src/writeback-controller.ts`, `media-src/src/edit-sync.ts` (the 250 ms
debounce), task [419](419-clipboard-specs-fixed-settle-flake.md) (the flaky set that must verify it).
