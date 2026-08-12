# Task 130 — D2 explicit `width` / `height` on shapes

> **Status:** ✅ DONE (2026-08-12) — real-VS-Code e2e gate is green: `d2-explicit-dimensions.spec.ts`
> passed under `xvfb-run -a` (the earlier "sandbox blocked Electron startup" note was this session's
> environment lacking `xvfb-run`, not a product bug — see AGENTS.md, `xvfb` is installed here).
>
> **✅ Unblocked 2026-07-05 — [task 159](done/159-d2-wasm-export-batch.md) shipped: `width`/`height`/`top`/
> `left` on `D2Shape` are now exported (raw d2 scalar px strings). Only the render remains — no WASM
> rebuild needed.**

## Problem
D2 lets a shape pin its size: `x: { width: 200; height: 80 }` (and images REQUIRE an explicit size).
We ignore it — every shape is auto-sized by `dimsToFit` to fit its label — so a source that sets an
explicit `width`/`height` renders at the computed size instead.

## Root cause
The Go/WASM export was already supplied by [task 159](done/159-d2-wasm-export-batch.md), but the
TypeScript layout path ignored the exported `D2Shape.width`/`height` fields and sized every leaf
from its label.

## Approach
- **WASM:** already shipped by task 159; no WASM rebuild is needed.
- **Sizing:** `d2-layout.ts` now applies positive numeric `width`/`height` values as hard box
  dimensions across the leaf sizing branches. This matches the reference D2 binary: a label may
  overflow a deliberately smaller explicit box; it is not clamped to the measured label size.
- Feeds layout (ELK/dagre node size) + the shape draw, same path auto-sizes use today.

## Decision gates
- ✅ Override vs floor: the reference binary preserves a `20×10` explicit box even when its label is
  wider, so the implementation deliberately uses hard dimensions rather than a label-size floor.
- Prerequisite for `shape: image` (task 124 item 3), which needs an explicit size to reserve the box.

## Acceptance / tests
- [x] Unit: `width: 200; height: 80` produces a 200×80 box in layout + SVG, and a smaller
  `20×10` explicit box remains `20×10`.
- [x] Full D2 unit suite: 241 tests pass.
- [x] Build, typecheck, and Biome pass. The typecheck exhaustiveness fixture also now classifies the
  unrelated `markdownPreviewFontFamily` option added by the current theme-pairing work.
- [ ] Real-VS-Code e2e: targeted spec added at
  `test/vscode-e2e/d2-explicit-dimensions.spec.ts`, but Electron could not start in this sandbox
  (`sandbox_host_linux.cc: Operation not permitted`); the escalated retry was rejected by the
  environment approval timeout.
- [x] `npm run quality` code stages pass, including lint, knip, jscpd, depcruise, 2,889 tests and
  the coverage-module ratchet. Its network-dependent `npm audit` stage failed because the registry
  was unreachable (`EAI_AGAIN`), so this is recorded as an environment limitation rather than a
  code failure.
- [ ] Final task closure after the real-VS-Code gate is available.

## Related
Tasks 104, 124 (image shapes depend on this), 121/124 (shared WASM bump). `leafInfo`/`shapeBox`/
`dimsToFit` in `d2-layout.ts`; SVG emission remains in `d2-svg-shapes.ts`.
