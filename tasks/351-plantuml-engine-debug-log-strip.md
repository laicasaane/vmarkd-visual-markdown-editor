# Task 351 — PlantUML: strip the engine's per-line debug console.log (patch the vendored TeaVM build)

> **Status:** ✅ FIXED (2026-07-04). The vendored TeaVM PlantUML engine ships two `System.out.println`
> debug traces (compiled to `console.log`) that fire **~2400× per C4 render**. Neutralised at build time
> (`console.log(EXPR)` → `void(EXPR)`), measured **~150 ms/C4 render** saved in the real VS Code webview.
> Part of the "why is offline C4 ~2 s" investigation — a real but PARTIAL slice; see "What's left" below.

## How it was found (measured, not assumed)
The earlier attempt to profile the render failed because the VS Code webview is an out-of-process iframe
(OOPIF) the top-page CPU profiler can't see. This time the engine was booted in a **plain headless
chromium page** (Playwright) — no OOPIF — and profiled via CDP `Profiler`:
- **96 % of render time is in `plantuml.js`, 0.6 % in Viz/Graphviz** → the cost is the engine, NOT layout.
- **One function, `CGR`, is ~41 % of self-time.** Its whole body is `Dj7(b); console.log(Cl(<result>))`.
- It runs **~2388× per render** (≈ once per processed stdlib line) — matching a console-event count of 2388.
- The engine has exactly **2** `console.log(` sites (`CGR` + `DYx`); both are TeaVM-compiled
  `System.out.println` debug tracing.

## The fix
`build.mjs` → `patchPlantumlEngine()` rewrites both `console.log(EXPR)` → `void(EXPR)` in the MEDIA copy
after the sha-gated vendored sync (vendor bytes stay pristine). The argument is still **evaluated** — the
surrounding `Dj7` preprocessor work is load-bearing (verified: no-oping the whole `CGR` drops a container
from the output), only the print is inert. Asserts exactly 2 sites so an engine bump that changes the
tracing **fails the build loudly** (the "build-time patch-coverage assert" pattern) instead of silently
shipping the slow/unpatched engine.

## Measured impact (real VS Code webview, headless)
`plantuml-cache.spec` cold render of the 5-diagram C4/AWS/Azure fixture:
- Before: `coldMs` ≈ **8480–8580 ms**
- After:  `coldMs` ≈ **7705–7945 ms**  → ~**750 ms across 5 renders ≈ 150 ms/render**.

The harness (chromium + CDP) showed a much larger ~500 ms/render, but that was **CDP-console-serialisation
inflation** — the honest production number is the ~150 ms from the OOPIF webview (CDP can't capture its
console, same reason it couldn't profile it).

## What's LEFT (this does NOT solve the ~2 s) — investigated to conclusion, DECLINED
The remaining ~1.3–1.5 s of a C4 render is the engine **genuinely preprocessing the ~2000 inlined stdlib
lines** — confirmed load-bearing and, from the profile, **fully present even at 0 diagram elements**
(`c4-titleonly` ≈ `c4-full`). Bisecting the expanded stdlib (empty body, so nothing is CALLED) showed the
cost is the sheer volume of definition processing: removing all `!function`/`!procedure`/`!if` blocks drops
~90 %, and `skinparam` lines are disproportionately expensive (~3 ms/line, 32 % for 41 lines). The
definitions are byte-identical every render → the textbook lever is **preprocess-once + reuse**.

The user chose the deepest option: **reverse-engineer the engine's macro table, else rebuild from TeaVM.**
Both were carried to a conclusion (2026-07-04):
- **Reverse-engineering the minified engine = infeasible.** No class-name anchors survive (`Preprocessor`,
  `Defines`, etc. all stripped), `render()` is one asyncify blob with no injectable seam, `__pl_script_state`
  is just the `<script>` loader (irrelevant), and the native `window.PLANTUML_STDLIB[lib][file]` lookup
  (`CE$`) returns RAW text → the engine still re-preprocesses it every render (no parsed cache).
- **TeaVM rebuild = feasible + fast, but DECLINED.** Cloned `plantuml/plantuml@v1.2026.6`, downloaded a
  local Temurin JDK 21 (no sudo), `./gradlew teavm -Pfast` builds a working engine in **~74 s**. Found the
  exact seam: `PSystemBuilder2.createDiagram` → `new TimLoader(pathSystem, Defines.createEmpty(), …)` →
  `timLoader.load(rawSource)` (the ~90 % cost). A cache-hook would process the stdlib prefix once and reuse
  the `TContext`(`FunctionsSet`)+`TMemoryGlobal` state. **Not done** because it (a) requires deep TIM surgery
  (those hold plain HashMaps + two `Trie`s with no copy method → correct deep-clone + source-split + output
  reassembly + byte-identity proof, real cross-render-pollution risk), and (b) would **FORK the engine** —
  we'd re-apply the patch + rebuild on every PlantUML bump instead of vendoring the upstream prebuilt.
  Decision: not worth the maintenance debt; the reopen cache (348) + edit debounce (349) + this 150 ms (351)
  already hide most of the cost. (Bonus from the source dig: the task-178 type-stickiness is `PSystemBuilder2`'s
  `lastFactory` singleton field — reset only when `lineCount < 10` — which confirms task 350's dual-instance fix.)

## Tests
- Correctness: all 4 PlantUML e2e specs (cache + typeswitch + multiblock + rapid-edit) green after the full
  rebuild — the `void(EXPR)` patch is render-neutral (byte-identical SVG; cache spec's cold==warm identity
  still holds). Guard: the `patchPlantumlEngine()` site-count assert.

## Related
Tasks 87/136 (offline engine + stdlib), 347 (render serialisation), 348 (reopen cache), 349 (edit
debounce), 350 (dual engine). Files: `build.mjs` (`patchPlantumlEngine`).
