# Task 474 — Split `d2-render.ts` and `d2-refine.ts` (the content refactor 460 deliberately excluded)

**Status:** 📋 OPEN — not started · **Impact:** 🟡 the single highest-value readability win available
in this repo, and now the only one with a hard number behind it · **Origin:** filed 2026-07-31 to
close the loop left open by [task 460](done/460-module-decomposition-physical-move.md)'s non-goals, which
said this "is the single highest-value readability win available" and "file it as its own task
(**not yet filed**)". Now filed, with [task 469](done/469-housekeeping-sweep.md)'s measurements as
evidence. **Related:** 460 (must not overlap — see Ordering), 469 §5a, ADR-0005.

## Why this is its own task, not part of 460

Task 460 is a **pure relocation**: move files into folders, rewrite imports, change nothing else.
Its whole commit discipline rests on "any diff that is not a move or a path rewrite is out of
scope", which is what makes a ~250-file change reviewable at all. Splitting a 2429-line file is a
*content* refactor. Mixing the two would destroy that discipline and lose `git blame` on the two
largest files in the repo simultaneously.

## The measurement — this used to be an intuition, now it is a number

Task 469 §5a enabled Biome's `complexity/noExcessiveCognitiveComplexity` (SonarSource's Cognitive
Complexity algorithm) at threshold 15 and measured the whole tree. These two files dominate it:

| file | lines | functions over CC 15 | worst |
|---|---|---|---|
| `media-src/src/d2-render.ts` | 2429 | 6 | **CC 255** at `:1328` |
| `media-src/src/d2-refine.ts` | 1674 | **23** | CC 72 at `:682` |
| `media-src/src/astar.ts` | 307 | 1 | CC 128 at `:39` |

For scale: CC 255 in one function, against a threshold of 15, in a repo whose *entire* tree has 107
functions over that line. `d2-refine.ts` alone holds 23 of them. This independently confirms task
460's own non-goal note that these two files are the real readability problem — 460 called it an
intuition; it is now measured.

`astar.ts` is listed because it is part of the same d2 layout cluster and its single CC-128 function
is the second-worst in the repo, but it is 307 lines and may well be *inherently* complex (A* with
tie-breaking is not obviously reducible). Decide it on its merits; do not assume it belongs.

## Ordering — must not overlap with 460

Same constraint 469 §4 carries, for the same reason: 460 rewrites every import in ~250 files. A
content split that creates new modules while that codemod is running guarantees conflicts in exactly
the files it touches. **Either 474 waits for 460, or 460 waits for 474 — not both at once.**

Recommended: **after 460.** Once the d2 cluster lives in `media-src/src/diagrams/d2/`, a split has an
obvious home for the extracted modules, and 460's phase-4 meta-test already locks the layering down
so a badly-placed new module fails a test instead of rotting quietly.

## Scope

- [ ] **Do not start by splitting.** Start by reading `d2-render.ts:1328` and the six other
      over-threshold functions and writing down *why* each is complex. High cognitive complexity from
      a long `switch` over diagram shapes is a very different problem from high complexity from
      interleaved concerns, and only the second is fixed by extracting modules. Record the finding
      before touching anything.
- [ ] Split along the seams that reading finds, not along line counts. A 2429-line file cut into
      three 800-line files that still each hold a CC-50 function has not improved anything.
- [ ] **Remove the `biome-ignore` suppressions as functions come under the threshold**, rather than
      carrying them into the new files. Task 469 landed 107 inline suppressions as a deliberate debt
      under the user's option (b) decision; the ~30 in these three files are the largest single block
      of it, and this task is the intended way to pay it down. A split that relocates suppressions
      instead of retiring them has missed the point.
- [ ] Behaviour must not change. The d2 layout engine has extensive golden/metric coverage
      (`--metrics` in the d2 harness, the `@visual` goldens, `d2-*.spec.ts`) — use it as the
      before/after oracle and say explicitly which artifacts you compared.

## Verification

- [ ] `npm test` and the d2 harness green before and after, with the SAME layout output — this is a
      refactor, so byte-identical rendered SVG for the fixture set is the bar, not "looks right".
- [ ] Real-VS-Code d2 specs green (per AGENTS.md, d2 is a renderer feature).
- [ ] Re-run the complexity scan and record the new counts here. **Use `grep -a`** — `d2-render.ts`
      reads as a binary file to `grep`/`file` (some byte trips the heuristic), so a plain `grep -c`
      silently returns nothing rather than erroring, on the single worst-offending file in the repo.
      This trap is documented in 469 §5a and it will bite anyone counting by hand.
