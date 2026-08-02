# Task 118 — F: Semantic placement priors (distilled role-net) → constraint layout

**Status:** PARKED, but the spike was RUN and the gate PASSED — do not read the sections below the
line as unexplored. Proposed 2026-06-18; spiked the same week; findings recovered into this file on
2026-08-02 from `spike/semantic-layout-net`, a local-only branch that had them and `main` did not.
Chosen direction: placement learned (or rule-derived), routing decoupled. Next step if resumed: the
routing half (libavoid, fix the container-obstacle gap); the placement net is the longer research
piece.

## Origin

Came out of the d2/TALA layout-quality dig (cluster 113–117). After spiking ELK, Graphviz,
cola, libavoid and HOLA, the recurring finding: **every geometric engine is semantically
blind.** They optimise crossings / compactness / orthogonality but don't know that `Users` is
an actor (top), `Postgres`/`Redis` a datastore (bottom), `API Gateway` an ingress hub
(upper-middle). That's why even clean layouts often "aren't how a human would draw it." This
task is the missing **semantic** layer that feeds priors into the engine.

User framing: a small NN — trained to distil an LLM's reasoning about *where* blocks belong
(databases, inputs, gateways…) — suggests placements; those suggestions go into a placement +
routing engine that draws the final edges.

## Reframed architecture (the load-bearing decision)

Predicting absolute `(x,y)` from a net is fragile (small graph change → big relayout → "uncanny"
instability). Decompose into layers, each independently testable:

```
label → ROLE  →  role → CONSTRAINTS (rules)  →  geometric engine  →  routing
```

1. **Learned piece = `label → role`** — a SMALL, closed role set (actor / ingress-edge /
   gateway / service / datastore / queue / cache / aggregate-model / frontend / external).
   Highly learnable: classifier over the label embedding, or even cosine-to-role-prototypes
   (maybe no training at all for v0). **This** is what distils from the LLM.
2. **`role → constraints` = RULES, not a net** — datastore→bottom rank, actor→top, ingress→top,
   gateway→upper hub, queue/cache→side. Deterministic, debuggable, editable.
3. **constraints → geometry = an existing engine that accepts hints.** **cola is purpose-built**
   for this (native `alignment` / `separation` / groups — see task 114). Graphviz has
   `rank`/`rankdir`/clusters; ELK has `partitioning`/`layerConstraint`. The "engine that takes
   suggestions" already exists.
4. **routing = libavoid / engine** (task 115 / the chosen backend).

**Why distil to a small net instead of calling the LLM live:** vMarkd is offline-first; a live
LLM call per render = latency / cost / online dependency. A tiny distilled role classifier runs
locally in ms, offline — that's its real justification (fits the extension's offline ethos),
not "ML for its own sake."

## Hard parts (be honest — the model is the easy bit)

- **Training signal / evaluation is the hard problem, not the net.** "Good layout" is
  subjective. `graph → role` labels the LLM generates cheaply; but `graph → GOOD positions`
  needs a judge (LLM-as-judge or human preference pairs). Stand up evaluation before training.
- **Stability:** constraints must be SOFT (preferences), or hard zones fight connectivity and
  look worse than no priors.
- **Generalisation:** roles are domain-specific (software architecture ≠ biology pathway). Scope
  the role set to a domain; detect/abstain out-of-domain.
- **Determinism:** same input → same layout (seed everything; cache role assignments).

## Minimal experiment (run FIRST, no training)

Backend already exists in `tmp/` from the cluster spikes. Cheapest proof:

1. Label node roles on `complex.d2` with **rules/keywords or a one-off LLM pass** (no net yet).
2. `role → cola constraints`: datastore → shared bottom rank (alignment-y + separation), actor →
   top, gateway → hub.
3. Run through **cola + GridRouter** (task 114/115 spike) and compare against the prior-free
   layout. Does it visibly read "more human"?

If yes → distil the `label→role` classifier to drop the LLM from the hot path. If no → we saved
building a net. **Gate the net on this experiment showing a real lift.**

## Dependencies / relation to cluster

- Backend (steps 3–4) = whichever of 113–117 wins (currently leaning **Graphviz→toSVG** [free,
  clusters, ortho] or **cola+libavoid** [115, compact]). 118 is the semantic layer ON TOP, not a
  replacement.
- Reuses `d2-render.ts` `toSVG` for drawing + the compiled D2 graph (shapes carry `shape`/
  `container` → cheap role features).

## Out of scope (v0)

- Predicting absolute coordinates with the net (use roles→constraints, not regression).
- A general cross-domain role ontology (scope to software-architecture roles first).
- Bundling a heavy ML runtime — if a net ships, it must be tiny (≤ a few hundred KB, e.g. a small
  MLP over a frozen label embedding, or pure prototype-cosine) and offline.

## Verification

- Bench: prior-free vs role-prior layout on the shared complex graph(s) — LLM-as-judge or a small
  human-preference set; report the lift (or lack of it).
- If a net ships: determinism test (same graph → same roles), offline (no network), size budget,
  and the layout regression nets from the chosen backend still pass. `xvfb-run -a`.

## The `nodeOptions` hook — written, NOT on main (2026-08-02)

The spike needed one production-side change and it is the only code this task ever produced:
`layoutElk()` in `media-src/src/elk-layout.ts` gained an optional 5th parameter,

```ts
nodeOptions?: (s: D2Shape) => Record<string, string> | undefined
```

returning per-node ELK `layoutOptions` for a given shape — the hook a semantic layer needs to turn a
node's ROLE into a layered constraint (`elk.layered.layering.layerConstraint: FIRST|LAST`, pinning
source tiers to the top and sink tiers to the bottom). 16 lines of implementation plus a 55-line
test. Purely additive: it defaults to `undefined`, so with no caller the shipped path behaves
exactly as before. For containers the returned options are merged AFTER the padding default, so a
caller can override padding; for leaves they are attached only when the hook actually returns some.

**It is deliberately not on `main`.** Its only consumer was the spike harness under `tmp/`
(gitignored — `tmp/elk-render-check/entry.ts`'s `__renderSemantic` / `__placeSemantic`), which no
longer exists, so merging the hook would put a dead parameter on a shipped layout function. It lives
in commit `3362c1b`, which was on `spike/semantic-layout-net` — a branch DELETED on 2026-08-02,
after this file absorbed everything it held. Git keeps the commit object reachable through the
reflog for a while (`git show 3362c1b` may still work), but do not rely on that: the diff below is
the durable copy. Re-adding the hook is a 16-line change and should be done WITH the caller that
needs it, not before — this section exists so nobody re-derives the design, not as a reason to merge
it early.

The whole change, inlined so this file does not depend on that branch surviving:

```diff
 export async function layoutElk(
   graph: D2Graph,
   measure: Sizer,
   elk: any,
   extraOptions: Record<string, string> = {},
+  nodeOptions?: (s: D2Shape) => Record<string, string> | undefined,
 ): Promise<Layout> {

   // container branch:
-      layoutOptions: { 'elk.padding': '[top=34,left=14,bottom=14,right=14]' },
+      // Merge semantic per-node options AFTER the padding default so a caller can override.
+      layoutOptions: {
+        'elk.padding': '[top=34,left=14,bottom=14,right=14]',
+        ...nodeOptions?.(s),
+      },

   // leaf branch:
-  const node = { id: s.id, width: li.w, height: li.h, labels: [{ text: s.label }] }
+  const node: any = { id: s.id, width: li.w, height: li.h, labels: [{ text: s.label }] }
+  // Attach semantic per-node layoutOptions only when the hook returns some.
+  const lo = nodeOptions?.(s)
+  if (lo) node.layoutOptions = lo
```

The 55-line test that came with it covered three cases: no hook → byte-identical output to before,
a hook returning options for a leaf → they land on that node only, and a hook returning padding for
a container → it wins over the default.

## Update 2026-06-18 — spike findings + chosen decomposition (placement learned, routing decoupled)

Spiked ELK (layered / rectpacking / force / stress), Graphviz (dot+ortho → toSVG), cola, libavoid
and HOLA on `complex.d2`, all rendered through the shared `toSVG` for an apples-to-apples
comparison (renders in `tmp/{elk-render-check,graphviz-spike,libavoid-spike}`).

**Free geometric engines force a binary:**
- **HIERARCHY** (ELK layered, Graphviz dot) — keeps every edge AND can honour semantic anchors
  (role → `elk.layered.layering.layerConstraint: FIRST|LAST`, the exact mirror of Graphviz
  `rank=min|max`), but the result is a strict top→down stack.
- **PACKING** (ELK rectpacking / force / stress) — dense, space-filling, "drop things into empty
  space"… but the packers treat top-level blocks as independent rectangles and **drop the
  cross-container edges entirely** (stress also overlaps containers). Layer constraints are ignored
  by the packers (layered-only). So pure packing kills the "what-connects-to-what" story.

**The decoupling that dissolves the binary (validated):** separate PLACEMENT from ROUTING. A
rectpacking *placement* (positions only) + **libavoid** routing drawn *afterward* yields a dense,
packed layout WITH all 17 edges (`tmp/elk-render-check/libavoid_complex_rectpacking.png`, 900×764,
17/17 routed). Edges no longer come from the placement engine — a router draws them on the final
positions. This is exactly TALA's shape (constraint placement + routing) and the user's stated
vision: **the net produces the ideal placement; the lines are drawn after.**

**Revised decomposition (the chosen direction):**
```
graph → NN → placement (positions / grid-cell assignment)  →  libavoid routing  →  toSVG
```
- `rectpacking` is the current **free proxy for the NN placement step** — it proves the
  placement-agnostic routing pipeline, but its placement is arbitrary (NOT semantic). The NN's
  value-add is making the dense packing *semantically sensible* (actor top, datastore bottom,
  gateway hub) — density + routability + SENSE, which no free engine gives at once.
- **Stability guard (still applies):** prefer the NN emitting a COARSE placement (grid-cell /
  region assignment), not raw pixels, then a compactor + libavoid — keeps the "small graph change →
  big relayout" instability in check while preserving the packed look.

**Routing half — BUILT (2026-06-18).** libavoid on any placement is engine-agnostic and reusable
regardless of where positions come from. Container-crossing fixed via HIERARCHICAL routing
(`tmp/libavoid-spike/route-hier.mjs`): this libavoid-js build has no `ClusterRef`, so we route in
two scopes — Pass 1 top level with containers as SOLID obstacles (inter-container edges go AROUND
them), Pass 2 sub-routes the final hop into a nested child inside its container (siblings as
obstacles); the parts are stitched into one polyline. 17/17 edges, clean right angles
(`libavoidhier_complex_{rectpacking,sem}.png`).
- **KEY finding:** the router is only as good as the PLACEMENT. On rectpacking (connected nodes
  scattered) the router is forced into long wrap-around routes (`maps to` circles the canvas); on a
  semantic placement (connected nodes adjacent) the SAME router draws short clean lines. So with the
  router done and neutral, ALL remaining layout quality lives in the placement step — i.e. exactly
  what the NN must produce (put related/connected things near each other, semantically).
- Minor polish still open (cosmetic, not blocking): edge-label placement can crowd / clip at the
  canvas margin; an occasional off-canvas excursion when the placement scatters endpoints.

**Hierarchical PLACEMENT — BUILT (2026-06-18), the placement analogue of the router.** User feedback:
top-level group placement is good, but intra-container placement was weak (children inherited the
root's rigid `layered` because a single ELK call with `INCLUDE_CHILDREN` forces `layered` everywhere
— `rectpacking`/`box` inside a container throw `UnsupportedGraphException` on cross-hierarchy edges).
Fix (`tmp/elk-render-check/entry.ts` `__placeHier`): lay out each top-level container's children as
an INDEPENDENT flat sub-graph (any algorithm now works), measure it, then lay out the TOP level
treating each container as a fixed-size box; compose absolute positions. `rectpacking` inside packs
children into a compact 2×2 grid (`libavoidhier_complex_hier-rectpack.png`) vs the tall column of
layered/box. **Now every level's placement is decoupled** — exactly the per-level structure an NN
placer slots into (swap the inside-container placer and/or the top-level placer; router + toSVG
unchanged). Full pipeline: per-container placement → top-level group placement (layered+semantic) →
hierarchical libavoid routing → toSVG.

**Engine-agnostic, reused regardless of placement source:** `toSVG` (shapes) + libavoid (routing).
The placement source (NN now, rectpacking/Graphviz as fallback) is the only swappable piece.

## PROOF (2026-06-18) — LLM-placement → router beats every free engine

User verdict on all geometric engines: packers (rectpacking/box/force) place compactly but
EDGE-BLIND → illogical interiors + crossing lines; layered respects flow but sprawls. None gives
logical + compact + clean at once — the free-engine ceiling.

Proof render: I (the LLM, stand-in for the future net) hand-assigned every node to a grid CELL by
ROLE + FLOW (vertical spine Users→CDN→Gateway→Microservices→data tier; Frontend beside Gateway;
Microservices interior a logical 2×2 auth/orders → inventory/payments; data tier across the bottom).
A pure cell→pixel placer (`__placeGrid`, NO geometric engine — `tmp/elk-render-check/llm-spec-complex.json`
drives it) produced the positions; the hierarchical libavoid router drew the lines unchanged. Result
(`libavoidhier_complex_llm.png`) reads like a human-drawn architecture diagram — the quality the
geometric engines could not reach. **This validates the whole pipeline end-to-end AND defines the
training target: "place like this."**

Caveat (the real remaining work): this placement was hand-reasoned for ONE graph. The component that
must produce such cell-specs AUTOMATICALLY for ANY graph is the missing piece — that is the net (or a
live-LLM placement pass), and the cell-spec (`{id,row,col}` per node) is exactly its output format.
Decomposition holds: graph → [intelligence] → grid-cell spec → `__placeGrid` → hierarchical router →
toSVG. Everything except [intelligence] is built and reusable.

**Placement ⇄ routing are COUPLED — line quality is downstream of placement intelligence.** Demo:
the first LLM spec put `orders` (a 5-edge hub) in the top-right of Microservices → its outgoing edges
bundled parallel down the container's right edge (ugly). Moving `orders` to the bottom-centre (beside
its data-tier partners), with NO router change, made the edges fan out radially and the bundle vanish
(`libavoidhier_complex_llm.png` → `_llm2.png`). Implication for the net's feature/objective: placement
must be **connectivity-aware** (place a node near where its edges go / hubs central), not just
role+flow. So the learned signal is richer than `label→role`; it must weigh degree/connectivity. The
router needs no more work for this class — the lever is placement.

## TALA MATCH (2026-06-18) — reproduced complex_tala.png with the free pipeline

Goal: get as close as possible to TALA's `complex_tala.png` with available means. Achieved an
element-by-element match (`tmp/elk-render-check/gvroute_tala_ortho.png`):
- **Placement** = LLM (hand-reasoned, the net's stand-in) reproducing TALA's 2D arrangement via
  ABSOLUTE node centres — `__placeAbs` in the harness + `tmp/elk-render-check/tala-spec-complex.json`.
  Key realisation: TALA honours the d2 `direction: right`, so the entry flow is HORIZONTAL
  (Users→CDN→Gateway on the left), OrderAggregate top-centre, Redis top-right, Microservices centre,
  Kafka right, Postgres big at the bottom — not the vertical spine our ELK path forced.
- **Routing** = a DIFFERENT line engine than libavoid: **Graphviz as a pure router** —
  `tmp/graphviz-spike/route-gv.mjs`, neato with pinned `pos="x,y!"` + `inputscale=72` (the
  no-`-n2`-flag workaround so neato keeps positions and only routes; viz-js doesn't expose `-n`).
  Clean straight orthogonal lines, closest to TALA's connectors.
- **Shapes** = our `toSVG` + a new **cylinder CONTAINER** (a container whose `shape:cylinder` draws as
  a cylinder with children inside + bottom label) so Postgres matches TALA. (`tmp/libavoid-spike/tosvg.cjs`.)

Remaining gaps vs TALA are cosmetic only (exact path of a few lines/labels; the watermark). Confirms
the whole-session thesis in one render: **intelligent placement + a good router + faithful shapes =
TALA-class output, with no closed engine.** Productionising means: a `__placeAbs`/grid placer + the
Graphviz-or-libavoid router + the cylinder-container in the shipped `d2-render.ts toSVG`, with the
placement source (LLM/net now hand-authored) the one piece left to automate.

## AUTOMATIC rule-based placer (2026-06-18) — the intelligence as deterministic rules

"How to do the TALA-like placement automatically?" Answer demonstrated: a RULE-BASED placer
(`__placeAuto` in the harness; rendered `tmp/elk-render-check/gvroute_auto_ortho.png`) reproduces the
TALA conventions with NO hand spec:
1. role per node (`roleOf` — shape+keywords; cylinder container→datastore, web/front container→
   frontend, other container→service).
2. flow CHAIN (actor/ingress/gateway/frontend/service) layered by longest-path along the d2
   `direction` axis, with CYCLE-BREAKING (keep first-seen dir → keeps gateway→frontend over the
   frontend.spa→gateway back-edge).
3. data SATELLITES attached on the cross axis to their most-connected primary: **datastore/queue
   BELOW, aggregate/cache ABOVE** — the convention the plain ELK-RIGHT path missed (it put DBs in a
   far layer instead of below their consumer).
4. container interiors laid out independently (rectpacking).

Result converges to TALA structurally (horizontal flow; OrderAggregate+Redis top; Postgres-cylinder +
Kafka bottom; compact interiors) fully automatically. Remaining gap vs TALA is fine-positioning
(in-layer lane order / barycentre, hub centring, label placement) — polish, not structure; closeable
with more rules OR the distilled NN. **Three automation tiers:** rules (shipped-here, offline, covers
typical architectures) → distilled NN (for atypical names/domains, trained on LLM specs) → live LLM
(spec generator = the NN's teacher). The placement output format (`{id,row,col}` grid or abs centres)
+ router + cylinder-container toSVG are all built; the placer is the swappable intelligence.

## SVG GROUND-TRUTH placement (2026-06-18) — exact match to complex.svg

The hand/auto attempts were eyeballed against the scaled PNG; the real target `complex.svg` is a
1680×1503 render with EXACT coordinates. Approach: **parse the reference SVG** — every node label is
`text-anchor:middle` (centre X) — extract each node's centre (containers = centroid of children),
emit an abs-placement spec (`tmp/graphviz-spike/parse-tala.mjs` → `tala-svg-spec-complex.json`), feed
to `__placeAbs` + Graphviz router + our shapes (cylinder container). Result
(`gvroute_talasvg_ortho.png`) reproduces complex.svg's placement faithfully (compared against
`REF_tala_complex.png`, the SVG rendered to PNG). Confirms our shapes + router can render TALA's
exact layout — the only missing piece was the placement coordinates.

**Reusable value:** these parsed centres are GROUND TRUTH — use them to (a) measure the auto-placer's
gap quantitatively (per-node position error vs TALA), and (b) train/calibrate the rules/NN. The
evaluation signal task 118 flagged as the hard part now has a concrete anchor: distance to TALA's
placement on this graph.

## CUSTOM orthogonal router (2026-06-18) — invented when libavoid/Graphviz fell short

Neither libavoid nor Graphviz routing matched TALA's line quality, so a from-scratch router was
written: `tmp/router/ortho.mjs` `routeEdges(nodes, edges)` — **A\* over a Hanan visibility grid**
(grid lines = box borders ±clearance + ports + channel midlines) with:
- **strong BEND penalty** (turn cost ≫ length) → few bends, long straight runs = the TALA look;
- **per-edge obstacle set** = every node + container EXCEPT the edge's endpoints and their ancestor
  containers → lines route AROUND foreign containers, ENTER their own, never cross siblings
  (hierarchical routing falls out of the obstacle set, no separate passes);
- **port spreading** — edges sharing a node side leave from distinct fractional points (no bundling).
  PORT RULES (user, top-level): arrows of the SAME direction on a side (all out, OR all in) ALWAYS
  leave from the CENTRE — one shared point. Only when the side ALSO carries an OPPOSITE-direction
  arrow does that opposite one move to another point (¼ / ¾, off-centre toward where it comes from).
  Never a rectangle corner; a hexagon's left/right box-centre port = its vertex (allowed). KEY
  consequence: straightness comes from MOVING BLOCKS so centres line up — NOT from offsetting the
  port. (So Postgres persist/lookup can't be perfectly straight: the tables are wider than the service
  spacing, so the table centres can't sit under both service centres without overlap — would need the
  services spaced apart.) This supersedes the earlier projection / exact-single-port attempts.
  CLEARANCE rule (user): lines keep a visible gap from boxes (never almost-overlap a box edge) —
  `CLEAR` (default 22): obstacles inflated by CLEAR in the A* blocked-test (route can't run within
  CLEAR of any non-endpoint box) + perpendicular stub length = CLEAR. NO-CROSSINGS rule (user): edges
  must not cross; if they do, the diagram must be RE-DRAWN. Router avoids crossings: route shortest
  edges first, A* heavily penalises (`crossPen` 600) a grid segment that would cross an already-routed
  edge → later edges detour around settled ones. Crossings remain only when geometrically forced;
  `tmp/router/crossings.mjs` counts them (0 on the TALA placement) → a non-zero count is the signal to
  re-layout (reorder/move blocks — the constraint-solver direction). NOTE: the crossing DETECTOR must
  NOT skip edge pairs sharing a node — edges sharing an endpoint still cross away from it (maps-to ×
  /orders both touch Orders). First real re-layout move implemented: `degreeOneAlign` repositions a
  free degree-1 node (OrderAggregate↔Orders) onto its neighbour's axis → straightens its edge AND
  clears the forced crossing → complex.svg now routes with 0 crossings (verified). PERPENDICULAR rule: an edge must leave/enter
  at 90° to the box side (left→left, right→right, top→up, bottom→down) — enforced by a short stub
  straight out along the side normal, then A* between the stub points (first/last segments are the
  perpendicular stubs). STRAIGHT rule: a line with nothing to avoid must run straight (A* bend
  penalty handles it); if connected blocks are only slightly offset, MOVE the blocks to align
  (pre-routing `alignNodes`: gentle, small offsets only, top-level pairs or in-container siblings,
  horizontal edges → shared centre-Y, vertical → shared centre-X).
Rendered on the complex.svg placement (`tmp/router/render-ortho.mjs` → `customrouter_complex.png`):
clean orthogonal lines, minimal bends, container-aware — closest to TALA's connectors of all routers
tried. Pure geometry, offline, fully controllable (clearance/bend/spacing knobs). This is the routing
half's production candidate; remaining polish = global channel nudging for any residual overlaps.

## Straight-line / alignment analysis (2026-06-18) — the constrained-optimisation ceiling

Goal: lines straight where geometry allows. Diagnostics (`tmp/router/analyze.mjs`, bends per edge):
- raw reconstructed TALA placement → only 2 straight / 15 bent. Two causes:
  - **drift**: `__placeAbs` rebuilds positions with OUR node sizes, so centres that TALA made equal
    drift a few px apart → bent. FIX = `snapNodes` (cluster near-equal leaf centres per axis, set
    equal) → 2→6 straight, SAFE (no overlaps).
  - **hub conflict**: a node with N edges on one axis (Orders has 4 vertical: maps-to, cache-reads,
    charge, persist) can be collinear with at most one neighbour per direction → the rest MUST bend.
    INHERENT — TALA's own render bends these same edges. Not a bug.
- `chainAlign` (union-find over H/V chains of degree-≤2 nodes → shared coordinate) raised straight to
  9, BUT caused NODE OVERLAPS (the two Postgres tables piled — their consumers Auth/Orders share an X,
  so both tables were pulled to that X) and regressions (consume → 4 bends). Reverted.
- **Conclusion:** "straighten every alignable line" is a CONSTRAINED-OPTIMISATION problem (alignment
  + non-overlap + bend-min, jointly). A sequence of heuristic passes each fixes one constraint and
  breaks another — it cannot converge. This is exactly what TALA does internally and what cola's
  native constraints (alignment + non-overlap) or the distilled NN would provide. **Stable
  heuristic maximum = snap + gentle pairwise align** (6 straight, zero overlaps, hub bends =
  TALA-faithful). Going further ⇒ a real constraint solver, not another pass.

## Container rigid-shift + exact ports (2026-06-18) — the Postgres case

User: "move Postgres right and all three lines touching it go straight." Diagnosis: the DB tables are
WIDER (312, 263) than the Auth↔Orders spacing (259), so centring each table under its consumer makes
the tables OVERLAP (−28px) — re-spacing centres is impossible. Resolution (both true to the user's
intuition AND collision-free):
- `containerAlign` (`tmp/router/ortho.mjs`): rigid-shift the whole container by the MEAN of its
  external edges' desired offsets (overlap-checked vs other top nodes) → Postgres slides right, tables
  keep their spacing (gap +138px, no overlap), and both consumers (Auth, Orders) land WITHIN their
  (wide) tables' horizontal spans.
- EXACT ports for single-edge sides (routeEdges): a side with one edge puts its port exactly under the
  target (clamped off the corners) instead of snapping to ¼/½/¾ → a straight line to any target the
  side spans. So persist + lookup go straight down, FK stays straight between the tables.
- General principle recorded: rigid container shift is safe when its external offsets are *consistent
  enough that the shift brings targets into the children's spans*; centre-re-spacing of children
  (`childExternalAlign`) is unsafe for dense containers (it yanked Auth/Orders out of Microservices)
  and is gated to coherent, loosely-coupled containers — but the rigid-shift + exact-port combo
  supersedes it for the Postgres class.
