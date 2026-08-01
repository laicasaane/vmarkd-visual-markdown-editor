# Task 173 — Scope the 3 synchronous per-keystroke observers to the mutated subtree

**Status:** SHIPPED 2026-07-30 — the full sync-trio scoping (all 3 observers) is done, see below.
**Source:** vMark edit-responsiveness analysis (2026-06-28, workflow `wf_2c64003e-264`).

## Shipped 2026-07-30 — full sync-trio scoping (mutation-scope.ts)

All 3 observers (`observeCodeSource`, `observeCallouts` incl. its `previewEl` instance,
`observeHtmlComments`) now scope their re-decoration to the top-level block(s) a batch actually
touched instead of a whole-root `querySelectorAll`, via a new shared module
`media-src/src/mutation-scope.ts`.

**A load-bearing fact that reshaped the plan** (verified empirically with a jsdom probe before
writing any scoping logic — see `mutation-scope.ts`'s own module doc comment): `record.target` is
**not** a usable "big structural change" signal. Vditor's *common, per-keystroke* block replace
(`blockElement.outerHTML = html`, `ir/input.ts:185`) fires a childList record whose `target` is the
block's **parent** — i.e. the *same* `ir.element` root that the *rare* whole-editor rebuilds
(`:183`'s `isIRElement` innerHTML replace, `:205-231`'s link-ref-def/footnote relocation) also
target. Implementing this task's original "`record.target === ir.element` → full walk" plan literally
would have fired on **every single keystroke**, giving 0% improvement for the dominant case. Instead,
scoping keys off `addedNodes` (whichever top-level block RECEIVED new content) — resolved via a
per-mutated-node dynamic climb to the nearest `.vditor-reset` ancestor (needed because `callouts`/
`html-comment` are bound to the *wider* `#app`, which holds the IR and WYSIWYG mode elements as
siblings — `topLevelBlock(fixedRoot, node)`-style climbing from `gap-paragraph.ts` doesn't work
there). A `FULL_WALK_BLOCK_THRESHOLD` (6) turns "fall back to a full walk" from a special case into
an emergent property: `:183`/`:205-231` naturally touch many top-level blocks at once and cross it;
`:185`'s common 1-block replace never does.

**Files:**
- `media-src/src/mutation-scope.ts` (new) — `scopeMutations(records)` (the block-resolution + full-walk
  fallback + task 174's decoration-only drop, see 174's own entry) and `queryIncludingSelf` (a scoped
  block can itself BE the thing a full-root walk was looking for, e.g. the block IS a `<blockquote>`).
- `media-src/src/observe-coalesce.ts` — added `coalescePerFrameWithRecords` alongside the existing
  `coalescePerFrame` (unchanged, still used by the 7 rAF-coalesced observers + `observePreviewComments`):
  same leading-sync + trailing-rAF coalescing, but accumulates the `MutationRecord[]` across a burst
  and hands the union to `fn`, since scoping needs the records, not just a "something changed" ping.
- `media-src/src/code-source.ts` — `observeCodeSource` scoped (`tagCodeSource(block)` per resolved
  block instead of `tagCodeSource(editorEl)`; its selector is nested under the block so this needed no
  new self-match helper).
- `media-src/src/callouts.ts` — new `applyCalloutsWithin(block)` (uses `queryIncludingSelf` — a scoped
  block CAN itself be the `<blockquote>`); `observeCallouts` wired to it.
- `media-src/src/html-comment.ts` — extracted `decorateHtmlBlock(block)` (shared by the full-root
  `applyCommentPreviews` and the new scoped `applyCommentPreviewsWithin`, again via
  `queryIncludingSelf` — a block can itself carry `data-type="html-block"`); `observeHtmlComments`
  wired to it. `observePreviewComments` (Preview-pane Comment-node walker) is untouched — task 173
  never named it, different mechanism.
- `media-src/src/finish-init.ts` — fixed the stale "`applyCallouts` is rAF-debounced" comment (it's
  sync-leading + rAF-trailing-coalesced, not rAF-debounced; now also notes the task-173 scoping). The
  file no longer has a SECOND such stale comment at the old `:87` location — that one was already gone
  before this task started (prior unrelated edits), nothing left to fix there.

**Measured** (`test/vscode-e2e/perf-observer-fleet.spec.ts`, same heavy fixture as 176's
2026-07-27 measurement, real VS Code headless, isolated `git worktree` baseline at the pre-change
commit vs. this change, single machine/session — treat as directional, not lab-grade, given
worktree-to-worktree process variance):

| scenario | selector | before | after | Δ |
|---|---|---|---|---|
| prose | `blockquote` (callouts) | 20.7ms / 60 calls | 9.1ms / 60 calls | −56% |
| prose | `.vditor-ir__marker--pre > code` (code-source) | 21.6ms / 60 calls | 8.9ms / 60 calls | −59% |
| prose | `[data-type="html-block"]` (html-comment) | 18.4ms / 60 calls | dropped out of top-8 (< 9ms) | ≥ −50% |
| prose | OBSERVER-selector subset (also incl. non-task-173 selectors) | 267.3ms | 130.7ms | −51% |
| code | `blockquote` | 9.0ms / 60 | 5.7ms / 60 | −37% |
| code | `.vditor-ir__marker--pre > code` | 10.7ms / 60 | 5.2ms / 60 | −51% |
| code | OBSERVER-selector subset | 90.7ms | 67.5ms | −26% |

Call **counts** stayed identical (60 = deliveries, matching task 174's expectation that typing plain
prose doesn't itself produce decoration-only writes for these 3 observers — that filter's effect
isn't visible in THIS benchmark, see task 174). The win is purely **scope**: each call now searches
one small block instead of the whole editor, which is exactly what this task set out to do.
Total-blocking deltas were also large (prose 3469ms→1352ms) but are NOT reported as attributable here
— they include noisy worktree-to-worktree variance (a fresh VS Code download's disk I/O in the
baseline run) that the per-selector numbers above don't share.

**Verified:**
- Unit: `mutation-scope.test.ts` (15 tests, 100% line/branch/function/statement coverage on the new
  module — incl. the "why not `record.target`" case, the full-walk threshold, task 174's decoration
  filter, the "never target-based" mixed-record case, and 3 defensive-path tests added specifically to
  close branches: a stray non-element addedNode, an out-of-root record short-circuiting a later
  resolvable one, and a text node with no block wrapper). Plus new `observeCodeSource`/
  `observeCallouts`/`observeHtmlComments` scoping tests in their own `*.test.ts` files that exercise
  the REAL MutationObserver-driven path (a genuine DOM mutation + a deterministic stubbed-rAF flush),
  not a direct `applyX()` call — every pre-existing test in these 3 files calls `applyCallouts`/
  `tagCodeSource` directly, which never reached the new scoped branch, so these were a real gap.
- Real-VS-Code e2e (MANDATORY, written + run): `test/vscode-e2e/scoped-decoration.spec.ts` (new, 4
  tests, run 3× clean = 12/12) — the exact verification this task's own checklist asked for: a
  blockquote-/code-/comment-heavy fixture (3 callouts, 3 code blocks, 3 comments, TWO scattered
  link-ref-defs to exercise the `:205-231` relocation on every edit) asserting decoration survives an
  edit in an unrelated block, a callout rename only clears the ONE renamed callout, a code-source edit
  re-tags the FRESH `<code>` the spin rebuilt, and — for the `:183` isIRElement path specifically —
  typing the very first callout into a brand-new empty document still decorates correctly.
- Regression (MANDATORY per this task's checklist): `callout-edit.spec.ts`, `callout-rename.spec.ts`,
  `callouts-mode.spec.ts`, `diagram-bg.spec.ts`, `perf-observer-fleet.spec.ts` all green, plus the full
  `test:vscode:fast` tier (39/39). `npm test` (2130/2130), `npm run typecheck`, `npm run lint:ci`
  (whole tree, 0 warnings) all clean.

**Not done / consciously left out:** none of this task's checklist items — every one is ticked below.

## Shipped instead 2026-06-30 — WYSIWYG-highlight mode-gate (the cheap, zero-risk subset)
Measured (`test/vscode-e2e/perf-observer-fleet.spec.ts`, heavy doc) that the observer fleet is only ~9%
of per-keystroke blocking (the dominant ~85% is the `blockElement.outerHTML` rebuild + reflow — task
180/175), so the full per-observer scoping below is single-digit-% ROI at real no-flash risk. The one
clearly-wasted scan was the **WYSIWYG code-highlight observer** (`observeWysiwygCodeHighlight`,
`wysiwyg-code-highlight.ts`) running `pre.vditor-wysiwyg__pre > code` across the whole mount on EVERY
**IR** keystroke (~15–30 ms/burst, measured) — it's WYSIWYG-only. Gated it behind
`getCurrentMode()==='wysiwyg'` (the `tagSources`/`schedule`/`run` calls + the install-time pre-tag);
the within-WYSIWYG flash-free pre-highlight of unfocused sources is preserved (the gate passes in
wysiwyg), and the IR→WYSIWYG switch re-highlights via the switch's selectionchange. Verified: unit gate
(`wysiwyg-code-highlight.test.ts`), the wasted selector gone from the fleet measurement, all 10
`wysiwyg-highlight` harness tests green, and a real-VS-Code IR→WYSIWYG switch re-highlight
(`wysiwyg-modegate.spec.ts`). The full sync-trio scoping (173) + amplification dedup (174) stay deferred
as marginal.
**Value / Risk:** 🟨 medium on large / blockquote-heavy / code-heavy docs (marginal on typical docs) / 🟡 medium (record→block mapping + a correct full-walk fallback).
**Engines:** none (decoration observers).

## Problem

`observeCodeSource` (`code-source.ts:71-73`), `observeCallouts` (`callouts.ts:394-396`) and
`observeHtmlComments` (`html-comment.ts:96-98`) are each `new MutationObserver(() =>
fullWalk(editorEl))` — they **ignore the `MutationRecord`s** and run a **whole-`#app`
`querySelectorAll` on every keystroke, synchronously, before paint** (not rAF-coalesced). The spin
replaces **one** block's `outerHTML` (`ir/input.ts:185` — a single record), yet each observer
re-queries the whole editor; cost scales with `#blockquotes` / `#code-blocks` / `#html-blocks`. This
is the largest pure **side-effect** cost and is identical for prose and diagram-source editing.

> The `finish-init.ts:73/:87` comments claiming these are "rAF-debounced" are **stale** — the live
> code is synchronous. Fix the comments as part of this task.

These observers are synchronous **by design** — the no-flash-before-paint contract (`code-source.ts:14-16`,
`callouts.ts:383-388`) keeps the raw `[!TYPE]` marker / un-coloured source from flashing. So the goal
is to keep them sync but turn **O(document)** into **O(changed block)**.

## Plan

Pass the `MutationRecord`s into each callback; for each record resolve `record.target`'s (or its
`addedNodes`') closest top-level block and `querySelectorAll` **within** that block; dedupe across
the batched records (union the closest-block of `record.target` **and** `addedNodes`). Existing
idempotent guards (`decorateCallout` signature `callouts.ts:127`, comment sig `html-comment.ts:49`,
`.hljs` tagging) keep re-decoration safe.

> **As shipped:** resolution is keyed off `addedNodes` only, never `record.target` — see "Shipped
> 2026-07-30" above for why the target-based half of this plan doesn't work (target is the SAME
> `ir.element` for both the common per-block replace and the rare whole-editor rebuilds, so it can't
> distinguish them). `characterData` records (no `addedNodes`) resolve via `target`, per the
> constraint below.

## Constraints
- [x] **Keep synchronous** (do NOT rAF — the flash contract). Leading edge of
  `coalescePerFrameWithRecords` is still fully synchronous, before paint.
- [x] **Full-walk fallback for MORE than one case** — shipped as an emergent property
  (`FULL_WALK_BLOCK_THRESHOLD`) rather than a literal `record.target === ir.element` check, which
  turned out to be unusable (see "Shipped 2026-07-30" above). Both `:183` and `:205-231` verified to
  correctly widen to full once they touch several top-level blocks; the common `:185` path stays
  scoped. Covered by `mutation-scope.test.ts` + `scoped-decoration.spec.ts`'s isIRElement and
  link-ref-def-relocation cases.
- [x] `characterData` records carry no `addedNodes` → always pass, resolved via `target`. Covered by
  `mutation-scope.test.ts` and exercised in the callout-rename e2e case.
- [x] Round-trip / caret untouched — scoping changes only the search scope, never what gets decorated
  or touches selection; unchanged by every existing callout/comment/code-source test staying green.
- [x] Scoping alone does not remove the cross-observer wakeup amplification — confirmed, and folded
  into the same `scopeMutations()` call as task 174's decoration-drop (see 174's own file for why they
  share one function/PR rather than landing separately).

## Verification
- [x] **Real-VS-Code e2e (MANDATORY):** `diagram-bg.spec.ts` / `callout-edit.spec.ts` /
  `callout-rename.spec.ts` / `callouts-mode.spec.ts` stay green; new
  `test/vscode-e2e/scoped-decoration.spec.ts` (4 tests) covers a blockquote-/code-heavy fixture with
  edits in arbitrary blocks incl. the link-ref-def relocation firing on every edit and the isIRElement
  empty-doc path.
- [x] Fixed the stale `finish-init.ts` `rAF-debounced` comment (only one remained live in the current
  file; the historical second `:87` instance was already gone before this task started).
- [x] `tsc` + `biome` + vitest + Playwright, headless, all clean. Coverage verified — `mutation-scope.ts`
  100/100/100/100 (line/branch/fn/stmt); `code-source.ts`/`html-comment.ts`/`callouts.ts`'s NEW code
  (the scoped branches + `applyCalloutsWithin`/`decorateHtmlBlock`/`applyCommentPreviewsWithin`) is
  exercised by dedicated MutationObserver-driven unit tests, not just the e2e layer.

## See also
- **176 stays de-prioritized** — see its own file. 173+174 shipping together doesn't change 176's
  verdict (the observer fleet was already confirmed minority-cost twice independently; scoping shrinks
  it further, which if anything weakens the case for the dispatcher rewrite, not strengthens it).
- `code-source.ts`, `callouts.ts`, `html-comment.ts`, `finish-init.ts`, `mutation-scope.ts`,
  `observe-coalesce.ts`; memory `callouts-observe-app-mount`, `github-theme-leaks-onto-ir-source`.
