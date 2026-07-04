# Task 352 — PlantUML C4 render cost (~2 s): rebuild + preprocess-cache — investigated, DECLINED (pickup-ready)

> **Status:** 🅿️ **PARKED / DECLINED** (2026-07-04). The ~2 s per offline C4 render was investigated to a
> conclusion. Root cause is confirmed and the only removing lever (a TeaVM rebuild with a preprocessor
> cache) is **feasible + fast to build** but **declined** because it forks the engine (ongoing maintenance
> debt) for a one-time cold-render win the cache (348) + debounce (349) already mostly hide. This task is the
> **pickup-ready recipe** if that decision ever changes — everything needed to resume without re-running the
> spike. See also the memory `plantuml-c4-2s-render-investigation`.

## The problem
A single offline C4 diagram (`!include <C4/C4_Container>` + a few `Person`/`Container`/`Rel`) takes **~2 s to
render**, EVERY render — so live-editing a C4 diagram lags ~2 s behind each settle. The reopen cache (348)
makes re-opens instant and the edit debounce (349) collapses the backlog, but the *first* render of a fresh
C4 (and any live edit that misses the cache) still pays the full ~2 s.

## Where the time goes (MEASURED — do not re-derive)
- **~90 % is the engine re-preprocessing the ~2000 inlined C4 stdlib lines every render.** Call path:
  `PlantUMLBrowser.buildSvg` → `PSystemBuilder2.createDiagram(lines)` → `new TimLoader(pathSystem,
  Defines.createEmpty(), …)` → `timLoader.load(rawSource)`.
- **NOT layout** (Viz/Graphviz = 0.6 %), **NOT asyncify parking** (CPU-bound, <1 % idle), **NOT diagram
  size** — the full cost is present even with **0 diagram elements** (`c4-titleonly` ≈ `c4-full`). The stdlib
  definitions are **byte-identical every render**.
- Bisecting the expanded stdlib (empty body → nothing is CALLED, so categories can be stripped and it still
  renders): removing all `!function`/`!procedure`/`!if` blocks drops **~90 %**; `skinparam` lines are
  disproportionately expensive (**~3 ms/line, 32 % for 41 lines**); trivial synthetic `!$var`/`!procedure`
  counts are cheap (800 vars ≈ 35 ms) → the cost is the *content/complexity* of the real C4 definitions, not
  their raw count.
- Separately shipped from this investigation: the engine's 2 debug `console.log` sites (~150 ms/render) —
  see task 351. That is orthogonal and already done.

### How to profile (reproducible — the OOPIF gotcha)
The VS Code webview is an out-of-process iframe (OOPIF) the top-page CPU profiler CANNOT see (this blocked
the first attempt). Boot the engine in a **plain headless chromium page** (Playwright) + CDP `Profiler`
instead. Expand the C4 source in Node with the real `expandStdlibIncludes` + the `c4.js` map (eval it with a
stub `window`), render `render(lines, targetId)`, observe the SVG. Compute self-time from `timeDeltas`
(variable sampling interval). **Caveat:** the harness `console.log` cost is CDP-serialisation-inflated ~3×
vs the real webview — trust real-VS-Code `coldMs` for production numbers, not the harness.

## Levers evaluated
1. **Reverse-engineer the minified engine for a state cache — INFEASIBLE.** No class-name anchors survive
   (`Preprocessor`/`Defines`/… all stripped in the obfuscated build), `render()` is one asyncify blob with
   no injectable seam, `window.__pl_script_state` is just the `<script>` loader (irrelevant), and the native
   `window.PLANTUML_STDLIB[lib][file]` lookup (`CE$`) returns RAW text → still re-preprocessed every render
   (no parsed cache).
2. **Off-thread render (task 182) — orthogonal, HIDES not removes.** Would stop the ~2 s from *blocking* the
   UI, not shorten it. PlantUML is a "borderline" off-thread target there (must emit a string instead of
   building DOM). Big spike; PlantUML is a secondary target (d2 first).
3. **TeaVM rebuild + preprocessor cache — FEASIBLE, this task's subject. DECLINED (fork).** Recipe below.

## Rebuild recipe (pickup-ready)
Verified 2026-07-04 to build a working engine in ~74 s:
1. **Source:** `git clone --depth 1 --branch v1.2026.6 https://github.com/plantuml/plantuml.git`
   (match `media-src/vendor/plantuml/source.json` `version`). Entry point:
   `src/main/java/net/sourceforge/plantuml/teavm/browser/PlantUMLBrowser.java` (exports `render` /
   `renderToString`; a worker thread gives the TeaVM coroutine context the async Viz `@Async` needs).
2. **JDK:** the environment has a JRE only (no `javac`) and no passwordless `sudo`. Download a local JDK
   (no install): `curl -fsSL "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse"`,
   extract, `export JAVA_HOME=<extracted>/jdk-21…`. (Config-time gradle needs a real compiler even with
   `-Pfast`.)
3. **Build:** `./gradlew teavm -Pfast -Dorg.gradle.java.installations.paths=$JAVA_HOME` (`-Pfast` = GPL jar
   only, skip licence subprojects/tests). Output: `build/generated/teavm/js/plantuml.js` (~6.8 MB) — plus
   `viz-global.js` and the full native stdlib set (`c4.min.js`, `awslib*.min.js`, `k8s.min.js`, … — which the
   upstream build DOES ship, populating `window.PLANTUML_STDLIB`; we don't currently vendor these).
   Toolchain config: `build.gradle.kts` `teavm { js { mainClass = …PlantUMLBrowser; obfuscated = true;
   optimization = BALANCED } }`.
4. **The seam to modify (`PSystemBuilder2.createDiagram`):**
   ```java
   final Defines defines = Defines.createEmpty();                 // fresh EVERY render
   final TimLoader timLoader = new TimLoader(pathSystem, defines, charset, definitions, rawSource.get(0));
   timLoader.load(rawSource);                                     // ← the ~90% cost
   ```
   Preprocessor state lives in `TimLoader.context` (`TContext` → `FunctionsSet` = the `!procedure`/`!function`
   registry) + `TimLoader.global` (`TMemoryGlobal` = `!$var`/`!global`). Both are plain `HashMap`s + a `Trie`
   each, with **no copy/clone method**.
5. **Cache design sketch:** split `rawSource` into `[stdlib-prefix, body]` (inject a boundary marker in our
   JS `expandStdlibIncludes` — we control where the inline ends); process the prefix once → snapshot
   `(FunctionsSet, TMemoryGlobal)` keyed by prefix-hash; per render, **deep-clone** the snapshot (or reset a
   reused one) + process ONLY the body against it; reassemble `resultList` = prefix output (skinparams) +
   body output.

## Why DECLINED (the fork cost)
- **Forks the engine.** Today we vendor the upstream prebuilt `plantuml.js` (download + sha bump on each
  PlantUML release, ~monthly). A modified engine means: re-apply the cache patch to new source (may conflict
  if upstream refactors `TimLoader`), re-run the TeaVM build (JDK+gradle in CI or by hand), re-vendor + re-sha
  + re-verify the task-351 `console.log` patch — **forever**.
- **Deep, risky surgery.** Correct deep-clone of `FunctionsSet`/`TMemoryGlobal`/2× `Trie` + source-split +
  output reassembly + a byte-identity proof vs fresh render; real cross-render-pollution risk if a body
  mutates a global.
- **Payoff already mostly hidden.** ~1.3–1.5 s off a *cold* C4 render (on top of 351's 150 ms), but 348 makes
  re-opens instant and 349 collapses the edit backlog. Not worth the permanent maintenance debt.
- **Free future exit:** if upstream ever exposes a preprocessor-persistence / reset API, we get this without
  a fork — revisit then.

## If resumed — acceptance
Byte-identical SVG vs a fresh render across the diagram-type matrix (137), no cross-render pollution (render
A then B then A → A identical both times), the ~90 % cold-render drop measured in real VS Code, and a re-vendor
plan that keeps the console.log patch (351) + the sha gate intact.

## Related
Tasks 351 (console.log strip — the shipped slice of this investigation), 350 (dual engine; note the
`PSystemBuilder2.lastFactory` singleton is the source-level root cause of the task-178 type-stickiness 350
fixes on the JS side), 348 (reopen cache), 349 (edit debounce), 182 (off-thread — the orthogonal hide-not-
remove lever), 87/136 (offline engine + stdlib). Memory: `plantuml-c4-2s-render-investigation`.
