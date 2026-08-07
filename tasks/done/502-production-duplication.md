# Task 502 — clear the duplication that is actually in production code

**Status:** done (2026-08-06) · **Impact:** 🟡 behaviour-preserving refactor across
diagram/editing/host code · **Origin:** user asked to clean up code duplication after the
`eslint-plugin-sonarjs` question, 2026-08-06.

## The measurement that scopes this task

`npm run jscpd` reports **742 clone pairs / 10 201 duplicated lines (8.28%)** — a number that reads
alarming and is mostly not actionable. Splitting the pairs by whether each side is a
spec/test/harness file:

| where | clone pairs | duplicated lines |
|---|---|---|
| test ↔ test | **698** | 10 501 |
| **production ↔ production** | **29** | **295** |
| mixed | 15 | 147 |

**94% of the duplication is spec/harness boilerplate.** That was explicitly excluded from this
task, and the reason is not laziness: a spec that sets up its own fixture inline is readable in
isolation and fails in isolation. Factoring shared setup out of specs couples them and makes a
failure require reading two files. `.jscpd.json` scans `test/` and `media-src/e2e/` and there is
no threshold configured to fail on it, so this stays a reported number, not a debt.

**This task is the 29 production pairs / 295 lines**, user-confirmed to include the D2 cluster.

## The list (from `tmp/jscpd`'s JSON report, production↔production only)

### D2 layout pipeline — was reported as 17 of the 29 pairs; a fresh `jscpd` run (see below) found 14

**Count correction:** the "17" above came from a stale/differently-generated report. A fresh
`./node_modules/.bin/jscpd --config .jscpd.json --reporters json` run (2026-08-06, `astar.ts`
imported but never a party to any pair — 0 clones there) found **14** D2 production↔production
pairs: `d2-refine.ts` ×9 self-pairs (25, 12, 12, 10, 10, 10, 8, 7, 7 lines), `d2-render.ts` ×3
self-pairs (21, 10, 6), `d2-geometry.ts ↔ d2-refine.ts` ×2 (13, 6). The fresh count is ground
truth; treat "17" as superseded, not as a target still owed.

> ⚠️ **Prerequisite, not a suggestion: this code has no numeric unit coverage.** Task 499 hit
> exactly this wall and declined to migrate its clamps here for the same reason, and the
> `outline-resize.ts` finding in that task is the proof that a plausible-looking extraction in
> bounds arithmetic can silently change behaviour. So:
>
> - [x] **FIRST** write characterization tests over the functions you intend to touch — capture
>       today's outputs for representative inputs, assert them, and get them green BEFORE
>       extracting anything. The four frozen D2 fixtures and the `--metrics` harness
>       (see task 357 / the `d2Layout` work) are the existing lever for this. **Done differently
>       than planned:** the frozen-fixture `--metrics` harness renders whole diagrams and wasn't a
>       precise enough probe for the specific closures being touched (their guards fire on
>       specific box-collision/threshold edge cases a full-diagram render rarely hits exactly);
>       used direct unit characterization instead (new `it(...)` blocks against `__test`-exposed
>       internals and `renderD2Graph`/`toSVG`), captured via a throwaway probe script that ran the
>       real pre-extraction code once to get exact numeric baselines, then hard-asserted those
>       numbers. 18 new characterization/unit tests across `d2-render.test.ts` (9),
>       `d2-geometry.test.ts` (4), `d2-refine.test.ts` (5) — see the per-extraction bullets below
>       for what each pins down. All green BEFORE the corresponding extraction, re-verified green
>       AFTER (full D2 suite: 237 → 239 tests, all passing, both times).
> - [x] **THEN** extract, re-running those tests after each extraction. Done for 4 of the 14
>       pairs (resolving 6 pairs outright + shrinking 2 more to trivial wiring residuals — see
>       below); typecheck + the full D2 vitest suite + `biome ci` on every touched file re-run
>       after each single extraction, not batched at the end.
> - [x] If a characterization test is impractical for a given clone, **leave that clone** and say
>       so. 7 of the 14 pairs left — every one is a *task-499-shaped trap* (same token shape,
>       different meaning, or a threshold that differs per caller = "a helper needing a boolean
>       flag to serve two callers"), not a coverage gap. Detail below.

**Extracted (4 extractions, resolving 6 pairs outright + shrinking 2 more to boilerplate-only
residuals that jscpd still flags but that carry no remaining duplicated algorithm):**

- [x] `d2-render.ts` — the `|md|`-text-shape and `shape:text`/`code` branches of `toSVG` each
      carried an identical "explicit fill/stroke/borderRadius → draw a box, else borderless"
      `<rect>` template (pair: 2090-2095 ↔ 2117-2124, 6 lines). Extracted a local closure
      `explicitStyleBox()` (captures `left/top/w/h/rx/s` already in scope) right after `rx` is
      computed; both call sites now `const box = explicitStyleBox(); if (box) parts.push(box)`.
      Characterization: 4 new tests pinning the exact `<rect>` markup (fill/stroke/opacity/rx) for
      a borderRadius-only case and an opacity case, on BOTH branches — neither edge case was
      pinned by the existing substring-only tests, and one caught nothing wrong here but would
      have caught a subtly different `rx` or attribute-order regression.
- [x] `d2-render.ts` — `drawSqlTable`/`drawClass` each drew an identical body-rect + solid
      header-rect + header-title-`<text>` "chrome" from an identical border/body/headerFill/
      headerOp/headerText token-resolution block (pairs: 2461-2481↔2534-2552 (21) and
      2485-2494↔2555-2564 (10) — task 381's own comment already said the *token mapping* was
      shared; the SVG *emission* wasn't). Extracted `drawTablePanelHeader(s, left, top, w, h, sty,
      out)`, pushing onto the caller's `out` and returning `{border, hh}` — the two values each
      caller still needs (row dividers, row Y offsets). Left `nameC`/`typeC`/`visC`/etc. per-caller:
      a first draft that also pulled those out was WRONG — sqlTable's `nameC` is `sty.accent`,
      class's is `sty.text`; sqlTable's `typeC` is `sty.textMuted`, class's is `sty.accent2` —
      different tokens with the same variable name, caught by writing the characterization test
      BEFORE extracting (the test asserts `sty.tableHeaderText` for the header text, which is
      genuinely shared, and separately proved via mono-vs-themed assertions that the `fill-opacity`
      direction is the OPPOSITE of what the surrounding comments read at a glance — mono gets
      `fill-opacity="0.12"`, themed doesn't. That's a second thing the characterization test caught
      before it could become a mistaken "obvious" refactor). Characterization: 5 new tests (mono
      chrome, themed chrome, explicit stroke/fill/fontColor override, class mono+themed parity,
      multi-line-label header-band-height growth). Residual: a 16-line pair remains
      (2496-2511↔2553-2566) — the two functions' now-identical *call-site wiring* (same param
      list shape, `const out: string[] = []`, `const { border, hh } = drawTablePanelHeader(...)`).
      Left as-is: it's unavoidable boilerplate for calling a shared helper the same way twice, not
      duplicated logic — see "Left" list below.
      Deleted the now-dead `noExcessiveCognitiveComplexity` suppression on `drawClass` (line 2534
      pre-edit) — extraction dropped it under the threshold; verified via `biome ci`.
- [x] `d2-geometry.ts` / `d2-refine.ts` — `segHitsABox` (geometry, `ASTAR_M=10`), `deOvershoot`'s
      local `hitsBox` closure (refine, `M=4`), and `bundleSiblings`'s own separate local `hitsBox`
      closure (refine, `M=4`) were THREE copies of the identical "segment vs. box inflated by a
      margin" test (pairs: geometry 232-244↔refine 542-554 (13), plus most of the 25-line
      refine-self-pair 533-557↔940-964). Generalized `segHitsABox` into
      `segHitsBoxMargined(a, b, B, margin)` (exported from `d2-geometry.ts`); `segHitsABox` is now
      a 1-line wrapper (`segHitsBoxMargined(a, b, B, ASTAR_M)`) so its existing callers/tests are
      untouched. Both `d2-refine.ts` closures now `leaves.some((n) => segHitsBoxMargined(a, b, n,
      4))`. Characterization: `d2-geometry.test.ts` gained 4 tests pinning the margin=4 boundary
      behaviour distinctly from the existing margin=10 (`ASTAR_M`) suite, incl. a parity check that
      the SAME segment misses at margin=4 but hits at margin=10. `d2-refine.test.ts` gained 2 tests
      — **every existing `deOvershoot`/`bundleSiblings` test laid out with `nodes: []`, so
      `leaves` was always empty and this guard's true branch had NEVER been exercised by any test
      before this task** — one proves a genuinely non-degenerate bump picks the corner whose
      segment clears an inflated leaf box over one that hits it (and that the blocked corner's
      point never lands in the committed route), the other proves a box straddling both candidate
      corners leaves the bump uncollapsed. Residual: a 9-line pair remains (546-554↔937-945) — the
      two functions' identical `const leaves = layout.nodes.filter(isLeaf)` + `hitsBox` one-line
      wrapper-closure boilerplate. Left as-is (see below).
- [x] `d2-refine.ts` self-pairs — `adaptiveLayerGaps` (wraps in a `countCrossings` snapshot/revert
      guard) and `spreadCrampedRows` (applies unconditionally) both computed an IDENTICAL
      step-function-of-Y `shift`/`inside` pair from an `events: {y,d}[]` array and applied it to
      every node's `y` (+ container `h` across a straddled boundary), every edge point's `y`, every
      edge's `ly`, and `layout.H` (pairs: 209-220↔1808-1819 (12), 230-239↔1820-1829 (10)). This was
      the pair the lead's brief called out as the one whose test has to hit **all four** mutation
      targets, not just `node.y` — the exact `outline-resize.ts` failure shape (forgetting
      `e.ly`/container `h` and having the test not notice). Extracted `applyYShiftEvents(layout,
      events)`, called by `adaptiveLayerGaps` inside its existing snapshot/revert wrapper and
      unconditionally by `spreadCrampedRows`. Characterization: **neither function had ANY unit
      test before this task** (confirmed by grep before writing — the D2 cluster's "no numeric
      coverage" problem, concretely). Added `adaptiveLayerGaps` to the `__test` export (it wasn't
      exposed) and wrote 2 tests, one per function, each with a fixture that exercises all four
      mutation targets AT ONCE (a container straddling the shift boundary, an edge carrying both
      an interior point AND `ly` on the shifted side, a node above the boundary staying put as a
      negative check) — exact expected numbers obtained by running the REAL pre-extraction code
      once via a throwaway probe script (not hand-derived from the formula, which for
      `adaptiveLayerGaps`'s band-compression math would have been error-prone to get right by
      hand) and hard-asserted. Both pairs fully resolved — no residual (the two callers'
      `if (!events.length) return; applyYShiftEvents(layout, events)` / snapshot-wrap are each
      ≤2 lines, below jscpd's clone floor).

**Left (7 of the 14 pairs — every one already covered by the same "same shape ≠ same thing"
pattern task 499 and this task's own rules warn about; verified by reading each pair's full
context, not by pattern-matching the line count):**

- [x] `d2-geometry.ts` `parDist`'s `av && cv` / `ah && ch` interval-intersection branches
      ↔ `d2-refine.ts` `deOvershoot`'s `collOv` collinear-overlap check (13 lines total across two
      sub-cases) — **LEFT.** Exactly the task-499 "interval intersection, superficially identical
      to `clamp`, entirely different meaning" shape, now recurring one level up: `parDist`'s
      `lo`/`hi` compute a segment-extent OVERLAP with tolerance baked into the CALLER's segment
      selection; `collOv` computes the same shape but with a DIFFERENT literal tolerance (6px, not
      `parDist`'s caller-supplied one) and handles BOTH orientations from one input pair instead of
      being called twice per orientation. A shared helper needs a tolerance parameter AND an
      orientation branch — the "boolean/parameter flag between two callers" smell the task rules
      name explicitly. `d2-geometry.ts`'s own header already documents this file's discipline on
      this exact pattern; left consistent with it.
- [x] `d2-refine.ts` `monotonizeEdges`'s local `segHitsBox` ↔ `deleteBendsEndpoints`'s local
      `segHitsBox` (12 lines) — **LEFT.** Read as byte-identical at a glance; is NOT.
      `monotonizeEdges` (the `ins` closure): `q[0] > x1 + 0.5 && q[0] < x2 - 0.5 && ...` — a 0.5px
      INSET, a point exactly on the border does not count as inside. `deleteBendsEndpoints` (the
      `inside` closure): `p[0] > x1 && p[0] < x2 && ...` — no inset, a point a fraction of a pixel
      inside the border DOES count. Route endpoints attach to box borders, so this 0.5px delta is
      load-bearing, not noise — a shared helper needs an epsilon parameter, same smell as above.
- [x] `d2-refine.ts` `adaptiveLayerGaps`'s `horizLevels`'s dedup-scan preamble ↔ (post-shrink,
      formerly `monotonizeEdges`'s `borderRuns`/`edgeRuns` — see note) — **LEFT.** The
      "extract-sufficiently-long-horizontal-segments-from-a-polyline" preamble (`if (abs(a[1]-b[1])
      > tol) continue; if (abs(a[0]-b[0]) < minLen) continue; ...`) recurs with a DIFFERENT
      tolerance/minLen pair at each of its several call sites in this file; every occurrence checked
      carries its own caller-specific literal, same "parameter smell" as the two entries above.
- [x] `d2-refine.ts` `bundleSiblings`'s `collinear` (horizontal-only, tolerance `CHANSPACE=40`)
      ↔ `deOvershoot`'s `collOv` (both orientations, tolerance `6`) — **LEFT**, same family as the
      `parDist`/`collOv` entry above: different tolerance AND different orientation coverage per
      caller.
- [x] `d2-refine.ts` `detourContainers`'s interior-jog scan ↔ `separateKissingJogs`'s interior-jog
      scan (10 lines) and ↔ `spreadCrampedRows`'s interior-jog scan (8 lines) — **LEFT** (2
      pairs). The recurring "scan a polyline for a horizontal interior segment, with per-caller
      short-jog threshold" idiom (`< 6` / `< MINLEN=26` / no threshold at all, depending on the
      caller) that shows up across most of this file's passes — a shared version needs the
      threshold parameterized per caller, same smell.
- [x] `d2-refine.ts` `bundleSiblings`'s V-H-V jog detector ↔ `bundleSourceSiblings`'s V-H-V jog
      detector (`peelOf`) (7 lines) — **LEFT**, same jog-scan-idiom family, one more caller.
- [x] `d2-geometry.ts` `segHitsBoxMargined`/`drawTablePanelHeader` call-wiring residuals (the two
      ≤16-line leftovers noted under "Extracted" above) — **LEFT.** Not new findings; the
      unavoidable boilerplate of calling a newly-shared helper the same way from two sites
      (`const leaves = layout.nodes.filter(isLeaf); const hitsBox = (a,b) =>
      leaves.some(...)` / `const { border, hh } = drawTablePanelHeader(...)`). Squeezing these
      further (e.g. a factory returning a bound `hitsBox`) would trade a few lines for another
      layer of indirection around code that's already down to its irreducible call-site shape.

### Non-D2 production pairs — 12 of the 29

All 12 resolved (verified against the actual jscpd JSON report, `src`+`media-src/src`
production-only: 28 pairs, one short of the spec's 29 — the missing one is `test/backend/
vscode-mock.ts`'s self-pair, outside the `src media-src/src` scan and outside this task's edit
scope; see its own bullet below).

- [x] `editing/callout-nav.ts ↔ editing/gap-paragraph.ts` (15 lines) — **LEFT.** This is exactly
      the guard-shape task 473 already ruled on: `nav-geometry.ts`'s header (extracted from these
      same three nav handlers) states the pure geometry (`topLevelBlock`/`caretLineRect`) was
      pulled out, but the surrounding keydown-guard/edge-detection SHAPE was deliberately left
      parallel-but-duplicated across `callout-nav.ts`, `gap-nav.ts`, and `gap-paragraph.ts`'s
      `setupTrailingNav` — collapsing it "would trade an explicit description of behaviour for a
      metric." The two functions differ on key set (ArrowUp+Down vs ArrowDown-only) and what
      happens next (enter a collapsed callout vs recover from a helper block); a shared wrapper
      would need a flag for both. No new extraction; task 473's rationale still applies verbatim.
- [x] `diagrams/abc-fit.ts ↔ diagrams/smiles-render.ts` (13) — **EXTRACTED.** Both were a byte-
      identical rAF-debounced-MutationObserver-with-initial-sweep wrapper around a one-line
      redraw callback (`fitAbc` / `repairSmiles`). Added `observeSubtreeRafDebounced(appEl, redraw)`
      as a sibling export in `media-src/src/util/observe-coalesce.ts` (deliberately NOT
      `coalescePerFrame` — that runs its leading edge synchronously inside the mutation callback,
      which would be a re-entrancy risk for callbacks that redraw an SVG). Both call sites now
      one-line wrappers.
- [x] `diagrams/plantuml/plantuml-render.ts` self-pair (12) — **EXTRACTED.** `filledShapeMask` and
      `outerFringeMask` each carried their own border-seed + BFS flood-fill, differing only in the
      stop predicate (alpha-floor vs fully-opaque). Extracted `floodFillFromBorder(w, h, blocked)`
      as a private helper; both mask functions now call it with their own predicate. Pure function,
      unit-tested indirectly via `plantuml-render.test.ts`'s existing `filledShapeMask` coverage
      (unchanged export, unchanged contract).
- [x] `diagrams/graphviz-render.ts ↔ diagrams/plantuml/plantuml-render.ts` (9) — **EXTRACTED.**
      Both engines repaint baked foreground ink (fill/stroke matching the engine's own default-skin
      colour set) plus default-black `<text>` to `currentColor`, identical loop shape, different
      literal colour Sets. Added `paintForegroundToCurrentColor(svg, foreground)` in new
      `media-src/src/diagram-kit/svg-recolor.ts` (registered in `scripts/module-manifest.mjs`);
      both renderers call it with their own `Set`.
      **Housekeeping follow-up (2026-08-06):** this extraction dropped `themeGraphvizSvg`
      (`graphviz-render.ts:23` pre-edit) and `themePumlSvg` (`plantuml-render.ts:234` pre-edit)
      below the cognitive-complexity threshold, leaving their `noExcessiveCognitiveComplexity`
      suppressions dead. `./node_modules/.bin/biome ci` confirmed both as `suppressions/unused`;
      deleted both comments. Re-ran `biome ci` on the two files — clean.
- [x] `app/commands.ts` ×4 self-pairs (9, 9, 8, 8) — **EXTRACTED**, two helpers:
      `resolveActivePanel(deps)` (uri→target→panel resolve shared by `pastePlain`,
      `activateLinkAtCaret`, `fixListNumbering`, `renormalizeAllLists` — covers 3 of the 4 pairs),
      and `resolveSupportedEditorTarget(uri, args, deps)` (the byte-identical debug+guard prologue
      `openEditor` and `openInSplit` called with the exact same options — covers the 4th).
      Command-registration wiring below each call site is otherwise untouched.
- [x] `editing/caret.ts` self-pair (9) — **LEFT.** `resolveTextOffset`'s TreeWalker loop and
      `resolveBlockOffset`'s are deliberately different algorithms, not the same one twice: task
      487's own comment calls `resolveBlockOffset` "the unambiguous counterpart to
      resolveTextOffset" — the flat-offset variant does an exact-match empty-block disambiguation
      the block-offset variant intentionally skips (task 445's fix for the ambiguous "landed
      exactly at a text end" case doesn't apply to the block-relative case, which already resolves
      unambiguously via its block path). A shared walker would need a flag to turn that check on/off
      — the exact "boolean picking between two callers" smell the task rules warn about. Left
      inline, both keep their own comment trail.
- [x] `links/link-click-fix.ts` self-pair (9) — **EXTRACTED.** The caret-inside-chip and
      caret-adjacent-to-chip Delete/Backspace branches both ended with the identical "replace the
      chip with an empty text node, collapse the caret into it, dispatch a synthetic `input` so
      Vditor re-parses" tail. Extracted `replaceWithCaretAndReparse(target, range, sel)`; both
      branches now call it after their own chip-identification logic (which stays separate — that
      part genuinely differs).
- [x] `markdown/outline-tree.ts ↔ shared/heading-slug.ts` (9) — **look-before-extracting verdict:
      NOT a re-implementation, both live in the SAME bundle (`src/`, host — confirmed by `find`
      before reading either body), so "call it" was available, and the actual overlap is narrower
      than the whole function.** `heading-slug.ts`'s `parseHeadingsFromMarkdown` and
      `outline-tree.ts`'s `parseHeadings` are genuinely different in OUTPUT shape (one returns
      `{text, customId, index}` from a raw string, the other `{name, line, index}` from a
      `vscode.TextDocument`, and outline-tree does NOT strip a `{#custom-id}` marker — a real,
      pre-existing divergence, left alone as out of this task's scope). The literal duplicated
      block was narrower: the fence-open/close TOGGLE loop body both scanners carried byte-
      identical copies of. Extracted `createFenceTracker()` into `src/shared/md-scan.ts` (already
      the designated shared-primitives home for these two scanners, per its own header) — a tiny
      stateful `{consume(line): boolean}` tracker; both scanners now feed it lines instead of
      re-deriving fence state inline.
- [x] `editing/spin-skip-fence.ts` self-pair (8) — **LEFT.** `shouldSkipFenceSpin` and
      `shouldSkipProseSpin` share an `insertText`+single-char+collapsed-range preamble, but diverge
      immediately after on node-type strictness (fence allows an Element `startContainer` via
      `closest`, prose requires a Text node — task 180's prose predicate is deliberately stricter)
      and on the backtick/structural-char check (fence-specific, prose has none). This is
      perf-critical hot-path code (measured 63ms/keystroke → 0ms with the skip); both functions'
      own comments extensively justify their exact, different guard order. Sharing the preamble
      would need a flag for the node-type check — left inline.
- [x] `editing/callouts.ts ↔ editing/code-source.ts` (7) and
      `editing/callouts.ts ↔ editing/html-comment.ts` (7) — **EXTRACTED, treated as one finding**
      (per this task's own suggestion — both pairs were the same shape appearing twice). All three
      decorators (`callouts.ts`, `code-source.ts`, `html-comment.ts`) wired an identical
      coalesced-scoped-MutationObserver: `coalescePerFrameWithRecords` → `scopeMutations` →
      full-vs-within apply → observe childList/subtree/characterData → initial `run([])` → disposer.
      Extracted `observeScopedMutations(editorEl, {full, within})` into `editing/mutation-scope.ts`
      (already the designated home per its own header, which explicitly names all 3 callers).
      `code-source.ts` and `html-comment.ts` now return it directly; `callouts.ts` (which layers a
      caret-leave `selectionchange` listener on top) wraps the returned disposer with its own extra
      cleanup rather than the shared function growing an options bag for that one-off need.
- [x] `test/backend/vscode-mock.ts` self-pair (6) — **LEFT, decided explicitly (outside edit
      scope).** Deliberate mock surface mirroring the real `vscode` API shape on purpose (task 498
      bucket 3's classification stands). Not touched — `test/**` is outside this task's edit scope
      per the lead's brief, and the verdict would be leave regardless.

## jscpd before/after (D2 half)

Measured with `./node_modules/.bin/jscpd --config .jscpd.json --reporters json`, filtered to pairs
where BOTH sides are under `diagrams/d2/` and neither side is a `.test.ts`/harness file:

| | pairs | notable residuals |
|---|---|---|
| before (start of this half, non-D2 work already committed) | 14 | — |
| after (4 extractions: `explicitStyleBox`, `drawTablePanelHeader`, `segHitsBoxMargined`, `applyYShiftEvents`) | **9** | 2 of the 9 are call-site wiring boilerplate for the newly-shared helpers (≤16 lines each), not remaining duplicated algorithm — see "Extracted" above |

Whole-tree `npm run jscpd` total (includes the 94%-is-noise test↔test pairs this task explicitly
does not chase): **729 → 727** clone pairs. Duplicated *lines* ticked up slightly (10119→10132) —
the new characterization tests added some test↔test token overlap of their own, which is exactly
the kind of duplication this task's own scoping section rules out of bounds (spec/harness fixture
setup, not production logic). Not treated as a regression.

## Rules for this task

- Every extraction must be **behaviour-preserving**. If a clone pair differs in a way that makes a
  shared helper need a flag/mode parameter, that is a signal the two are not the same thing —
  leave them and record why. A helper with a boolean selecting between two callers is duplication
  wearing a hat.
- Not every clone should be removed. jscpd matches tokens, not meaning — task 499's `clamp`
  look-alikes (`plantuml-render.ts` colour-channel spread, `d2-geometry.ts` interval intersection)
  are the standing example of identical shape with unrelated semantics. Read each pair.
- Report the jscpd number before and after, but **do not treat the number as the goal.** Removing
  a clone by making the code worse is a loss even though the metric improves.

## Verification

- [x] `npm run typecheck` — clean, exit 0 (verified after every D2 extraction, not just once at
      the end).
- [x] `npm test` — **2772 passed**, 0 failed (baseline 2754 + 18 new D2 characterization/unit
      tests). Checked `uptime` first (load average ~0.7, not under load — task 476 flake risk
      ruled out) and confirmed the count directly, not just green colour.
- [x] `xvfb-run -a npm --prefix media-src run test:e2e` — **456 passed, 5 skipped** (the 5 are a
      pre-existing, unrelated skip block in `wiki-keyboard-focus.spec.ts` — "see the header: the
      design this asserts was reversed" — not touched by this task).
- [x] Dedicated D2 real-VS-Code specs (the FAST tier does NOT include these — task 498 found that
      gap the hard way): `d2-lazy-load.spec.ts` (2 passed), `d2-container-edge.spec.ts` (1
      passed), `d2-parallel-lane.spec.ts` (1 passed) — run one at a time, each its own
      `xvfb-run -a npm --prefix test/vscode-e2e test -- <spec>`.
- [x] `xvfb-run -a npm run test:vscode:fast` — **41 passed**, 0 failed (6.8 min).
- [x] `npm run lint:ci` — NOT 0 warnings tree-wide, and that's expected: t501b (a parallel agent)
      is still sweeping empty-block lint sites across the rest of the tree per the lead's brief.
      Ran `./node_modules/.bin/biome ci` on every file this task touched, individually,
      UNTRUNCATED (a first pass piped through `tail` had hidden real diagnostics behind the
      summary line — caught and redone properly): `d2-refine.ts`, `d2-render.ts`,
      `d2-geometry.ts`, `d2-refine.test.ts`, `d2-render.test.ts`, `d2-geometry.test.ts`, and
      `graphviz-render.ts` are all clean, 0 diagnostics. `plantuml-render.ts` has 2 diagnostics —
      **both pre-existing, both `lint/suspicious/noEmptyBlockStatements`** (empty `.catch(() =>
      {})` blocks at lines 1228 and 1389, deep inside `renderPlantumlBlock`'s promise chain,
      ~1000 lines from the one line this task edited in that file (the dead suppression comment
      near line 234)) — this file's own name is literally the origin of task 501
      ("biome-empty-block-rule"), t501b's territory, not introduced by this task.
- [x] `npm run quality` — ran after `test:vscode:fast` finished (avoided running two heavy
      toolchains concurrently). Summary: **FAIL lint:ci** (t501b's pre-existing empty-block sites,
      see above — not this task's), **FAIL knip** (5 unused devDependencies — `d3`, `three`,
      `vega`, `vega-embed`, `vega-lite` — pre-existing, unrelated to anything this task touched;
      knip reported ZERO unused-export findings for any symbol this task added, incl.
      `segHitsBoxMargined`, `applyYShiftEvents`, `drawTablePanelHeader`), **PASS jscpd**, **PASS
      depcruise**, **PASS test:coverage**, **PASS check:coverage-modules** (ratchet OK — 17
      zero-coverage modules vs. baseline 19; flagged 2 modules, `diagram-zoom.ts` and
      `link-click-fix.ts`, that now HAVE coverage and should be pruned from the zero-baseline
      list — improvement noise from other in-flight work this session, not a regression, and
      neither is a file this task touched).

## Out of scope

- The 698 test↔test clone pairs (see the measurement above).
- Lowering `.jscpd.json`'s `threshold` or wiring jscpd into CI — that is a separate decision and
  should not ride along with a refactor.
