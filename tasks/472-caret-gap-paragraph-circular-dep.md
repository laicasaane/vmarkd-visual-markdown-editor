# Task 472 — Break the caret.ts ↔ gap-paragraph.ts circular dependency

**Status:** 📋 OPEN · **Impact:** 🟢 no behaviour change intended — pure module-structure cleanup ·
**Origin:** [task 469](469-housekeeping-sweep.md) item 5d, `dependency-cruiser`'s first run,
2026-07-31/08-01.

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

- [ ] Identify the exact cross-import(s) forming the cycle.
- [ ] Break it (extract shared helper, or invert a dependency direction).
- [ ] `npm run depcruise` reports 0 violations.
- [ ] Relevant caret + gap-paragraph unit/e2e specs still pass.
