# Task 472 — Break the caret.ts ↔ gap-paragraph.ts circular dependency

**Status:** ✅ DONE · **Impact:** 🟢 no behaviour change — pure module-structure cleanup ·
**Origin:** [task 469](469-housekeeping-sweep.md) item 5d, `dependency-cruiser`'s first run,
2026-07-31/08-01.

## What was done (2026-08-01)

By the time this was picked up, task 460's physical module decomposition had already moved both
files into `media-src/src/editing/` — the cycle is the same one, just at
`media-src/src/editing/caret.ts` ↔ `media-src/src/editing/gap-paragraph.ts`.

**The exact cross-imports that formed the cycle:**
- `caret.ts`'s `resolveCaretIntent()` (the `'document-end'` branch) imported
  `trailingCaretTarget` from `gap-paragraph.ts` — the SHAPE half of the trailing-paragraph
  invariant ("where does the caret belong").
- `gap-paragraph.ts`'s `setupTrailingNav()` imported `requestCaret` from `caret.ts` — the WRITE
  half (actually placing the Range there on ArrowDown-at-EOF).

Both imports were used only inside function bodies (never at module-evaluation time), so nothing
was broken at runtime — this was a pure structural cycle, exactly as task 469 found it.

**Where the shared piece now lives:** a new file, `media-src/src/editing/trailing-paragraph.ts`
— a third, lower module both `caret.ts` and `gap-paragraph.ts` import from, following the
`elk-layout.ts`/`d2-refine.ts` precedent. It holds the trailing-paragraph invariant's pure-DOM
SHAPE logic, extracted out of `gap-paragraph.ts`: `ZWSP`, `isEmptyGapParagraph`, `TRAILING_ATTR`,
`TRAILING_ACTIVE_CLASS`, `markTrailingActive`, `endsWithBlock`, `isHelper`,
`ensureTrailingParagraph`, and `trailingCaretTarget` (plus two file-private helpers,
`lastContentChild`/`makeTrailing`). It imports nothing from `caret.ts` or `gap-paragraph.ts`, so:
- `caret.ts` now imports `trailingCaretTarget` from `./trailing-paragraph` (no more edge into
  `gap-paragraph.ts`).
- `gap-paragraph.ts` imports the shape helpers it still needs (`ZWSP`, `endsWithBlock`,
  `ensureTrailingParagraph`, `isEmptyGapParagraph`, `isHelper`, `markTrailingActive`,
  `TRAILING_ATTR`) from `./trailing-paragraph`, and still imports `requestCaret` from `./caret`
  for `setupTrailingNav`'s actual placement — that edge is now one-directional (nothing imports
  back from `caret.ts` into `gap-paragraph.ts`), so the cycle is gone.

`requestCaret`'s stateful caret-authority machine was deliberately NOT moved or duplicated — it's
imported directly by five other `editing/*.ts` files (hr-nav, editor-caret, focus-restore,
initial-caret, caret-preserve); relocating it would have forked that authority. Stuffing the
trailing-paragraph DOM-shape logic into `caret.ts` instead (the literal `alignRows`-into-consumer
shape of the `elk-layout`/`d2-refine` precedent) was considered and rejected: `caret.ts` is a
generic, reusable caret-placement primitive with five unrelated importers, and none of them care
about trailing-paragraph shape — a third module keeps that concern out of it.

Test file split to match: `trailing-paragraph.test.ts` (new) holds the describe blocks for the
moved functions (`ensureTrailingParagraph`, `trailingCaretTarget`, the `#fix-table-ir-wrapper`
trap, `markTrailingActive`); `gap-paragraph.test.ts` keeps the rest (`ensureLeadingBlock`,
`cleanupGapParagraphs`, `isThematicBreakParagraph`, `promoteThematicBreaks`), importing
`ensureTrailingParagraph` from the new module for one integration test.

**Module-boundary allowlist:** unchanged, as required. `trailing-paragraph.ts` lands in the
`editing` module (same as `caret.ts`/`gap-paragraph.ts`) — added its id to
`scripts/module-manifest.mjs`'s `editing.ids` list (manifest totality only; intra-module edges
are unconstrained per `module-boundaries.test.ts`). Verified: `npm test -- module-boundaries`
passes with zero changes to `WEBVIEW_ALLOWED_EDGES`.

**Gates run, all green:**
- `npm run depcruise` → 0 violations (host: 52 modules/105 deps; webview: 163 modules/340 deps,
  up from 162/339 pre-change by exactly one new node).
- `node scripts/module-manifest.mjs` → OK, total and disjoint (webview 146/146 ids match disk).
- `npx vitest run test/backend/module-boundaries.test.ts` → 7/7 passed, no allowlist edit needed.
- `npm test` (full unit suite) → 183 files / 2561 tests passed.
- `npm run typecheck` → clean.
- `npx biome check` scoped to every file this task touched → clean (0 errors/warnings). Note:
  whole-tree `npm run lint:ci` was red during this work from OTHER concurrent agents' in-flight,
  uncommitted changes in this shared working directory (`test/backend/lute-artifact.ts`,
  `lute-host.test.ts`, `vditor-fidelity-bugs.test.ts`, `webview-overlay.test.ts`) — none of those
  are files this task touched; confirmed by scoping biome to this task's files directly.
- `node build.mjs` → succeeds.
- Real-VS-Code e2e: `xvfb-run -a npm --prefix test/vscode-e2e test -- trailing.spec.ts
  bottom-gap.spec.ts caret-authority-rebuild.spec.ts` → 3/3 passed (the trailing-paragraph
  reveal/collapse behaviour, the EOF gap, and caret.ts's requestCaret surviving a full rebuild —
  the three real-webview behaviours this refactor could plausibly have disturbed).

## What was found

`dependency-cruiser`, scanning `media-src/src/` with a `no-circular` rule (see
`.dependency-cruiser.cjs`), found one real circular dependency in the webview tree:

```
media-src/src/caret.ts → media-src/src/gap-paragraph.ts → media-src/src/caret.ts
```

(`npm run depcruise` reproduces it; `src/` — the extension host — has zero violations, so this is
webview-only.) This is the only cycle in the tree; everything else is clean.

## Why it matters

A two-file import cycle isn't automatically a bug — TypeScript/esbuild both handle it — but it's a
structural smell worth resolving deliberately rather than leaving as an accepted exception:

- It makes the two files harder to reason about independently (a change to either can only be fully
  understood by reading both).
- It's exactly the shape [task 460](460-module-decomposition-physical-move.md) (physical module
  decomposition) needs to not re-introduce once it moves code between files — better to understand
  and break this one now, while it's small (one pair, not a chain), than to let it get carried along
  or multiply during that larger move.
- `gap-paragraph.ts` already had one prior import-cycle fix of exactly this shape: per its own
  comments (`d2-refine.ts`'s `alignRows` doc, and `elk-layout.ts↔d2-refine.ts`), this codebase has
  broken a cycle between these two files before by moving a function — the same fix pattern likely
  applies here.

## What to actually do (not investigated yet — this task is the finding, not the fix)

1. Read both files' current exports/imports and find the specific symbol(s) each depends on from
   the other. Likely candidates given their names: a caret-placement helper `gap-paragraph.ts` calls
   into `caret.ts` for, and a gap-paragraph-cleanup helper `caret.ts` calls back into
   `gap-paragraph.ts` for (or vice versa) — confirm rather than assume.
2. Pick a break: extract the shared piece into a third, lower-level module both import from (the
   pattern already used for the `elk-layout.ts`/`d2-refine.ts` cycle, per `d2-refine.ts`'s
   `alignRows` comment: "lived in elk-layout.ts until the elk-layout↔d2-refine import cycle was
   broken by moving it here with the rest"), or invert one direction via a callback/parameter instead
   of a direct import.
3. Re-run `npm run depcruise` — the fix is done when it reports 0 violations for `media-src/src/`.
4. Existing caret/gap-paragraph unit + real-VS-Code e2e coverage should catch any behavioural
   regression from the refactor; run the relevant specs, don't just trust the type-checker.

## Checklist

- [x] Identify the exact cross-import(s) forming the cycle.
- [x] Break it (extract shared helper, or invert a dependency direction) — extracted
      `trailing-paragraph.ts`, see "What was done" above.
- [x] `npm run depcruise` reports 0 violations.
- [x] Relevant caret + gap-paragraph unit/e2e specs still pass.
