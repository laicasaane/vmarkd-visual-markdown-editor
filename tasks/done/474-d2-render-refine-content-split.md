# Task 474 — Split `d2-render.ts` and `d2-refine.ts` (the content refactor 460 deliberately excluded)

**Status:** ✅ DONE (2026-08-11) · **Impact:** 🟡 the single highest-value readability win available
in this repo, and now the only one with a hard number behind it · **Origin:** filed 2026-07-31 to
close the loop left open by [task 460](460-module-decomposition-physical-move.md)'s non-goals, which
said this "is the single highest-value readability win available" and "file it as its own task
(**not yet filed**)". Now filed, with [task 469](469-housekeeping-sweep.md)'s measurements as
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

- [x] **Do not start by splitting.** Start by reading `d2-render.ts:1328` and the six other
      over-threshold functions and writing down *why* each is complex. High cognitive complexity from
      a long `switch` over diagram shapes is a very different problem from high complexity from
      interleaved concerns, and only the second is fixed by extracting modules. Record the finding
      before touching anything.
- [x] Split along the seams that reading finds, not along line counts. A 2429-line file cut into
      three 800-line files that still each hold a CC-50 function has not improved anything.
- [x] **Remove the `biome-ignore` suppressions as functions come under the threshold**, rather than
      carrying them into the new files. Task 469 landed 107 inline suppressions as a deliberate debt
      under the user's option (b) decision; the ~30 in these three files are the largest single block
      of it, and this task is the intended way to pay it down. A split that relocates suppressions
      instead of retiring them has missed the point.
- [x] Behaviour must not change. The d2 layout engine has extensive golden/metric coverage
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


## Findings — why each over-threshold function is complex (read 2026-08-11, BEFORE touching anything)

Current measured CC (biome scan of all three files, threshold 15, suppressions stripped): **30
offenders — d2-render.ts 5, d2-refine.ts 23, astar.ts 2.** (Task file's original table said 6/23/1
at 2429/1674/307 lines; the files have since grown to 2638/1850/318 and the counts moved with them.)

### d2-render.ts — 5 offenders

| CC | fn | diagnosis |
|---|---|---|
| 255 | `toSVG` (:1480) | **NOT a long switch.** The whole SVG renderer in one function scope: ~15 nested closures sharing `layout`/`style`/`sketch`/`parts`. Interleaved concerns in one body — (a) prologue + style + container-level fill cascade, (b) edge-route prep (`obstacles`/`nodeBoxById`/`pairCount`/`rawSegs`/`drawn`), (c) label placement + 6-pass coordinate-descent deconfliction (`boxOf`/`boxesOverlap`/`cornerList`/`segList`/`staticBoxes`/`fixedBoxes`/`lone`/`order`), (d) canvas tight-bbox sizing + near-shape placement + viewBox + label mask, (e) page bg, (f) background pass, (g) edge draw pass, (h) foreground pass holding the ~20-case shape switch (person/image/text/code/circle/oval/diamond/hexagon/cylinder/queue/cloud/parallelogram/document/page/stored_data/package/step/callout/default — each case carries bespoke path geometry), (i) decorations pass, (j) assembly. Fixable by extraction — `drawGrid`/`drawSqlTable`/`drawClass` are ALREADY top-level functions at the file's end, proving the pattern. |
| 59 | `layoutDagre` (:892) | Sequential sub-phases (classify → node reg → edge reg → dagre.run → rect extraction → near append → polyline extraction) PLUS the task-104 container-endpoint proxy workaround (`proxyOf`/`rerouted`/`chopAtRect`) threaded through edge registration and extraction. Not one hard algorithm; 4 record shapes built in one scope. |
| 42 | `cands.forEach` (:1745, inside toSVG) | The label-candidate cost search: per candidate, 4 cost components (overlap/static/bend/line) scanned against 4 collections. A scoring loop — hoistable as `scoreCandidate(c, d, ctx)`; the collections are already module-hoistable data. |
| 25 | `columnFKRoute` (:1535, inside toSVG) | Column-to-column FK routing; branchy side-selection (stacked-vs-side-by-side, right/left, riser placement) + `rowY` computation. Extract the side-selection decision. |
| 16 | `drawn` map (:1603, inside toSVG) | Per-edge path prep: parallel-pair anchor detection, otherSegs collection, FK-vs-simplified route choice, masked flag. Moderate; extract per-edge route computation. |

**Seam verdict (d2-render):** the closure web inside `toSVG` is the problem, not the shape switch
per se. The switch's branches are small; each is a candidate for a `draw<Shape>` function following
the existing `drawSqlTable`/`drawClass`/`drawGrid` pattern. Everything else inside `toSVG` splits by
pipeline stage (prologue / route prep / label placement / canvas sizing / background / edges /
foreground / decorations) — each stage becomes a top-level function taking an explicit context
object (or `layout`, `style`, `sketch`, `parts` threaded through). `labelAnchor` + the path/arrowhead
helpers (`splinePath`/`polyPath`/`roundedPolyPath`/`arrowhead`/`labelHalo`/`arrowheadLabel`/
`labelCandidates`) are already top-level in the same file — they can move to a geometry module,
which ALSO breaks the d2-refine → d2-render import (d2-refine imports `labelAnchor`).

### d2-refine.ts — 23 offenders

**Uniform pattern — complexity from interleaved guard logic + duplication, not from one hard
algorithm.** Each pass is one moderate loop over candidate moves, plus 2–6 nested guard closures
that close over `layout`. The guards are VARIANTS OF THE SAME GEOMETRIC TESTS, duplicated across
passes: `segHitsBox` (3× with different skip/margin semantics — monotonize/deleteBends/
segHitsBoxMargined), `hitsBox` (2×, same body), `inside` (2×), `edgeCross`/`edgeCollinear`/
`collinear`/`collOv`/`edgeRuns` (5 near-duplicate collinearity/crossing counters), `xov` (2×),
`hugsCont`/`jogClear`/`runClearances`/`wallDist`-family (container-wall avoidance). Worst:

| CC | fn | diagnosis |
|---|---|---|
| 72 | `detourContainers` | container-crossing detection + port-preserving jog insertion (3 branch forms: first-segment port / last-segment port / interior shift with L-corner re-orthogonalisation) + revert guard |
| 69 | `deOvershoot` (inner) | candidate-collapse search; per-candidate 4 guard closures evaluated (hitsBox/collOv/hugsCont/countCrossings) + longest-parallel tiebreak |
| 59 | `separateKissingJogs` | pairwise jog-kiss detection + move-or-other search with 2 guards |
| 58 | `bundleSiblings` | same-label jog-raise with jogClear/collinear/hitsBox guards + incremental Y search |
| 56 | `compactBackRings` | ring compaction; `slide` (step-until-guard over 2 axes, itself CC 56) + outerVertIdx + nesting order |
| 54 | `deleteBendsEndpoints` | ladder-collapse with 3 guard counters (objIntersects/edgeCross/edgeCollinear) + shared-corner map |
| 49 | `alignChannels` | channel-snap search with wall-nudge + monotonicity + placed-seed guards |
| 41 | `monotonizeEdges` (inner) | per-edge monotonize with borderRuns/edgeRuns/segHitsBox guards |
| 39 | `bundleSourceSiblings` | peel staggering with wall avoidance + collinear-overlap guard |

**Seam verdict (d2-refine):** three moves pay down the whole file: (1) **dedupe the guard
closures into one `refine-guards` module** (each variant takes `layout`/context as a parameter —
they're pure functions of geometry, no pass-specific state); (2) hoist each pass's remaining local
closures to module scope, parameterized; (3) then each pass body is just its candidate loop, most
under threshold. The pipeline (`refineLayout` + `__test`) stays as the orchestrator. Passes can
also be grouped by domain into sub-modules (layer-gaps, bends, bundles, rows) — but the guard
dedup is the load-bearing move; without it, relocating passes would just relocate suppressions
(the failure mode the task calls out).

### astar.ts — 2 offenders

| CC | fn | diagnosis |
|---|---|---|
| 128 | `astar` (:40) | The WHOLE A* in one function: grid construction (xs/ys/densify), blocked-cell marking, spatial edge index (eBuckets/eStamp), inline binary heap (hpush/hpop), the search loop with the 5-term per-neighbor cost (turn/ec/ep/cp/epp), path reconstruction + collinear dropping. Multi-phase; decomposable into `buildGrid()`/`buildEdgeIndex()`/`search()`/`reconstruct()` WITHOUT touching the algorithm (the heap + cost terms are the ported, validated core — do not re-engineer). |
| 19 | `hpop` (:186) | Binary-heap sift-down; the branching IS the heap invariant. **Inherent** — keep this suppression (with its reason), it is not worth restructuring a correctness-critical port for 4 points over the line. |

**astar verdict:** belongs in the split — it is 318 lines and already its own module; decompose its
one function. `hpop` stays suppressed with an honest reason.

## Completion — 2026-08-11

- `astar.ts` split into `buildGrid`, `buildEdgeIndex`, `stepCost`/edge-penalty helpers, heap search,
  and `reconstruct`; validated A* ordering, costs, fallbacks, and heap tie-breaking are unchanged.
- CC after suppression removal: `d2-render.ts` **0**, `d2-refine.ts` **0**, `astar.ts` **1 inherent**
  (`hpop`, CC **19**, retained with its heap-invariant reason). No other suppression remains in these files.
- Byte-identical SVG oracle: `/tmp/d2-baseline/MANIFEST.before-split.sha256` equals the fresh
  `/tmp/d2-baseline/MANIFEST.sha256` for all **12** fixture/engine artifacts (4 fixtures × dagre/vmarkd/elk).
- Verification: d2 unit **239/239**, Chromium e2e **463 passed / 5 skipped**, full unit **2864/2864**,
  real-VS-Code D2 **19/19**, `node build.mjs` PASS, Biome d2 PASS, and `npm run quality` PASS in every stage.
  Typecheck has no `diagrams/d2` errors; it still reports the six pre-existing `format-word-expand.test.ts`
  errors documented under task 506.
