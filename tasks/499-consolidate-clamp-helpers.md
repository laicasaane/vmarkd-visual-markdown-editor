# Task 499 — consolidate the hand-rolled `clamp` implementations onto one shared helper

**Status:** ✅ DONE 2026-08-06 — 12 sites migrated onto `src/shared/clamp.ts`, 1 genuine clamp
deliberately left inline (`outline-resize.ts`, opposite tie-break — see below), 5 look-alikes
commented as "NOT a clamp", and the 26-site D2 layout cluster classified but deferred behind a
unit-coverage prerequisite (the one follow-up this task leaves). All gates green: typecheck ×2,
unit 2754/2754, chromium e2e 456, real-VS-Code fast tier 39, `lint:ci` 0-warning, `npm run quality`
(only `knip` fails, on task 498's 5 accepted devDependency false positives). Simplify pass run
across all four angles — 2 findings applied, 2 skipped with reasons. · **Impact:** 🟢
behaviour-preserving refactor — no user-visible change; the win is
one named concept instead of N inline expressions · **Origin:** surfaced by
[task 498](498-knip-baseline-cleanup.md)'s simplify pass (altitude angle) when un-exporting
`clamp` from `media-src/src/nav/heading-align.ts` revealed it had never actually been shared.

## The finding, and why the reviewer's version of it is too small

The altitude review reported three sites: `heading-align.ts:21` (the real `clamp` function),
`media-src/src/util/source-map.ts:20` and `:214`, and `src/session/reveal-range.ts:25`. A survey
before filing found **the duplication is wider than that** —
`grep -rn "Math.max(.*Math.min(\|Math.min(.*Math.max(" src media-src/src --include=*.ts` (excluding
`*.test.ts`) returns **~35 hits**.

> ⚠️ **This number was wrong when the task was filed, and the error was mine (team lead).** The
> original text said "~19 hits" and the tables below were built from that list. Re-running the very
> same grep during implementation returns ~35: the filing survey's output was truncated and
> **missed `media-src/src/diagrams/d2/d2-refine.ts` (24 hits) and
> `media-src/src/diagrams/d2/astar.ts` (2 hits) entirely** — i.e. the single densest cluster in the
> repo was invisible to the task that was supposed to enumerate it. The number and the tables are
> corrected in place rather than by appending an erratum, so the file does not contradict itself;
> the newly-found sites are classified in "The D2 layout cluster" below. Lesson worth carrying:
> a survey that feeds a task's own scope table needs its raw output read to the end, not skimmed.

**But a blind grep-and-replace over those hits would be a bug.** Only some are clamps; the rest are
structurally similar and semantically unrelated. This classification is the actual work of the task:

### Genuine clamps (candidates)

| site | expression |
|---|---|
| `media-src/src/nav/heading-align.ts:21` | the existing `clamp(v, lo, hi)`, now file-local (task 498) |
| `media-src/src/util/source-map.ts:20` | `Math.max(0, Math.min(offset, md.length))` |
| `media-src/src/util/source-map.ts:214` | same expression, duplicated verbatim |
| `src/session/reveal-range.ts:25` | `Math.max(0, Math.min(reportedLine, lastLine))` |
| `src/shared/echarts-theme.ts:78,80,81` | 3× saturation/lightness clamps, each with a trailing comment |
| `src/shared/mermaid-palettes.ts:158` | `Math.max(0, Math.min(255, Math.round(v)))` — clamp ∘ round |
| `media-src/src/clipboard/image-convert.ts:35` | `Math.min(100, Math.max(1, Math.round(q)))` — same shape, args reversed |
| `media-src/src/editing/caret.ts:179` | `Math.min(Math.max(index, 0), kids.length - 1)` — index clamp |
| `media-src/src/nav/outline-resize.ts:25` | `Math.min(maxW, Math.max(MIN_WIDTH, width))` |
| `media-src/src/diagrams/echarts-retheme.ts:207` | `Math.max(140, Math.min(900, h))` |
| `media-src/src/diagrams/diagram-zoom.ts:61` | `Math.min(MAX_K, Math.max(MIN_K, st.k * factor))` |
| `media-src/src/diagrams/d2/d2-geometry.ts:78` | `Math.max(0, Math.min(1, t))` — parametric t clamp |

### NOT clamps — leave every one of these alone

- `media-src/src/diagrams/plantuml/plantuml-render.ts:90` — `Math.max(r,g,b) - Math.min(r,g,b)`, a
  channel **spread** (neutral-colour test).
- `plantuml-render.ts:328` — same spread shape over a stroke triple.
- `media-src/src/diagrams/d2/d2-geometry.ts:260,269,270,274,275` — interval **intersection**
  (`lo = max(min(a),min(c))`, `hi = min(max(b),max(d))`). Superficially identical nesting, entirely
  different meaning. Touching these is how this task ships a geometry bug.

**Note the argument-order inconsistency** among the real clamps: some are `max(lo, min(v, hi))`,
others `min(hi, max(lo, v))`, and two fold a `Math.round` in. A single helper is only an improvement
if it reads at least as clearly at each call site — where it doesn't, leave the expression inline
and say so.

## Where the helper goes

Both compilation units can reach `src/shared/` — verified: `media-src/src/links/wiki-serialize.ts`,
`custom-renderer.ts`, `same-doc-anchor.ts` and others already import from `../../../src/shared/*`.
So one helper in `src/shared/` can serve both trees; no duplicate-per-tree copy is needed.

- [x] Added `clamp(v, lo, hi)` as its own module, `src/shared/clamp.ts` — one exported function, no
      grab-bag. Registered in `scripts/module-manifest.mjs`'s `HOST_MODULES.shared.ids` (the
      "manifest is total and disjoint" assertion in `test/backend/module-boundaries.test.ts` fails
      otherwise — a new `src/shared/*` file is never just a new file).
- [x] Signature and contract decided and documented **in the helper's own header**, not only here:
      `clamp(v, lo, hi)` = `Math.max(lo, Math.min(v, hi))`. Behaviour at the edges, spelled out
      because it is now load-bearing:
      - `lo <= hi` (normal): `v` bound into `[lo, hi]`.
      - **`lo > hi`: returns `lo`** — the outer `Math.max` runs last and wins. Not validated, not
        thrown on. Chosen to match the majority shape already at the migrated call sites
        (`Math.max(0, Math.min(v, hi))`) and heading-align.ts's original `v < lo ? lo : …`, which
        also tests `lo` first.
      - `v` is `NaN`: returns `NaN` (both `Math.max`/`Math.min` propagate).
      No rounding variant: the two rounding call sites keep `Math.round(...)` explicit at the call
      site, since folding it in would make the helper two concepts.
- [x] Migrated **12** genuine clamp sites, one at a time with `typecheck` between:
      `heading-align.ts`, `source-map.ts` ×2, `reveal-range.ts`, `echarts-theme.ts` ×3,
      `mermaid-palettes.ts`, `image-convert.ts`, `caret.ts`, `echarts-retheme.ts`,
      `diagram-zoom.ts`, `d2-geometry.ts:78`.
- [x] **One genuine clamp deliberately left inline: `media-src/src/nav/outline-resize.ts`.** This is
      the finding that justifies the whole classify-don't-replace approach, so it is recorded in
      full rather than as a footnote. The site is
      `Math.min(maxW, Math.max(MIN_WIDTH, width))` where `MIN_WIDTH = 100` and
      `maxW = Math.floor(viewportWidth * 0.5)` (`MAX_WIDTH_RATIO = 0.5`) — both read from
      `outline-resize.ts:13,14,30`. **On a viewport narrower than 200px, `maxW < MIN_WIDTH`, i.e.
      `lo > hi`** — and the two spellings disagree exactly there:
      | expression | result when `maxW < MIN_WIDTH` |
      |---|---|
      | existing `Math.min(maxW, Math.max(MIN_WIDTH, width))` — `Math.min` last, **`maxW` wins** | `maxW` — panel capped at half the viewport ✅ |
      | shared `clamp(width, MIN_WIDTH, maxW)` — `Math.max` last, **`MIN_WIDTH` wins** | `100` — panel claims MORE than half a very narrow webview ❌ |
      The existing behaviour is the correct one, and this runs on **every mousemove during a drag**,
      so the difference is reachable, not theoretical. Left inline with a comment stating the
      reason. Bending the shared helper's tie-break to suit this one call site was rejected: it
      would silently change the other 12.
- [x] Left every "NOT clamps" site untouched, each with a one-line comment naming task 499 so the
      next reader does not re-open it: `plantuml-render.ts` ×2 (colour-channel **spread**),
      `d2-geometry.ts` ×3 (interval **intersection** in `wallDist` and both `parDist` branches).
      Verified against the diff: `plantuml-render.ts` shows **zero** changed `Math.max`/`Math.min`
      lines.
- [x] Unit-tested the shared helper — `media-src/src/util/clamp.test.ts`, 6 tests covering
      boundaries, `lo > hi`, and NaN. (Placed in the webview tree rather than `test/backend/`
      purely because that path was reserved by a concurrent task at the time; it is a cross-tree
      import either way.)

### The D2 layout cluster — classified, deliberately NOT migrated

The 26 sites the filing survey missed, hand-classified during implementation:

| site | verdict |
|---|---|
| `astar.ts:146`, `astar.ts:148` | genuine clamp |
| `d2-refine.ts:158`, `d2-refine.ts:205` | genuine clamp |
| `d2-refine.ts:369-370` | **trap** — looks like a clamp, is a directional bound |
| remaining ~18 in `d2-refine.ts` | segment/interval **overlap** tests, not clamps |

**Not migrated, on purpose.** The D2 layout pipeline has no numeric unit coverage, and it is
precisely where an argument-order slip of the `outline-resize` kind would ship undetected — the
same failure the table above shows is real, in code with no test to catch it. **Prerequisite for a
follow-up: unit coverage over those functions FIRST, then migration — not the other way round.**

## Verification

All exit codes read directly. Run on a tree that also carries
[task 498](498-knip-baseline-cleanup.md)'s and [task 500](500-vendored-asset-usage-check.md)'s
uncommitted changes — none of the three overlap in the files they touch, but the gates below
exercise all of it together, so a green result covers the combined tree, not this task in isolation.

- [x] `npx tsc -p media-src/tsconfig.typecheck.json --noEmit` (webview) — exit 0.
- [x] `npx tsc -p tsconfig.json --noEmit` (host) — exit 0. Both trees matter here: `clamp` is the
      first `src/shared/` module this task added, and `reveal-range.ts` is a host-side consumer.
- [x] `npm test` — exit 0, **196 files / 2754 tests passed, 0 skipped** (up from 195/2748: the 6 new
      `clamp.test.ts` cases). `uptime` checked first — load 4.22, and the count is the full count,
      so no task-476 silent-skip.
- [x] `npx vitest run test/backend/module-boundaries.test.ts` — 7/7, after registering `clamp` in
      the module manifest.
- [x] `node build.mjs` — exit 0.
- [x] `xvfb-run -a npm --prefix media-src run test:e2e` — chromium harness, **456 passed / 5
      skipped** (2.9 min). Covers the `caret.ts` / `outline-resize.ts` / `diagram-zoom.ts` call
      sites at the browser level, which is where an off-by-one would show and typecheck would not.
- [x] `xvfb-run -a npm run test:vscode:fast` — real-VS-Code routine tier, exit 0, **39 passed**
      (11.1 min), **2 flaky** (`block-fidelity.spec.ts:358`, `paste-real.spec.ts:17`) — both green
      on retry, both in the known-flaky clipboard/focus class (see the flaky-focus note in
      DEVELOPMENT.md), and neither touches a migrated `clamp` call site.
- [x] `npm run lint:ci` — exit 0, 710 files, 0 warnings.
- [x] `npm run quality` — re-run on the tree WITH this task's edits. Per-stage:
      **PASS** lint:ci · **FAIL** knip · **PASS** jscpd · **PASS** depcruise · **PASS**
      test:coverage · **PASS** check:coverage-modules. The single FAIL is task 498's 5 accepted
      devDependency false positives (`d3`/`three`/`vega`/`vega-embed`/`vega-lite`) — the documented
      by-design state, not this task's. Coverage 75.7% lines / 8559 of 11305.
      `check:coverage-modules`: "Coverage ratchet OK — 17 source module(s) at 0% (baseline 19)",
      and it again reports the pre-existing drift that `diagram-zoom.ts` and `link-click-fix.ts`
      now have coverage and could be pruned from `BASELINE_ZERO` — noted, not acted on (also
      recorded in task 500's write-up; `diagram-zoom.ts` is touched by this task, but it was
      already off baseline-zero before, so this is not a change this task caused).
- [x] **Argument-order audit — every one of the 12 migrated call sites re-read against its
      original expression.** This, not a style pass, is the review this refactor actually needed:
      the shared helper is `max(lo, min(v, hi))`, and 6 of the 12 originals were written in the
      mirrored `min(hi, max(lo, v))` order, which differs *only* when `lo > hi`. Verdict: **all 12
      equivalent**, because at every site the bounds are either literal constants in order
      (`image-convert` 1/100, `echarts-retheme` 140/900, `echarts-theme` 0.45/1, 0.55/0.72,
      0.38/0.55, `mermaid-palettes` 0/255), ordered module constants (`diagram-zoom` MIN_K/MAX_K),
      or provably `lo <= hi` (`source-map` 0..`md.length`; `reveal-range` 0..`lastLine`, itself
      `Math.max(0, …)`; `heading-align`'s original tested `lo` first, same winner as the helper).
      The one site worth naming: **`caret.ts:180`** — `clamp(index, 0, kids.length - 1)` would hit
      `lo > hi` on an empty `kids`, but `caret.ts:179` is an explicit
      `if (kids.length === 0) break` immediately above it, so the case is unreachable. (Even if it
      were reached, old and new both index out of range and yield `undefined`.)
- [x] Simplify pass via the `/simplify` skill — run, all four angles.
      **Efficiency: clean**, and checked rather than asserted — `media-src/esbuild-shared.mjs`
      bundles the webview into one flat output, so after bundling `clamp` is just another function
      in the same scope: no dynamic import, no separate chunk, no runtime module boundary. The
      `../../../src/shared/*` cross-tree pattern already exists in ~15 files, several on equally
      hot paths, so this diff follows precedent rather than opening a new seam.
      **Reuse: clean** — no numeric-utility module was bypassed (`src/shared/` and
      `media-src/src/util/` are both one-concern-per-file; `mermaid-palettes.ts`'s numeric helpers
      are colour-domain), and no parallel clamp survives outside the three intentional exclusions.
      **Two findings applied:**
      1. *(altitude + simplification, same finding)* Test moved
         `media-src/src/util/clamp.test.ts` → **`test/backend/clamp.test.ts`**, import shortened to
         `../../src/shared/clamp`, and the stale "another agent owns test/backend/" comment
         dropped. Every other unit-tested `src/shared/` module lives there —
         `test/backend/mermaid-palettes.test.ts`, `echarts-theme.test.ts`, and `heading-slug.test.ts`
         (the very module `clamp.ts`'s own header cites as its precedent). Note this was a
         *convention* fix, not a coverage fix: both reviewers independently verified
         `test/vitest.config.ts` globs and covers both trees in one run, so `src/shared/clamp.ts`
         reported 100% either way and was never at risk of the 0%-ratchet. Re-verified after the
         move: 6/6, and `npm test` still 196 files / 2754 tests.
      2. *(simplification)* `d2-geometry.ts:273` — the "NOT a clamp" comment transcribed the
         interval-intersection algebra that is literally the next two lines. Verdict kept, algebra
         dropped; the sibling branch's comment was already correctly terse.
      **Two findings skipped, with reasons:**
      - *"Tie-break rationale duplicated between clamp.ts and outline-resize.ts."* Re-read both:
        `clamp.ts` states the contract and points at the call site, `outline-resize.ts` works out
        the consequence. That is one derivation plus one pointer, not two derivations. Tightened
        the `clamp.ts` wording anyway so the ownership is unambiguous, and dropped a speculative
        "add validation at the call site" clause the same reviewer flagged as advice for a caller
        that does not exist.
      - *"`mermaid-palettes.ts` de-exports `lower` — a drive-by in a task titled 'consolidate
        clamp'."* Correct observation, wrong task: that line is **task 498's** knip cleanup. It
        only appeared in this review because both tasks touch that file and the diff handed to the
        reviewers was assembled per-file, not per-task. Nothing to fix.
      Post-fix gates re-run: `tsc` webview 0 · `tsc` host 0 · `lint:ci` 0 (710 files) ·
      `test/backend/clamp.test.ts` 6/6.

## Out of scope

- Any behaviour change at a call site, including "fixing" a clamp whose bounds look wrong. If one
  looks wrong, file it separately rather than folding a fix into a refactor.
- The `Math.min`/`Math.max` non-clamp sites listed above.
- The D2 layout cluster (`astar.ts`, `d2-refine.ts`) — classified above, migration deferred behind
  the unit-coverage prerequisite. This is the one genuine follow-up this task leaves.

## To finish before calling this done

- [ ] `npm run quality` on the current tree, and record the per-stage PASS/FAIL summary here.
      Expect `knip` to be the only FAIL (task 498's 5 accepted devDependency false positives); any
      other red stage is this task's.
- [ ] A simplify pass over the diff.
