# 494 — two D2 edges left running parallel ~11 px apart

**Status:** 🟢 IMPLEMENTED, awaiting the user's own look — opened 2026-08-03 from a user report on `data-flow-d2.md` (second block,
default `vmarkd` engine): the dashed `m2.resid -> lfp` riser runs alongside another vertical line
close enough to read as one thick line.

## Measured

| | vertical run A | vertical run B | gap |
|---|---|---|---|
| **`vmarkd`** (ELK + refine, default) | `m2.pseudo -> vault`, x = 622,4 | `m2.resid -> lfp` (dashed), x = 633,3 | **10,9 px** over 262 px |
| **`elk`** (raw, no refine) | same pair | | **24,9 px** |
| **`dagre`** | — | | no pair under 30 px |

So ELK spaced them at its own `elk.spacing.edgeEdge = 24` lane and OUR post-processing closed it.

Attributed with the `__refineTrace` diagnostic seam (snapshot after every pass in `refineLayout`) —
the shift happens in exactly one pass:

| pass | `m2.pseudo -> vault` riser |
|---|---|
| … `monotonizeEdges` | x = **648** |
| **`deleteBendsEndpoints`** | x = **612** (−36 px) |
| every later pass | unchanged |

**Why nothing stops it.** `deleteBendsEndpoints` (our port of D2's `deleteBends` 2nd pass) commits a
bend deletion unless it adds a box intersection, an edge crossing, or a COLLINEAR overlap — and the
collinearity test has a ±2 px tolerance. "Parallel and 11 px away" passes all three. `simplifyRoute`,
which runs again at draw time, has the same blind spot (it checks `otherSegs` for CROSSINGS only).
The codebase knows "don't sit ON another line"; it does not know "keep a lane".

## Decision

The user rejected "refuse the bend deletion" (it would leave a staircase where the pass exists to
remove one). The fix is to **move the offending run back out to a lane**, after the straightening
passes have had their way.

## Plan

- [x] `spreadCloseRuns(layout)` in `d2-refine.ts`, inserted after `separateKissingJogs` and before
      `placeLabels`. For every pair of same-orientation INTERIOR runs from different edges that stay
      parallel for > `MINOV` and sit closer than `LANE`, push the better-placed run out to `LANE`.
  - `LANE = 24` — ELK's own `edgeEdge` value, and the same number `compactBackRings` already uses as
    `RINGGAP` for exactly this "keep off another edge's parallel segment" rule.
  - The MOVER is chosen by a global deficit metric (sum of `LANE − gap` over all conflicting pairs),
    not by which edge is "at fault" — whichever move leaves the whole neighbourhood roomiest wins.
  - Port stubs (the first/last segment) are never moved — they'd leave the node's port.
  - Guards, all "never worsen" rather than absolute: box clearance for the moved run AND its two
    stretched neighbours, no new crossing, no new collinear overlap, no adjacent segment collapsing
    below 8 px, and the metric must strictly decrease.
  - Pairs sharing a `src` or `dst` are SKIPPED — their spacing belongs to `bundleSiblings` /
    `bundleSourceSiblings` (`CHANSPACE = 40`), and fighting a deliberate pass is worse than one
    missed case. (The reported pair shares neither endpoint.)
- [x] Prove it survives `toSVG`'s draw-time `simplifyRoute` + `straightenEnds` — the trace only proves
      the pass fired; the measurement that counts is on the RENDERED SVG.
- [x] Unit tests in `d2-refine.test.ts`.
- [x] Re-check the four frozen layouts (`d2-quality.test.ts` pins crossings 3/1/2/1 and zero of every
      overlap class) — decide any moved count by LOOKING at the render, never by re-baselining blind.

## What shipped

`spreadCloseRuns` in `d2-refine.ts`, wired into `refineLayout` after `separateKissingJogs`. Runs are
collected from EVERY segment; the first/last one of a route is marked immovable (it docks into a node
port) but still counts as half of a conflicting pair — without that the reported case never even
registered, because the crowding partner there IS a port stub. Clearance is judged PER SEGMENT
("never worsen, and never below `RUNCLR`"): a single already-hugging segment elsewhere on the route
must not excuse a move that hugs something new.

## Verification (2026-08-03)

**On the reported document** (second block, default engine, measured on the RENDERED SVG):

| | before | after |
|---|---|---|
| `m2.pseudo→vault` ∥ `m2.resid→lfp` | **10,9 px** | **23,8 px** (a 24 px lane; 0,2 is sampling error) |

The dashed run is the one that moved (633,3 → 646,2), because the solid one is a port stub. Screenshot:
`tmp/d2-nl/t494-final-b1.png`.

**On the frozen fixtures.** A new `nearParallel` metric in `d2-quality.test.ts` counts pairs closer
than the lane. On the FROZEN raw-ELK layouts, `oauth` had **2** of them before the pass and **0**
after, with its pinned crossing count (2) and every other overlap metric unchanged — red-then-green on
a real layout, not just on the reporter's document.

Separately, through the by-eye harness (which runs LIVE ELK, so a different geometry from the frozen
fixture): `microservices` / `dataplatform` / `netmesh` renders are BYTE-IDENTICAL before and after —
the pass does not fire there at all — while `oauth`'s render changed slightly and was compared by eye
with no visual regression.

**Tests.** `npm test` **2 685 pass** / 191 files (7 new unit tests: the 11 px pair spreads; a port stub is never
moved; the movable side moves when its neighbour is a stub; siblings are left to the bundling passes;
a boxed-in pair stays put; a container wall blocks the move; a move that would FLIP an adjacent jog
into a left-then-right bump is refused — each red-then-green). Real-VS-Code e2e
`d2-parallel-lane.spec.ts` measures the RENDERED geometry — **1 passed**, and **RED first**: with the
pass disabled the same spec failed 3/3 at 11,1 px. The seven sibling D2 specs (`d2-elk`,
`d2-container-edge`, `d2-feature-parity`, `d2-label-halo`, `d2-sketch` ×3) all pass.

**Gates.** `typecheck`, `typecheck:vscode-e2e`, `lint:ci` (695 files) clean. `npm run quality`: all
stages PASS except the pre-existing `knip` baseline (task 469), which has no finding in this diff.

**Coverage.** Every line of the new pass is exercised except the `ctx.runs.length < 2` early return.

## Also fixed on the way

`media-src/scripts/d2-render-harness/render.entry.ts` — the by-eye render harness had been dead since
the module move (it imported `../../src/d2-render`, `../../src/d2-wasm`, `../../src/elk-layout`, and
`bootElk` from `elk-layout` instead of `boot-elk`). Repointed; it renders again, and it is what
produced the fixture before/after comparisons above.

## Not done

- The lane is restored (~24 px), NOT centred between neighbours. Real centring would need a spreading
  pass over whole channels; this one only fixes pairs that fell under the lane.
- Pairs where BOTH runs are port stubs cannot be fixed here at all — nothing may move. None were
  observed; if one shows up it belongs in the ELK port-assignment stage, not in a post-pass.
- **The lane is not a guarantee.** `toSVG` still re-runs `simplifyRoute` + `straightenEnds` at draw
  time, and those check other edges for CROSSINGS only. On this document (and the fixtures) the spread
  survives — verified on the rendered SVG, which is what `d2-parallel-lane.spec.ts` measures — but a
  route where the spread makes a previously-blocked straightening possible could re-close the lane.
  The clean fix, if that ever shows up, is the same clearance test inside `simplifyRoute` (it already
  receives `otherSegs`).
- `ctx.runs` is collected ONCE, filtered by `length >= RUNOV`. A neighbouring run that was under that
  threshold can grow past it as a side effect of a move, and the deficit metric would not see it. The
  `nearParallel` metric recomputes from the final layout, so the four frozen fixtures cover the case;
  an arbitrary document does not.
