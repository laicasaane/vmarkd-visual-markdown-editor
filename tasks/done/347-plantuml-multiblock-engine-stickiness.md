# Task 347 — PlantUML: multiple diagrams in ONE document flake ("Assumed diagram type: sequence")

> **Status:** ✅ FIXED (2026-07-04). Root-caused to a **concurrency race**, NOT the engine's diagram-type
> stickiness the title/first draft assumed. Fixed with a `loadScript` in-flight dedup + a module-level
> render-serialisation queue. Verified deterministic: the 5-diagram repro renders every block clean across
> 13 consecutive runs (65/65 blocks, 0 errors). From task 136; builds on 87/136/178.

## Symptom
A document with SEVERAL PlantUML diagrams (esp. C4/AWS/Azure icon diagrams) renders MOST of them but a
random one (different each run) fails with a PlantUML error SVG — "Syntax Error" (undefined macro) or
"Assumed diagram type: sequence". Single/isolated diagrams always render fine. Repro:
`test/vscode-e2e/fixtures/plantuml-multiblock.md` (5 icon diagrams).

## Root cause (CORRECTED — the original "type stickiness" diagnosis was WRONG)
Vditor calls `plantumlRender` **once per block**, so opening a multi-diagram doc runs several invocations
**concurrently**. Two concurrency bugs, together, produced the flake — instrumented and confirmed (per-block
`mapKeys` logging):

1. **`loadScript` resolved too early for concurrent callers** (the primary cause). When two blocks
   reference the SAME stdlib lib (e.g. two C4 diagrams), both call `loadScript(<lib>.js, id)`. The first
   creates the `<script>` tag and awaits `onload`; the second saw the tag already present and **resolved
   immediately — before the script had executed** — so it read an **empty** `window.__vmarkdPumlStdlib`
   (verified `mapKeys:0`). Its `!include <lib/…>` then expanded to nothing → the C4/AWS macros were
   undefined → "Syntax Error" (and with the C4 setup missing, PlantUML fell back to "assumed sequence" —
   which looked like type-stickiness but wasn't).
2. **Concurrent `render()` calls raced the shared TeaVM engine** — a block occasionally produced no SVG at
   all (dropped), because the invocations overlapped on the one engine instance.

## Fix
- **`media-src/src/load-script.ts`** — track in-flight loads in a `Map<id, Promise>`; concurrent callers
  for the same id **share the one pending promise** (wait for the real load) instead of resolving on the
  half-created tag. Unit-tested (`load-script.test.ts`, 100%).
- **`media-src/src/plantuml-render.ts`** — a module-level `renderQueue` promise chain **serialises every
  block's render across all invocations** (extracted `renderPlantumlBlock`, awaited one at a time). The
  placeholder (task 139) is shown synchronously at enqueue so queued blocks still signal "Rendering…"
  immediately. No per-block re-import, no `__pl_script_state` clearing — both were tried and are NOT needed
  once the two races are closed.

Cost: a 5-diagram doc renders serially in ~7–8 s on open (each block ~1–1.5 s); single-block edits are
unaffected (warm engine, no re-import).

## What was tried first and did NOT work (kept as a signpost)
- **Fresh engine (`?rev=N`) per block** — slow (~0.7 s each) AND ineffective: the failing blocks had an
  empty stdlib map, which a fresh MODULE import can't fix (the map is a `window` global). Reverted.
- **Clearing `window.__pl_script_state` per render** — also ineffective for the same reason. Reverted.
  (Both chased the mis-diagnosed "engine type state"; the real culprit was `loadScript` + the render race.)

## Acceptance / tests
`test/vscode-e2e/plantuml-multiblock.spec.ts` — 5 C4/AWS/Azure diagrams in one doc, asserts every block
renders a real diagram (distinct label, no error card). Passed 13/13 consecutive runs. Unit:
`load-script.test.ts` (concurrent dedup + error-resolves). All 11 PlantUML e2e specs + full unit (1311) +
typecheck + `lint:ci` green.

## Related
Task 136 (offline stdlib — surfaced this), 178 (the class↔non-class engine reset — its "type stickiness"
framing led to the initial mis-diagnosis here; still valid for genuine type switches), 139 (the ~1 s
per-block cost measured there is why the serial render is acceptable), 87 (engine). Files:
`media-src/src/load-script.ts`, `media-src/src/plantuml-render.ts`.
