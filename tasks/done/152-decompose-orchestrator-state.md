# Task 152 — Decompose the webview orchestrator + harden state ownership

> **Status:** 🟢 CLOSED 2026-07-28 — items 1, 3, 4, 5, 7 DONE; item 6 moved to task 405; **item 2's tail
> (a real `EditorSessionContext`) evaluated and DECLINED — see item 2's 2026-07-28 note.** All items in
> this task are now settled (done, moved, or declined-with-reasoning). Created 2026-06-24 from a
> multi-agent whole-system architecture review.
> Maintainability / merge-contention debt — NOT a correctness landmine. Lowest urgency of the four
> review tasks; partly already underway (host side + D2 under [task 123](123-d2-pipeline-refactor.md)).
> **Source:** architecture review (2026-06-24), webview-orchestrator + state-dataflow lanes, verified.
> **Value / Risk:** 🟡 cohesion + state ownership + fewer merge conflicts / medium — large mechanical
> refactor; the leaf logic is already well-factored, so this is moving, not rewriting.
>
> **🟢 Items 3, 4, 5 DONE 2026-06-27 (the contained, correctness-relevant ones; tests + real-VS-Code):**
> - **3 (re-theme authority):** one `rethemeDiagrams(flags)` in main.ts now owns the live re-theme;
>   `handleSetTheme` passes all-true, `handleConfigChanged` passes the changed-flag subset. Split D2
>   out of the old `reThemePlantumlGraphviz` → `reThemeMonochromeGroup({mono,d2})`, so D2 fires ONCE
>   for `content || d2Layout || d2Theme` — killing the double-fire when a content + d2 change coincided
>   (the drift evidence). Verified: 14 real-VS-Code theme-flip specs green (d2/wavedrom/nomnoml/
>   flowchart/vega/echarts+mindmap live flip/graphviz/smiles).
> - **4 (persistence allow-list):** `saveVditorOptions` now persists ONLY `{mode}` (the user-chosen
>   editor mode) — dropped the whole config-derived `preview` blob + top-level `theme` that shadowed
>   live config (the lineNumber-stuck / stale-code-style class). buildVditorOptions' authoritative
>   re-merge stays as belt-and-suspenders for old saved blobs. Test: `save-vditor-options.test.ts`.
> - **5 (typed D2 globals owner):** `d2-config.ts` (`getD2Config`/`setD2Config`, typed window) replaces
>   the raw `(window as any).__vmarkd*` channel at main.ts (init + both flip sites) + custom-diagrams.ts
>   (renderD2 + geojson basemap). Hoisted the byte-identical `loadScript` into `load-script.ts` (used by
>   elk-layout + d2-wasm). Test: `d2-config.test.ts`.
>
> **🟢 Items 1 + 2 DONE 2026-06-27 (the leaf decomposition; tests + 15 real-VS-Code specs):**
> `main.ts` 1417 → 779 LOC (−45%). Eight modules extracted, each a clean cohesive unit; `main.ts` is
> now thin wiring + the message-handler/initVditor controller layer:
> - **1 (cohesive modules):** `editor-caret.ts` (caret snapshot/restore), `prerender-overlay.ts`
>   (instant-paint overlay + streaming spinner + prepaint-scroll bridge), `diagram-retheme.ts` (the 6
>   re-theme fns + `rethemeDiagrams`, deps injected via `configureDiagramRetheme`), `edit-sync.ts`
>   (`createEditSync` factory — incremental-IR serialize / busy-cursor idle / save flush / doc-mode),
>   `finish-init.ts` (`runFinishInit` — the ~12 post-init observers), `init-payload.ts` (shared type).
> - **2 (lifecycle ownership):** `disposables.ts` `Disposables` registry — the 12 hand-written
>   `disposeX?.(); disposeX = observeX(...)` module-global pairs collapsed to `observers.set(key, …)`
>   (set disposes the previous); `inner-vditor.ts` `innerVditor()` typed accessor — the 11
>   `(window.vditor as any).vditor.<x>` reaches behind one documented surface. The remaining per-init
>   mutables (`lastInitMsg`/`editSync`/suppression flags/`lastDiffChanges`) stay in main.ts.
> - Tests: `disposables.test.ts` (4). Gates: typecheck + 942 unit + lint:ci + build green; real-VS-Code
>   d2/echarts/flowchart/nomnoml/vega/wavedrom-theme + callouts-mode + trailing + webview (15 specs).
>
> **📌 Reconciled 2026-07-27:** the deferred *webview* tail below (the `message-handlers` split +
> `initVditor` extraction) was subsequently DONE under [task 399](399-split-main-ts-god-module.md)
> — `main.ts` is now 159 lines, with `message-router.ts` + `vditor-init.ts` +
> `editor-session-state.ts` alongside it. The per-init **disposable session object** (item 2's tail)
> is still genuinely open. **Item 6 has MOVED to [task 405](405-host-editorsession-decomposition.md)**
> — plan host decomposition there, not here. **Item 7 (dead-code nits) DONE 2026-07-27** — see below.
>
> **🔴 DECLINED 2026-07-28 — the full `EditorSessionContext` (item 2's tail):** evaluated against the
> CURRENT tree (not the 2026-06-24/06-27 counts the task was written against) and declined as motion
> without improvement. See item 2's 2026-07-28 note for the measurements and reasoning, and the reopen
> condition at the end of it. Item 6 lives in task 405; item 7 is closed; the task is now fully settled.

## Findings → work items

### 1. 🟢 `main.ts` is a god-module (~12 responsibilities, 1344 LOC, 0 exports, 55 imports) — MOSTLY DONE (2026-06-27): 779 LOC; leaf subsystems extracted (see status block). `message-handlers` module deliberately not split out.
`initVditor` spans `526-966` (config gating, serialize pipeline `582-620`, pending-edit drift-audit
`664-708`, wiki autocomplete, upload, a ~100-line `after()` hook `815-916`); `runFinishInit`
(`406-524`) repeats `disposeX?.(); disposeX = observeX(...)` **11 times**; module mutables
(`111-145` + `lastEditorRange` `159`) total **19**, several rebound from inside `initVditor` closures;
**13** `(window.vditor as any).vditor` chains + 21 `as any` couple the file to undocumented Vditor
internals not covered by the patch-drift tests.
- **Fix:** decompose into cohesive modules (`prerender-overlay`, `editor-caret`, `diagram-retheme`,
  `edit-sync` factory, `finish-init`, `message-handlers`), leaving `main.ts` thin wiring; extract the
  serialize/pending-edit subsystem (`582-708`) into a `createEditSync` factory and the
  wiki-hint/upload closures into `vditor-options`.

### 2. 🟢 Per-instance lifecycle lives in ~19 module-global mutables + 13 deep Vditor reaches — DONE (2026-06-27): `Disposables` registry (12 dispose pairs) + `innerVditor()` accessor (11 reaches). Full-class encapsulation of the remaining mutables (`EditorSessionContext`) evaluated 2026-07-28 and DECLINED.
> **📌 Re-raised 2026-07-27 (Codex branch review, finding 7) — this is the live remainder of task 152.**
> Task 399 **moved** the shared state into `editor-session-state.ts`, but deliberately did not
> **encapsulate** it: `sessionState` is a directly mutable exported singleton, written by both
> `initVditor()` (`vditor-init.ts:95`) and `handleUpdate()` (`message-router.ts:44`), and
> `initVditor` additionally installs several `window.__vmarkd*` bridges (`vditor-init.ts:148-175`).
> 399 recorded the plain-object choice as deliberate (every call site already did direct field
> mutation), and that reasoning stands for *what 399 was* — a pure move. The point that remains open
> is the **temporal** one: the invariants between `applyingExtensionUpdate`, `streaming`, re-init and
> teardown are still implicit, so suppression/streaming/re-init transitions can only be reasoned
> about by reading every writer.
>
> Evidence it already costs something: `vditor-init.test.ts` needs extensive collaborator mocking and
> explicitly leaves construction untested at unit level (see [task 403](403-coverage-ratchet-red.md)'s
> notes on the `vi.mock` fan-out). Mock fan-out grows with every new dependency.
>
> **Proposed shape:** a per-webview `EditorSessionContext` with named transition methods and injected
> services; real Vditor construction stays e2e-only (correct — mocking it would test the mock), but
> the configuration and transition *decisions* become pure, unit-testable functions. Re-init becomes
> `new context` + `old.dispose()`, which is what item 2's original "per-init session object" meant.
> Kept here rather than filed as a new task: this IS item 2's tail, and this session already
> consolidated the competing decomposition plans (399 / 152 / 405) — a fifth plan would undo that.
>
> **🔴 DECLINED 2026-07-28 — evaluated against the current tree, not the 2026-06-24/06-27 counts this
> note was written against.** Measurements, not impressions:
> - **The "19 mutables" premise is stale.** `editor-session-state.ts` is 47 lines with **6 fields**
>   (`lastInitMsg`, `applyingExtensionUpdate`, `streaming`, `editSync`, `wikiKnownPages`,
>   `wikiDisplayNames`), each with a header comment already explaining why it's a plain object. The
>   other 13 counted in 2026-06-24 were the `Disposables`/`innerVditor()` reaches — already fixed by
>   this same item, by a *different* mechanism than a context class (see below).
> - **Every writer, enumerated (not estimated):** `grep`'d every assignment to the 6 fields across
>   `media-src/src/*.ts`. `streaming`: 2 sites, both in `vditor-init.ts`'s streaming branch
>   (`sessionState.streaming = true` immediately before `streamRenderIR`; `= false` inside `endStream()`,
>   which is invoked from BOTH `onDone` and the `.catch` — no path leaves it stuck true).
>   `applyingExtensionUpdate`: 4 sites across `vditor-init.ts` (wiki re-render) and `message-router.ts`
>   (`handleUpdate`'s external-change branch), each `= true` immediately followed by a `try { … } finally
>   { setTimeout(() => sessionState.applyingExtensionUpdate = false, 0) }` — unconditional clear, same
>   pattern in both files. `wikiKnownPages`/`wikiDisplayNames`: `.clear()`/`.add()` pairs in
>   `vditor-init.ts` (init) and `message-router.ts` (`wiki-update` handler), both idempotent Set ops with
>   no partial-state hazard. **The invariant the note worried about — "can only be reasoned about by
>   reading every writer" — turned out to be a ~10-line, 2-file read that already balances.** That's not
>   a state-machine gap; it's two independent boolean semaphores, each set-then-cleared in a
>   try/finally or dual-completion-path pair, already correct.
> - **The `Disposables`/`innerVditor()` half of this SAME item already delivered the re-init lifecycle
>   the class was meant to formalize — via a different, already-proven strategy.** `vditor-init.ts:50-54`
>   documents it explicitly: *"Stable singleton across re-inits (the `set()` calls re-key it)."* A
>   literal `new EditorSessionContext()` + `old.dispose()` on every re-init would **replace** that
>   working, tested strategy (re-key in place) with a different one (tear down + rebuild), which is a
>   behavioral change riding on a refactor ticket — exactly the "rewrite, not move" this task's own
>   status line warns against, and exactly the class of risk item 6 was split out to avoid.
> - **The `window.__vmarkd*` bridges are not one undifferentiated pile.** Item 5 already gave the D2
>   globals a typed owner (`d2-config.ts`); mermaid/echarts/flowchart globals are similarly owned by
>   `mermaid-theme.ts`/`echarts-apply.ts`/`flowchart-retheme.ts`. Folding them all into one
>   `EditorSessionContext` would **undo** that per-concern ownership — a cohesion regression, not a gain
>   — to recreate a single god-object this task's own earlier items moved away from.
> - **The cited pain (mock fan-out in `vditor-init.test.ts`) is a dependency-graph problem, not a
>   state-shape problem.** `initVditor` calls a dozen+ collaborator modules (`setD2Config`,
>   `applyMermaidTheme`, `applyEchartsTheme`, `createEditSync`, `buildVditorOptions`, …); wrapping
>   `sessionState` in a class doesn't reduce that call graph — the class would need the exact same
>   collaborators, so the exact same mocks. This is a real observation but it doesn't argue for the
>   proposed shape; nothing about class-vs-plain-object changes who `initVditor` has to call.
> - **Net:** the encapsulation would touch the highest-traffic files in the webview tree
>   (`vditor-init.ts`, `message-router.ts`, `main.ts` + their 3 test files), replace an already-working
>   re-init strategy with a materially different one, undo a completed decomposition (item 5, +
>   mermaid/echarts/flowchart's own ownership), and not address its own cited motivating pain — for a
>   state surface that's already 6 fields with a documented, empirically-verified-balanced invariant.
>   That is indirection without a reasoning payoff. Declined.
> - **One small, separable, genuinely-matching piece of the stated goal is still open and NOT bundled
>   into this decline:** `initVditor` (`vditor-init.ts:122-131`) inlines `cvActive`/`streamActive`/
>   `docChars` as a handful of expressions rather than a named pure function — a real instance of "the
>   configuration decision becomes a pure, unit-testable function" the proposed shape wanted, achievable
>   without any of the class machinery above. Offered as an optional, separate, small follow-up — not as
>   a consolation prize for declining the bigger ask.
> - **Reopen condition:** revisit if either (a) `sessionState`'s field count grows back toward the
>   original ~19 (i.e., new per-init mutables accumulate faster than they're given owner modules, the
>   way D2/mermaid/echarts/flowchart already were), or (b) a future feature needs genuinely concurrent
>   *multiple* Vditor instances per webview page (today it's 1:1 — confirmed by task 148's origin-probe
>   finding — so "per-webview context" and "per-init state" are the same lifetime; if that stops being
>   true, `new context`/`old.dispose()` stops being a strategy swap and starts being the only option).
- **Fix:** collect the 19 mutables + the 11 dispose/reassign pairs into one **per-init session
  object** with a `Disposables` registry (re-init = `new session`, `oldSession.dispose()`);
  centralize the 13 `(window.vditor as any).vditor` reaches behind a typed `innerVditor()` accessor.
  **DONE for the Disposables/innerVditor half (2026-06-27); the session-object half DECLINED (2026-07-28,
  see above).**

### 3. 🟠 Re-theme orchestration duplicated across `handleSetTheme` + `handleConfigChanged`
`handleSetTheme` (`main.ts:1016-1061`) runs the full set unconditionally; `handleConfigChanged`
(`1123-1230`) re-runs it behind per-option flags. `reThemePlantumlGraphviz` (`1101-1121`) already
bundles d2 (`:1117`), yet `handleConfigChanged` must call `reRenderD2` **separately** (`:1228-1229`)
because the grouped helper only fires on a content-theme change there — concrete evidence the two
sites have drifted. Every new offline renderer must touch both and keep gating consistent.
- **Fix:** one `rethemeDiagrams(theme, opts?)` authority in a `diagram-retheme` module; `handleSetTheme`
  passes all-true, `handleConfigChanged` passes the changed-flag set, D2/plantuml grouping in one place.
  (Pairs with [task 146](146-theming-coherence.md), the theming-coherence policy.)

### 4. 🟠 Persistence granularity too coarse — saved blob is a permanent competitor to live config
`saveVditorOptions` persists the **entire** `vditor.options.preview` object (`utils.ts:79-89`); init
spreads it ON TOP of `collectConfigOptions` every open (`extension.ts:887-890`); only
`preview.theme.current` + `hljs.style` + `hljs.lineNumber` are re-applied authoritatively AFTER
(`vditor-options.ts:46-66`). This already shipped two one-way-switch bugs (lineNumber stuck on, stale
code style) — the SSOT survives only by a **hand-maintained re-merge list** enforced by developer
memory, not architecture.
- **Fix:** persist only genuinely user-chosen, non-config-derived state (mode), OR strip
  config-derived keys before saving so they can never shadow live config; replace the whole-preview
  snapshot with an explicit **allow-list**, demoting the authoritative re-merge to belt-and-suspenders.
  (Memory: saved-Vditor-options-override-settings — this is the structural fix for that class.)

### 5. 🟡 D2 window globals have no typed owner *(overlaps [task 123](123-d2-pipeline-refactor.md))*
`window.__vmarkd*` is an untyped cross-module config channel; D2 globals (`__vmarkdD2Layout`,
`__vmarkdD2Theme`) are written raw inline with no owner module.
- **Fix:** a typed owner (`setD2Config`/`getD2Config`) mirroring `echarts-apply`/`mermaid-theme`; pass
  `{layout,theme}` explicitly into `reRenderD2`; declare all `__vmarkd*` keys on one `Window`
  augmentation; hoist the byte-identical `loadScript` into a shared helper.

### 6. ➡️ MOVED (2026-07-27) to [task 405](405-host-editorsession-decomposition.md) — Host `extension.ts` is a 1618-line god-file; echo-suppression is diffuse flag state
> Tracked separately as of 2026-07-27 (Codex architecture review): it kept getting lost as a LOW item
> inside a task that is otherwise about the **webview** orchestrator. Task 405 owns it now — do not
> plan host decomposition from this item. (Current size: `src/extension.ts` is 1379 lines; the
> `EditorSession` extraction the note below anticipated has since happened, so 405 starts from that
> state, not this one.) Retained here for the original finding text only.
Activation + command-registration + status-bar + outline + free helpers + `EditorSession` (`665-1333`)
+ `MarkdownEditorProvider` (`1335-1618`); the `660-664` comment acknowledges the decomposition is
staged. Echo-suppression = five private fields + a `normalizeContent` compare duplicated across
`syncToEditor`/`postUpdate`/the change listener.
- **Fix (opportunistic):** continue the documented extraction (host-utils, status-bar, outline,
  EditorSession, MarkdownEditorProvider into own files); encapsulate the sync state machine behind a
  single `isEcho(content)` predicate. Lowest urgency.

### 7. ✅ DONE (2026-07-27) — Scattered dead-code / placement nits (free cleanup)
`MarkdownEditorProvider.findActivePanel` (`extension.ts:1341`) zero callers; `html-builder.ts`
import-time `readFileSync` IIFE (`:148-157`) + mid-file `node:fs/crypto/path` imports; `echarts-theme.ts`
+ `echarts-gallery.ts` sit in the host tree with a comment falsely claiming bidirectional use but have
**zero host importers** (webview-only → dead JS in `out/`); `findScroller` is a generic util housed in
the feature module `toolbar-scroll-guard.ts`. Remove/relocate opportunistically.
- **Done:** re-verified each claim against current source before touching anything (line numbers had
  drifted since 2026-06-24). `findActivePanel` — confirmed genuinely zero callers repo-wide (only
  `findPanelForUri` next to it is used) — **deleted** (`src/extension.ts`). `html-builder.ts`'s 3
  mid-file imports (`node:fs`/`node:crypto`/`node:path`) — **moved** to the top with the existing
  import, no behaviour change (ESM imports are hoisted regardless of position; this was pure style).
  `echarts-theme.ts`'s "host and webview both import it" comment — **corrected**: re-verified today,
  zero `src/` (host) importers exist, only the webview reaches in via `../../src/echarts-theme`; NOT
  relocated out of `src/` because the isomorphic/dependency-free design is deliberate (documented in
  the module's own header) — a single current consumer doesn't make the shared-code placement wrong,
  so only the stale claim was fixed, not the file's location. `findScroller` — **left as-is**: it's a
  real 3-caller-plus-home-module utility, not dead code; relocating it out of `toolbar-scroll-guard.ts`
  is a pure organization call with no correctness payoff, judged not worth the diff for this pass.
  Verified: typecheck (host `tsconfig.json` + `media-src/tsconfig.typecheck.json`) clean, `lint:ci`
  clean (498 files), full unit suite 1791/1791 green. No test added — this removed/moved code with no
  behaviour change and no observable surface, per AGENTS' own scope (tests cover behaviour; there is
  none here to cover).

## Tests (per AGENTS)
- **unit** — `createEditSync` serialize/pending-edit in isolation; `rethemeDiagrams` fires the right
  subset per changed-flag set; the persistence allow-list never saves a config-derived key; session
  `dispose()` tears down all observers (no leak across re-init).

## See also
- `media-src/src/main.ts`, `utils.ts`, `extension.ts`, `media-src/src/{echarts-apply,mermaid-theme}.ts`.
- Tasks 123 (D2 pipeline god-module — items 5 + D2 decomposition overlap), 146 (theming policy — item 3),
  151 (the typed seams these modules expose). Memory: saved-Vditor-options-override-settings,
  callouts-observe-app-mount (the observer-lifecycle pattern item 2 generalizes).
