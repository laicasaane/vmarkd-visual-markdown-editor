# Task 350 — PlantUML: dual warm engine instances (kill the re-import on class↔non-class switch)

> **Status:** ✅ FIXED (2026-07-04). Replaced the single-engine "re-import a fresh 7 MB module on every
> class↔non-class type switch" workaround (task 178) with TWO long-lived engine instances, one per diagram
> CATEGORY. A type switch now costs **zero re-import** (just picks the other warm instance), and cross-type
> contamination is structurally impossible. Builds on 178/347.

## Background — the sticky-type leak (task 178)
The vendored TeaVM PlantUML engine carries **mutable static diagram-TYPE detection state** across
`render()` calls on a single module instance. In normal PlantUML use (CLI/server) each diagram runs in a
fresh process so that static is zeroed; compiled to ONE long-lived JS module and called repeatedly, it
**persists** — once the engine renders a **class** diagram, a later VALID **non-class** source
(sequence/C4/activity…) is misclassified as a class diagram and never recovers. The leak is **cross-type
only**: two diagrams of the SAME category never poison each other.

Task 178's fix: reuse one cached engine and, on a class↔non-class switch, null it out and **re-import a
cache-busted module** (`?rev=N` → distinct URL → fresh statics). Correct, but the re-import re-evaluates
the ~7 MB module (~550 ms) every time the edited diagram's category flips.

## Fix — two instances, routed by category
`media-src/src/plantuml-render.ts`:
- Keep `engines = { class, nonClass }`, each a `PumlRenderFn | null`, **lazy-imported once** from a URL
  made distinct per category (`?engine=class` / `?engine=nonClass`) so the two are independent module
  instances with their own statics (`loadPlantumlEngine`).
- `renderPlantumlBlock` routes each diagram to `engines[isClassSource(text) ? 'class' : 'nonClass']`. Each
  instance therefore **only ever renders its own category** → it never crosses the boundary that poisons it
  → **no re-import during editing**, and a sequence rendered right after a class can't be contaminated.
- **Safety net for an `isClassSource` misread:** after render, if the engine actually drew the OTHER
  category (`renderedIsClass(e) !== wantClass`, detected from the C/I/E/A class icon), that instance is now
  primed wrong → discard it (`engines[kind] = null`, bump its cache-bust rev) so its next same-category use
  re-imports fresh. Normally the probe is right → never fires. (Replaces the old `engineLastClass` net.)

Removed: the single `plantumlRenderFn` / `engineLastClass` / scalar `engineRev` and the
re-import-on-switch block. The `renderQueue` serialisation (347) and the detached-target skips (349) are
untouched (both engines still share the one Viz.js global + the serialised completion-observe).

Cost: a document that mixes class AND non-class diagrams holds two ~7 MB instances (only the categories it
actually uses are imported — a doc with only non-class diagrams still loads one). Does **not** touch the
~2 s C4 include cost or macro persistence (both separate/out of scope).

## Tests
- **`test/vscode-e2e/plantuml-typeswitch.spec.ts`** (+ `fixtures/plantuml-typeswitch.md`) — real VS Code,
  headless. Interleaves class/sequence/class/sequence (render order) = 3 type switches. Asserts (1) each
  block renders as ITS OWN type — the sequence blocks (right after a class) have NO class icon and no error
  (contamination guard); (2) on a cold render the whole doc creates **exactly 2** engine instances
  (`window.__vmarkdPumlEngineLoads === 2`), not one-per-switch.
- **Teeth verified both ways:** disabling instance reuse (simulating the old re-import) → `engineLoads=4` →
  fails the `toBe(2)` assertion; forcing a single shared engine (reproducing the bug) → the sequence block
  renders with a class icon → fails the contamination guard.
- Regression: all 4 PlantUML e2e specs (typeswitch + cache + rapid-edit + multiblock) green; full unit
  (1317) + typecheck + `lint:ci` clean. `isClassSource` (the routing predicate) is unit-covered; the
  engine-touching `loadPlantumlEngine`/routing/safety-net are e2e-covered (same model as the rest of the
  render pipeline).

## Related
Task 178 (the class↔non-class engine reset this supersedes), 347 (render serialisation + the multiblock
race — the diagnosis history), 349 (edit-latency backlog fix), 87/136 (offline engine + stdlib). File:
`media-src/src/plantuml-render.ts`.
