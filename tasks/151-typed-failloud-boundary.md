# Task 151 — Type-safe & fail-loud host↔webview boundary

> **Status:** 🟡 IN PROGRESS — items 1-5, 7 DONE; item 6 (strict flags) fully specified and measured
> (2026-07-28) but NOT yet implemented — see item 6's note below for the concrete stub + the ~31 real
> errors it would surface. Created 2026-06-24 from a multi-agent whole-system architecture review.
> The dominant *systemic* pattern across lanes (typed-by-declaration, not by-enforcement; failures
> silent across the seam).
> **Source:** architecture review (2026-06-24), types/errors/state lanes, adversarially verified.
> **Value / Risk:** 🟠 turns silent cross-seam breakage into compile/CI/Output-channel signals / low —
> typing + error-routing, behaviour-preserving for the happy path.
>
> **🟢 In progress 2026-06-27 — items 1, 2, 3, 4, 7 DONE (with tests, all gates green):**
> - **1 (typed protocol):** SSOT moved to `src/protocol.ts` (host imports `./protocol`, webview
>   `../../src/protocol` — same cross-tree pattern as `mermaid-palettes`). Completed `HostMessage`
>   (`config-changed.theme`, `wiki-update.displayNames`) + new `WebviewMessage` union + `VsCodeApi`.
>   Both dispatch maps are keyed by the discriminant (`Extract<>` per command), every handler dropped
>   `any`, both dispatchers log an unhandled command. `copy-html`/`copy-markdown` declared as the
>   host side of planned task 53 (kept, not deleted).
> - **2 (fail-loud write-back):** `syncToEditor` checks `applyEdit`'s boolean — on `false` it does NOT
>   advance `lastSyncedContent`, clears `pendingWebviewContent`, `debug()`s + `showError`s.
>   `onDidReceiveMessage` wrapped in try/catch → Output channel + showError. `document.save()` guarded.
> - **3 (observability pipe):** `media-src/src/webview-log.ts` (`logToHost`/`reportError`) posts
>   `{command:'log'|'error'}`; wired at the init-failure catch, the task-69 drift warn, the dispatch
>   else-branch, and the faithful-fallback helper (replacing `console.*`).
> - **4 (shared config type):** `VmarkdConfigOptions` in protocol.ts; `collectConfigOptions` annotated;
>   `lastInitMsg`/`initVditor` typed (`InitPayload`); `live-config.BodyOptions` derived via `Pick<>`.
> - **7 (faithful fallback):** `media-src/src/faithful-render.ts` (`faithfulRender`) renders into an
>   offscreen-attached stage and swaps into the wrapper ONLY on success; on failure keeps raw source +
>   stamps `data-<lang>-error` + logs. Applied to wavedrom + vega (were clear-before-render → blanked
>   on a throw). Tests: `faithful-render.test.ts` (3), `webview-log.test.ts` (4).
>
> **🟢 Item 5 DONE 2026-06-27:** elkjs ships NO `.d.ts`, so hand-wrote the minimal ELK JSON-graph
> interfaces (`ElkNode`/`ElkEdge`/`ElkPort`/`ElkLabel`/`ElkEdgeSection`/`ElkPoint`/`ElkInstance`) in
> `elk-layout.ts` and replaced every `any` in the graph build/walk; typed `d2-wasm.ts`'s window
> boundary (`Go`/`d2compile`) + the compile result (`D2CompileFn`/`D2CompileResult`). `d2-render.ts`
> was already `any`-free (cleared by the earlier typecheck pass). All three d2 files now carry zero
> `any` types; `any` survives only at the (narrowed-on-read) window global. Typecheck + build + 929
> unit + lint all green.
>
> **⏳ Remaining — item 6 only:**
> - **6 (strict flags) — UNBLOCKED 2026-07-28, fully specified, NOT yet implemented:** flipping
>   `strictNullChecks`+`noImplicitAny` on the media-src program yields ~1700 errors of which the vast
>   majority are in Vditor's own source (imported AS SOURCE, so it gets checked). Our files only have
>   ~31. **The design decision is now made and measured, not merely proposed:** `compilerOptions.paths`
>   redirecting the 12 `vditor/*` specifiers our code imports to a small (~35-line), grep-derived stub
>   `.d.ts` gets the vendored source out of the program entirely (0 leakage) without editing
>   `media-src/tsconfig.typecheck.json`'s CI wiring (it's already `npm run typecheck`'s own script). See
>   the 2026-07-28 note below for the full measurement, the exact 33/31 error breakdown, the `!`-
>   assertion trap to avoid, and why this is deliberately not implemented yet.
>
> **📌 2026-07-27 note — CORRECTED 2026-07-28, see below.** ~~The "stub the Vditor import" option
> is a dead end, not just deferred~~: enumerated every distinct `vditor/*` import specifier our
> webview code actually uses (`media-src/src/*.ts`) — 12 distinct paths, including `vditor/src/index`
> (the whole `Vditor` editor class) plus 8 narrower `vditor/src/ts/**` module imports. ~~A scoped
> sub-config that "stubs" `vditor/src/index` would mean hand-writing a `.d.ts` for the whole Vditor
> class API surface our code touches — a large, permanently-drifting duplicate — not viable, not
> merely expensive.~~ **This reasoning was wrong: it assumed the stub has to be a *faithful* mirror
> of Vditor's API. It doesn't — it only needs to list the handful of bindings our OWN code imports
> (grep-derived, not guessed), and it never claims to mirror Vditor's surface, so it can't drift
> against it.** See the 2026-07-28 note below for the tested, corrected version of this option and
> why it's now the recommended path, not a dead end.
>
> **📌 2026-07-28 — re-investigated with actual `tsc` runs (not reasoning alone); both the 2026-06-27
> "dead end" verdict above and a second hypothesis ("a bare one-line `any` stub") were tested and
> both were wrong, in opposite directions. Full measurement:**
>
> **Round 1 — does a bare ambient `declare module` stub work at all?** Tried the obvious one-liner:
> `declare module 'vditor/src/index' { const v: any; export default v }` for all 12 specifiers, with
> `strictNullChecks`+`noImplicitAny` flipped on `media-src/tsconfig.typecheck.json` in a scratch copy.
> Result: **it does nothing.** 1665 of 1711 errors were still inside `node_modules/vditor/src/**`. A
> control run (identical flags, no stub at all) produced a near-identical error set/count (1697 vs
> 1711) — proof the stub was never consulted, not that stubbing doesn't help. **Why:** TypeScript
> only falls back to an ambient `declare module` when a specifier can't otherwise resolve to a real
> file. Since vditor's `.ts` sources physically exist in `node_modules`, they win resolution every
> time, stub or no stub. This is the mechanism gap neither the 2026-06-27 note nor the "one line"
> hypothesis accounted for.
>
> **Round 2 — the mechanism that actually works: `compilerOptions.paths` redirection.** Redirecting
> each of the 12 specifiers via `paths` to a stub `.d.ts` file (not a bare ambient block) DOES work:
> **0 errors inside `node_modules/vditor`, confirmed by grep against the whole repo** — the only
> other `vditor/*` importers are `media-src/e2e/*` harness files, and those already sit outside
> `tsconfig.typecheck.json`'s `include: ["./src"]`, so there is no other leak path under this config
> regardless of strict flags. A first-pass stub using `export = <anyValue>` for every specifier got
> the count down to 46, but 16 of those were **artifacts of that specific stub shape**, not real
> code issues: 11× "has no exported member" (TS2305 — an `export =` shape can't satisfy a named
> import) + 5× "'Vditor' refers to a value, but is being used as a type" (TS2749 — 3 of our files do
> `import type Vditor from 'vditor'`, and a bare `any` value has no type position to offer).
>
> **Round 3 — the corrected, minimal stub.** Grepped the exact named surface our code imports (10
> bindings: `abcRender`, `flowchartRender`, `mermaidRender`, `plantumlRender`, `graphvizRender`,
> `expandMarker`, `processAfterRender`, `processCodeRender`, `looseJsonParse`, `addScript`, each typed
> `any`) plus a minimal `class Vditor { constructor(id: string | HTMLElement, options?: any); [key:
> string]: any }` for the 3 type-position uses (`custom-renderer.ts`, `outline.ts`, `vscode-api.ts`).
> Total stub: **~35 lines, one `.d.ts` file.** Re-ran: **33 errors, 0 vditor leakage, 0 TS2305/TS2749
> artifacts.**
>
> **Breakdown of the 33 (by file):** `astar.ts` (1, `cur.dj` possibly null), `d2-render.ts` (6, null/
> `number[]` mismatches + a `never`-typed `.toFixed` call), `d2-wasm.ts` (1, `string | undefined`
> argument), `diagram-engines/vega.test.ts` (1), `edit-sync.ts` (1, a callback returning `string |
> undefined` where `string` is expected), `elk-layout.ts` (5, possibly-`undefined` ELK label/position
> fields), `fix-table-ir.ts` (4, 3 implicit-`any` params + 1 untyped-function-with-type-args),
> `lang.ts` (3, implicit-`any` locale-key indexing), `vditor-init.ts` (6: 4× `msg.wiki` possibly
> `undefined`, plus 2 that are themselves **stub-shape artifacts** of the `class`+index-signature
> choice — `Vditor` not structurally assignable to `VditorThemeApi`, and `null` not assignable to
> `Vditor` — fixable by loosening the stub's `Vditor` type further, not evidence of a code defect).
> That leaves **~31 genuinely real errors**, matching the original "~25-30" estimate. 3 more
> (`elk-entry.ts` ×2, `mermaid-elk-entry.ts` ×1) are **pre-existing untyped-vendor-`.js` gaps**
> (`../vendor/elk/elk-api.js`, `../vendor/mermaid-layout-elk/*.mjs`) — unrelated to the vditor
> boundary, same fix pattern (a tiny `declare module` each), worth tracking as a separate, smaller
> follow-up rather than folding into this item.
>
> **CI cost — corrected.** `npm run typecheck` already runs `tsc -p media-src/tsconfig.typecheck.json`
> as its own script, independent of `lint:ci` (biome). Flipping the flags means **editing that one
> file in place — no new tsconfig, no new CI job.** But there is **no incremental path**: the moment
> the flags flip, the gate goes red until all ~31 are fixed; `strictNullChecks`/`noImplicitAny` are
> whole-program flags, not something you can scope to "only new code."
>
> **⚠️ Constraint for whoever implements this: the `!`-assertion trap.** Several of the 31 (`msg.wiki`
> possibly undefined, the ELK label/position fields, `d2-render.ts`'s null/`number[]` sites) can be
> silenced with a non-null assertion (`!`) that satisfies the compiler without establishing that the
> value is actually non-null at that point — that is a *fake* fix, strictly worse than the current
> unchecked state because it now *looks* verified. Each site needs a real judgement call (guard, early
> return, or a comment explaining why the assertion is actually safe), not a mechanical `!` pass.
>
> **Recommendation: reopen item 6, worth doing** — the stub is small, bounded, and self-declaring
> (lists only our own import surface, so it cannot drift against Vditor's own evolving API the way a
> faithful mirror would), there's no new CI surface, and the real errors are exactly the class of bug
> this task exists to catch (`msg.wiki` possibly-undefined is a live silent-boundary risk). **Not
> implemented this pass** — deliberately held so it doesn't land mid-way through tonight's
> integration/verification pass on the shared tree, and so the 31 fixes get a fresh, un-tired pass
> rather than a late-night one (see the `!`-assertion trap above). All scratch tsconfigs/stub files
> used for this measurement were deleted; nothing was committed.

## Findings → work items

### 1. 🟠 Typed message protocol is unenforced AND stale at both `postMessage` seams
`protocol.ts:3-20` declares an 8-variant `HostMessage` union, but every handler is `(msg:any)`
(`main.ts:973,1016,1123,1232,1238,1260,1266,1281`) and the map is `Record<string, …>` — `any` is
bivariant so narrowing is **never exercised**. The union has already **drifted from the wire**:
`config-changed.theme` (sent `extension.ts:825`, read `main.ts:1175`) and `wiki-update.displayNames`
(sent `extension.ts:871`, read `main.ts:1306-1308`) are absent from the type. There is **no
`WebviewMessage` type** for the outbound direction (`vscode:any` at `utils.ts:15,18`); host dispatch is
also `Record<string,(message:any)>` (`extension.ts:1175`).
- **Fix:** type the maps `{[K in HostMessage['command']]: (m: Extract<HostMessage,{command:K}>)=>void}`,
  drop `any` from every handler so TS narrows per command; **complete the union**
  (`config-changed.theme`, `wiki-update.displayNames`, `update.wiki.displayNames` + reply messages);
  add a mirrored `WebviewMessage` union and type `vscode` with it; add an `else` branch on BOTH
  dispatchers logging unhandled commands.

### 2. 🟠 Critical write-back discards `applyEdit`'s failure signal; dispatch has no error boundary
`extension.ts:744-751`: `await vscode.workspace.applyEdit(edit)` **ignores the returned boolean**
(applyEdit *resolves false*, doesn't throw, when the doc changed underneath); the `try` has a `finally`
but **no `catch`**; then `lastSyncedContent = document.getText()` is set unconditionally → a failed
write **advances state** while disk keeps old content and reconciliation never re-pushes
(data-loss-class). Dispatch `await messageHandlers[...]?.(message)` (`:1300`) has no catch; `document
.save()` (`:949`) is unguarded; `showError` exists but isn't applied at the boundary.
- **Fix:** check the `applyEdit` return; on false do NOT advance `lastSyncedContent`, `debug()`-log +
  `showError`. Wrap both dispatchers in try/catch routed to `debug()`/`showError`; guard `document.save()`.

### 3. 🟠 Webview→host log/error/info observability pipe is wired host-side but never invoked
Host registers `log→logger.appendLine` (`extension.ts:1183`), `info→showInformationMessage` (`:1178`),
`error→showError` (`:1179`), `copy-html/copy-markdown` (`:1193-1194`), but a repo-wide grep finds
**zero** webview emitters. The webview falls back to `console.warn/error/log`
(`main.ts:698,984,988`) incl. the init-failure catch — directly contradicting the documented
Output-channel observability rule (memory: debug-metrics-to-Output-channel).
- **Fix:** a webview log helper posting `{command:'log',text}` used at all catch sites; route
  user-facing failures through the existing `error` handler; remove/wire the dead `copy-*` handlers.

### 4. 🟠 No shared type for the config-options payload across the boundary (3 hand-maintained shapes)
Producer `collectConfigOptions` (`extension.ts:1483-1515`) returns an inferred anonymous literal, no
exported interface; `vditor-options.ts:26,63` reads `msg.options.*` as any; `live-config.ts:13-21`
`BodyOptions` is a **separate partial mirror** that already diverges (carries `outlineWidth`,
which `collectConfigOptions` doesn't return); `main.ts` keeps the live copy in `let lastInitMsg: any`.
A key rename compiles cleanly while silently breaking readers.
- **Fix:** one exported `VmarkdConfigOptions` interface; annotate `collectConfigOptions`' return; type
  `msg.options`/`lastInitMsg`; derive `BodyOptions` as `Pick<>` so a rename propagates as compile errors.

### 5. 🟠 Engine→IR producers (ELK + dagre) are pervasively `any`-typed at the most error-prone seam
The Layout IR is cleanly typed (`d2-render.ts:381-409`) but BOTH producers translate through untyped
graphs: `elk-layout.ts:23,25,60,103,230` + `d2-render.ts:498,554,575` + `d2-wasm.ts:11,80` — exactly
where x↔y coordinate mistakes are easiest to make. The recent typecheck pass cleared errors but left
the `any` sprawl.
- **Fix:** model the ELK/dagre graph/node/edge shapes (elkjs + @dagrejs ship usable types) and type
  `compileD2`'s result; keep `any` only at the window-global read, narrowing immediately.

### 6. 🟡 `media-src` compiles with `strict:false` — the enabling condition for items 1,4,5
`media-src/tsconfig.json:7` `strict:false` (vs host root `strict:true`). e.g. `utils.ts:68`
`fileToBase64` has an implicit-any param + dereferences `evt.target.result` with no null guard.
- **Fix (measured 2026-07-28, see the status-block note for the full run):** enable
  `strictNullChecks` + `noImplicitAny` on `media-src/tsconfig.typecheck.json`, paired with a
  `compilerOptions.paths` redirect of the 12 `vditor/*` specifiers our code imports to one small
  (~35-line) `.d.ts` stub listing only OUR OWN grep-derived named imports as `any` (NOT a faithful
  mirror of Vditor's class API — that was the earlier, wrong framing of this fix). ~~burn down with
  per-file `// @ts-nocheck` escape hatches~~ — superseded: the `paths` stub handles the Vditor
  boundary in one shot; the remaining ~31 errors in our own files (see breakdown above) need real
  per-site fixes (guard/early-return/narrowing), NOT `@ts-nocheck` or `!`-assertions (see the
  `!`-assertion trap in the status block) — `@ts-nocheck` would silently re-open exactly the
  "typed by declaration, not enforcement" hole this task exists to close.

### 7. 🟡 Faithful-by-construction enforced loudly only for D2 → generalize *(builds on [task 142](142-renderer-feature-parity-audit.md))*
D2 is the gold standard (classified `data-d2-error` + single `unsupportedReason` gate + raw-source
fallback). But `wavedrom`/`vega` clear the source **before** a throwing render → a render-time failure
**blanks the wrapper** (subtly-wrong, not loud-raw). Lift D2's pattern (render into a detached node,
swap only on success, stamp `data-<lang>-error` + post a log on catch) into a shared helper applied to
wavedrom/vega. Reconcile into the task-142 family with a regression test.

## Tests (per AGENTS)
- **unit** — handler maps reject an unknown command (logged, not thrown); `applyEdit`→false does NOT
  advance `lastSyncedContent`; a webview catch posts a `log`; `VmarkdConfigOptions` round-trips
  producer→consumer; the shared faithful-fallback helper keeps raw source on a throwing render.

## See also
- `media-src/src/protocol.ts`, `main.ts:1292-1316`, `extension.ts:1175-1195/744-751`, `utils.ts`,
  `media-src/src/{custom-diagrams,live-config,vditor-options}.ts`, `media-src/tsconfig.json`.
- Tasks 142 (renderer faithful-fallback family — item 7), 148 (the same boundary, security angle).
  Memory: debug-metrics-to-Output-channel, saved-Vditor-options-override-settings.
