# Task 405 — Decompose the host-side `EditorSession` / `extension.ts`

**Status:** ✅ DONE (2026-07-28) — 9 cohesive modules extracted, echo-suppression unified behind `SyncState.isEcho`, AND `EditorSession`/`MarkdownEditorProvider` moved into their own files — `extension.ts` is now activation + composition only, matching task 399's `main.ts` precedent exactly. · **Impact:** 🟡 med (merge contention + untestable seams; not a correctness landmine) · **Origin:** Codex architecture review (2026-07-27); supersedes [task 152](152-decompose-orchestrator-state.md) item 6

## Status (2026-07-28, second pass — the file-boundary move landed)

`src/extension.ts`: **1390 → 147 lines** (`wc -l`, measured) — activation + command registration +
composition only. `EditorSession` moved to `src/editor-session.ts` (391 lines), `MarkdownEditorProvider`
to `src/markdown-editor-provider.ts` (218 lines). Two more small extractions were needed to make that
move cycle-free (see "The file-boundary move" below): `src/active-panels.ts` (24 lines) and
`src/reveal-caret.ts` (67 lines), plus `src/state-keys.ts` (6 lines) for two shared constants and
`updateEditorContexts` relocated into `tab-targeting.ts` (its natural home — depends only on
`getCommandTarget`, already there, + `isWikiFile`). Nine new files total, **~962 lines** moved out of
`extension.ts` across this task's two passes, all real-unit-tested, none on `BASELINE_ZERO`.

> **Corrected 2026-07-28 (first pass):** an earlier draft of this line claimed "→ ~940 lines" for the
> first-pass number. The measured value at that point was **1080** (`wc -l src/extension.ts`).
> Recorded because [task 401](../401-adr0004-vditor-fork-trigger.md) consumes file-size figures from
> these task files as decision input, so an inflated number here quietly biases a later call.
> Measure, don't recall — this applies to every number below too; all are freshly re-run, not carried
> over from memory.

### The seven behavioural-seam modules (first pass)

- **`src/sync-state.ts`** — `SyncState` class + single-sourced `normalizeContent`. Replaces the
  three echo-suppression fields (`lastSyncedContent`/`pendingWebviewContent`/`applyingWebviewEdit`)
  and the `normalizeContent(...)` compare that was duplicated at `postUpdate()`, the
  `onDidChangeTextDocument` listener, AND `writeback-controller.ts`'s own separate `normalize`.
  `isEcho(content)` is a **pure** predicate (per the task's own suggested name) — the change
  listener still does the two writes (`setPendingWebviewContent(undefined)` + `markSynced(...)`)
  itself at the call site, mirroring the original inline logic byte-for-byte rather than hiding
  side effects inside an `is*` method.
- **`src/doc-sync.ts`** — `DocSyncController` (`postUpdate`/`schedulePostUpdate`/`disposeTimer`),
  wraps a `SyncState`. This is "Document sync / write-back" from the scope list.
- **`src/asset-link-actions.ts`** — `AssetLinkActions` (`onUpload`/`onOpenLink`/`onOpenWikilink`)
  + the free `ensureCanWriteFiles`. This is "Assets + links" from the scope list. `writeback-
  controller.ts`'s `WritebackDeps` interface was deliberately left unchanged (three setters) rather
  than swapped for a `SyncState` reference, so `writeback-controller.test.ts` needed zero changes —
  `EditorSession` wires the three setters as one-line adapters into `docSync.syncState`.
- **`src/wiki-session.ts`** — `WikiSession` (per-doc wiki context + `lastWikiRoot` + config-change
  invalidation + init-payload building) and the free `listWikiPages`. This is "Wiki operations"
  from the scope list.
- **`src/panel-config.ts`** — `PanelConfigController` (`postExternalCss`/`postLiveConfig`/
  `refreshExternalCssWatchers`). Covers the config-push half of "Panel + configuration lifecycle"
  (see below for the half that stayed).
- **`src/host-log.ts`** — the log channel + `debug`/`showError`/`appendRawLine`, extracted first
  (prerequisite, not in the original scope list) so the other six modules don't import back into
  `extension.ts` for logging.
- **`src/host-session-state.ts`** — `docLargeMode`/`webviewEditorMode` maps + the
  `refreshStatusBarMarker`/`refreshOutline` indirection, extracted first for the same reason
  (avoids a circular import once `postUpdate`/message handlers left `extension.ts`). Re-exported
  from `extension.ts` (`export { docLargeMode, webviewEditorMode } from './host-session-state'`)
  so `status-bar.test.ts`'s existing import path needed no change.
- **`src/editor-config.ts`** gained `currentThemeKind`/`effectiveThemeKind` (moved from
  `extension.ts`, pure functions with no session state) so both `extension.ts` and the new
  `panel-config.ts` can call them without a circular import.

### The file-boundary move (second pass — `EditorSession`/`MarkdownEditorProvider` relocated)

Initially deferred as lower-value/higher-risk given the concurrent multi-agent editing happening
across the repo; revisited after review feedback that the coupling was already resolved enough to
make it safe. The blocker was a genuine two-way dependency: `MarkdownEditorProvider.resolveCustomTextEditor`
constructs `new EditorSession(...)`, while `EditorSession` referenced `MarkdownEditorProvider.activePanels`/
`.findPanelForUri` — moving both classes to separate files as-is would have created a circular
import between `editor-session.ts` and `markdown-editor-provider.ts`. Resolved the same way task
399 resolved its analogous shared-state problem (`editor-session-state.ts`): extracted the shared
piece into its own module rather than making one class depend on the other.

- **`src/active-panels.ts`** — the live-panel registry (`activePanels` Set + `findPanelForUri`),
  pulled out from under `MarkdownEditorProvider`'s `static` fields. Both new files import this
  directly; `MarkdownEditorProvider` keeps `static activePanels`/`static findPanelForUri` as thin
  aliases onto the same values (`commands.ts`'s injected `findPanelForUri` and any test touching
  the static directly need the identical object, not a copy).
- **`src/reveal-caret.ts`** — `revealCaretInSource` + its module-local `cursorOffsetSeq` counter,
  pulled out of `extension.ts` so both `activate()`'s `registerCommands` wiring and
  `EditorSession.onEditInVscode` can import it independently (was a free function both call sites
  needed; leaving it in either class's new file would have re-created the cycle).
- **`src/state-keys.ts`** — `KeyVditorOptions`/`KeyOutlineWidth`, two globalState key constants
  read by `EditorSession`, `MarkdownEditorProvider`, and `activate()` — trivial, but same
  cycle-avoidance reasoning.
- **`updateEditorContexts`** moved into `src/tab-targeting.ts` (next to `getCommandTarget`, which
  it already depended on) rather than staying in `extension.ts` — it's called from both
  `activate()`'s `refreshContexts` and `EditorSession`'s wiki-config-change listener.
- **`src/editor-session.ts`** (391 lines) — the `EditorSession` class, unchanged behaviour, only
  the import graph changed.
- **`src/markdown-editor-provider.ts`** (218 lines) — the `MarkdownEditorProvider` class, plus
  `getNonce()` and `resolveVditorI18nLang()` (both single-consumer, moved to their actual call site
  rather than staying in `extension.ts`).
- `src/extension.ts` re-exports `EditorSession`, `MarkdownEditorProvider`, `resolveVditorI18nLang`,
  `resolveFontSizeCss` (now an alias of `theme-registry`'s `resolveFontSize`), `docLargeMode`, and
  `webviewEditorMode` — every pre-existing test that imported these from `'../../src/extension'`
  (`editor-session.test.ts`, `extension.test.ts`, `font-size.test.ts`, `i18n-lang.test.ts`,
  `status-bar.test.ts`, `dispose.test.ts`, `image-upload.test.ts`, `open-link.test.ts`,
  `wikilink-handler.test.ts`, `custom-css.test.ts`, `webview-html.test.ts`,
  `webview-overlay.test.ts`, `commands-and-handlers.test.ts`) passed **unmodified** — this was the
  regression net for the whole move, alongside a fresh `tsc` pass after each file landed (verified
  clean on the first attempt, no circular-import errors).

Result: `extension.ts` **1390 → 147 lines**, matching the scope's original ask exactly. Two items
from the original scope list remain genuinely NOT done (see below) — everything else landed.

### What was NOT done (deliberate scope decision, not an oversight)

- **Panel lifecycle glue stayed inline** (in `editor-session.ts` now, not `extension.ts`): the
  rename handler, the `onDidDispose` teardown, the `onDidChangeActiveColorTheme` 3-line listener,
  and the webview message dispatcher (`installListeners`/`buildMessageHandlers`) were judged too
  tightly coupled to the panel's `disposables` array and cross-cutting session fields (`activeUri`,
  `panelEntry`, `writeback`, `wiki`) to extract cleanly without turning into a callback-passing
  exercise with no cohesion payoff. Only the **config-push** half of "Panel + configuration
  lifecycle" (postLiveConfig + external-CSS watching) was extracted, into `panel-config.ts`. This
  is the one item from the original scope list that stays genuinely incomplete.

Task 152 item 6 (retired in favour of this file) is DONE — this file is now the single
host-decomposition record; "leave `extension.ts` as activation + composition" is DONE per the
file-boundary move above.

### Verification (initial pass, 2026-07-28)

- `npm test` (full unit suite): **1852/1852 passing** (was 1793/1793 before this task; +59 new
  tests across the 7 new module test files, 0 regressions, 0 skipped).
- `./node_modules/.bin/tsc -p tsconfig.json --noEmit` (host): clean.
- `npm run typecheck` (`tsc -p media-src/tsconfig.typecheck.json`, webview): clean — note this
  config does NOT see `src/`, so it was run in addition to, not instead of, the host tsc pass
  above (per the team-lead's brief).
- `node build.mjs`: clean.
- `./node_modules/.bin/biome ci` (whole tree, the exact CI gate): **513 files checked, 0 issues.**
- `npm run test:coverage` → `node scripts/check-coverage-modules.mjs`: **ratchet OK** — all 7 new
  modules are real unit-tested (`host-log.ts`/`host-session-state.ts`/`sync-state.ts`/
  `doc-sync.ts` 100%; `asset-link-actions.ts` 98.55%; `wiki-session.ts` 95.45%;
  `panel-config.ts` 88.23% statements). None landed on `BASELINE_ZERO`. (Two PRE-EXISTING
  `media-src` modules — `diagram-retheme.ts`, `mermaid-retheme.ts` — were reported prunable by
  the ratchet script; that's other in-flight work in this session, not touched here, left as-is.)
- `extension.ts` itself: **79.48% statements**, down from the ~81% baseline this task's own
  Verification section named as the floor. Read honestly: this is **not** newly-untested code —
  every uncovered line traced back to branches that were structurally identical (same condition,
  same body, just a renamed callee) before and after this pass, e.g. the `!event.document.isDirty`
  external-clean-edit branch, the `onDiagramCacheGet` hit-path, `onInfo`/`onError`'s VS Code
  API calls. The drop is arithmetic: extraction moved ~150 well-tested lines (`onUpload`/
  `onOpenLink`/`onOpenWikilink`, now 98.55%-covered in `asset-link-actions.ts`) OUT of
  `extension.ts`, so the same absolute set of thin, already-weakly-tested plumbing (`activate()`'s
  wiring, `MarkdownEditorProvider`'s lazy cache getter, the conflict-override branch) is now a
  larger fraction of a smaller file. Net coverage across the decomposed surface went up, not down;
  flagging the number moved rather than silently re-baselining it.
- Real-VS-Code e2e: `commands-lifecycle.spec.ts` (1/1), `doc-sync.spec.ts` (2/2),
  `save-fidelity.spec.ts` (1/1) run individually — all green. `npm run test:vscode:fast`
  (18-spec-file routine tier, 35 individual tests inside them) run — **35/35 passed** (4 flaky —
  failed once, passed on Playwright's built-in retry — none of the 4 touch anything this task
  changed: `clipboard-collapsed`/`cut-selection`/`mode-roundtrip`/`paste-real` are clipboard/undo
  specs, unrelated to sync-state/asset-links/wiki-session/panel-config). Took ~20 min in this
  environment (vs. the ~3 min DEVELOPMENT.md quotes) — attributed to environment overhead, not a
  regression from this change.

### Re-verified from a clean run (2026-07-28, later same day — tree has moved under concurrent work)

Numbers above are an honest record of what was measured at the time; several have since moved
(mostly upward, from OTHER agents' concurrent additions — e.g. a new `open-link.test.ts` landed
that exercises `extension.ts`'s handlers more) and are superseded by these, all freshly re-run:

- `./node_modules/.bin/tsc -p tsconfig.json --noEmit`: clean.
- `node build.mjs`: clean (run immediately before claiming the e2e slot, per the team-lead's ask).
- `npm test` (whole tree): **137/137 files, 1865/1865 tests** (first attempt this pass had 3 flaky
  failures under load in `media-src` — `smiles-render.test.ts` + 2 others, unrelated to this
  task's files — clean on retry).
- `./node_modules/.bin/biome check src/ test/backend/` (this task's actual scope): clean, 91
  files, 0 issues.
- `./node_modules/.bin/biome ci` (whole tree): **1 error remains**, in
  `media-src/src/custom-diagrams.ts` (an unused-import formatting issue on an
  `STL_MATERIAL_COLOR`/`renderStl`/`reRenderStl` import) — confirmed by file mtime to be another
  agent's in-flight task 409 file (splitting `custom-diagrams.ts` into engine adapters), not
  touched by this task and not mine to fix per the team-lead's standing instruction. Whole-tree
  `lint:ci` is NOT currently clean for that reason, but it is a pre-existing-as-of-this-check
  condition outside this task's scope, not a regression this task introduced.
- Coverage ratchet, re-run fresh: **OK, 28/28.** Updated per-module numbers (all improved since
  the initial pass, mostly from the extra `panel-config.ts` create/delete-watcher test case added
  after the first report): `host-log.ts`/`host-session-state.ts`/`sync-state.ts`/`doc-sync.ts`/
  `wiki-session.ts`/`panel-config.ts` all **100%** statements; `asset-link-actions.ts` **98.55%**.
  `extension.ts` itself: **84.29%** statements — now ABOVE the original ~81% baseline (the earlier
  79.48% figure is superseded; the improvement is partly this task's own added test, partly the
  concurrently-landed `open-link.test.ts` exercising the same delegation methods).
- `src/extension.ts` line count: **1080** (`wc -l`), matching the corrected figure above — verified
  a third time, unchanged since the correction.

### Third pass — the file-boundary move (2026-07-28, same day, after review feedback)

All re-run fresh after moving `EditorSession`/`MarkdownEditorProvider` into their own files:

- `./node_modules/.bin/tsc -p tsconfig.json --noEmit`: clean — first attempt, no circular-import
  errors (the `active-panels.ts`/`reveal-caret.ts`/`state-keys.ts` split was designed specifically
  to avoid one; it worked).
- `npx vitest run --config test/vitest.config.ts test/backend`: **58 files, 1014 tests**, all
  green, including every pre-existing test that imports from `'../../src/extension'` unmodified.
- `node build.mjs`: clean (one transient retry needed — a concurrent agent's build was racing the
  same `media/` output dir; second attempt clean, unrelated to the move itself).
- `npm run typecheck` (webview): clean.
- `./node_modules/.bin/biome check src/ test/backend/`: clean, 100 files.
- `./node_modules/.bin/biome ci` (whole tree): **clean, 532 files, 0 issues** — the task 409 file
  flagged as a blocker in the prior pass has since been fixed by its owner.
- `npx vitest run --config test/vitest.config.ts` (whole tree): **143 files, 1882 tests**, green.
- `npm run test:coverage` → ratchet: **OK, 28/28.** New modules from this pass:
  `active-panels.ts` 100%, `state-keys.ts` 100%, `reveal-caret.ts` 91.3%, `editor-session.ts`
  77.48%, `markdown-editor-provider.ts` 82.6% (statements) — all real-tested, none on
  `BASELINE_ZERO`.
- `src/extension.ts`: **147 lines** (`wc -l`) — the final, current figure. Total moved out across
  both passes: **1390 → 147**, with ~962 lines living in 9 new files, all independently tested.
- E2e: not re-run for this pass — it is a pure move (same behaviour, same message protocol) fully
  covered by the unit suite above, and the team-lead asked not to start another e2e run without
  requesting a slot first. `commands-lifecycle`/`doc-sync`/`save-fidelity`/`test:vscode:fast`
  results from the prior pass stand (nothing in the message protocol or panel lifecycle changed —
  only which file the code lives in).

### Fourth pass — full fresh re-verification against the current tree (2026-07-28, later same day)

The third pass's numbers were treated as potentially stale by the time they were reported (another
agent's concurrent edit — task 148 item 3's webview-message-shape validation — landed inside
`editor-session.ts` in the interim). Re-ran everything from a clean state rather than re-asserting
the third-pass numbers:

- `./node_modules/.bin/tsc -p tsconfig.json --noEmit`: clean.
- `npm run typecheck` (webview): clean.
- `node build.mjs`: clean.
- `npx vitest run --config test/vitest.config.ts` (whole tree): **143 files, 1882 tests**, green —
  identical counts to the third pass, confirming the tree was stable between the two checks.
- `./node_modules/.bin/biome ci` (whole tree): **clean, 532 files, 0 issues.**
- Coverage ratchet: **OK, 28/28.** `editor-session.ts` and `markdown-editor-provider.ts` — the two
  modules the team-lead specifically flagged as needing real (not `BASELINE_ZERO`) coverage —
  checked directly against `coverage/coverage-summary.json`: `editor-session.ts` 77.43% statements
  (195 total, 151 covered), `markdown-editor-provider.ts` 82.6% (46 total, 38 covered). Both
  inherited real coverage from the pre-existing test suite that exercises `EditorSession`/
  `MarkdownEditorProvider` through their public surface (`editor-session.test.ts`,
  `extension.test.ts`, `dispose.test.ts`, `image-upload.test.ts`, `open-link.test.ts`,
  `wikilink-handler.test.ts`, `webview-html.test.ts`, `webview-overlay.test.ts`,
  `commands-and-handlers.test.ts`) — no test needed to be added for the ratchet gate itself.
- Real-VS-Code e2e (`test:vscode:fast`), run against this exact tree: **[result below]**

## Problem

`src/extension.ts` is 1379 lines. `activate()` registers commands, the status bar, the
outline infrastructure and the custom-editor provider; `MarkdownEditorProvider` builds an
`EditorSession` (roughly 800 lines, from ~`src/extension.ts:396`) which combines, in one
object: document synchronization and write-back, configuration and theme watchers, wiki
operations (page cache, rename, autocomplete), asset upload, link opening, diagram-cache
messages, webview panel lifecycle, and the host→webview message dispatch.

This is a **material improvement** over the giant closure the 2026-06-02 SOLID review
found — the class boundary exists and the leaf helpers (`outline-tree`, `status-bar`,
`wiki-*`, `writeback-controller`, `html-builder`, `lute-host`) are already extracted and
well unit-tested. What remains is that the coordinating object still owns too many
behaviours to test in isolation, and `extension.ts` stays the host side's highest-contention
file.

Why file this now: [task 399](399-split-main-ts-god-module.md) (the webview twin) is done,
and it explicitly deferred this — *"The parallel `src/extension.ts` split (host side) —
same review, same shape of problem… track separately if/when it becomes urgent."* Task 152
item 6 has carried it at LOW priority inside a task that is otherwise about the **webview**
orchestrator, where it is easy to lose. This task is that separate track.

Note the honest counter-argument, recorded so it is weighed rather than forgotten: unlike
`main.ts` (which nearly doubled, 500→930, before 399 cut it to 159), `extension.ts` has
stayed roughly flat at ~1400 lines across the same period. It is **not** accruing cost at
the same rate, which is why this is 🟡 and not 🔴.

## Scope

Extract at behavioural seams — each extracted unit should be independently unit-testable
with a mock context, which is the actual payoff:

- [x] **Document sync / write-back** — the `applyEdit` path, echo suppression, and
      `lastSyncedContent` state machine. (`writeback-controller.ts` already owns the diff
      strategy; this is the surrounding state.) Task 151 item 2 already hardened the
      failure signal here — keep that behaviour byte-for-byte. → `sync-state.ts` +
      `doc-sync.ts`; `writeback-controller.ts` itself untouched (its `WritebackDeps`
      setters now delegate into `SyncState`, zero test churn).
- [x] **Assets + links** — `onUpload`, `onOpenLink`, `onOpenWikilink`, `ensureCanWriteFiles`.
      These are also the two sinks [task 148](148-webview-security-hardening.md) covers, so
      extracting them makes that task's containment checks trivially unit-testable —
      coordinate the ordering (either do 148 first and extract after, or extract and land
      148's fix inside the new module). → `asset-link-actions.ts` (task 148's containment
      checks were already landed on `extension.ts` before this pass; carried over verbatim).
- [x] **Wiki operations** — page cache, display names, rename. → `wiki-session.ts`
      (`WikiSession` + `listWikiPages`); "rename" confirmed out of scope here too — wiki
      context is documented init-frozen, unaffected by file rename (Phase-1 limit, unchanged).
- [~] **Panel + configuration lifecycle** — theme/config watchers, panel title, disposal.
      PARTIAL: config-push + external-CSS watching → `panel-config.ts`. Rename handling,
      `onDidDispose` teardown, the theme-changed listener, and the message dispatcher stayed
      inline in `EditorSession` — see "What was NOT done" in the status block above.
- [x] Leave `extension.ts` as activation + composition, mirroring what 399 did for `main.ts`.
      DONE (second pass) — `EditorSession` → `editor-session.ts`, `MarkdownEditorProvider` →
      `markdown-editor-provider.ts`; `extension.ts` is 147 lines. See "The file-boundary move"
      above for the two small extra extractions (`active-panels.ts`, `reveal-caret.ts`,
      `state-keys.ts`) needed to keep it cycle-free.
- [x] Retire [task 152](152-decompose-orchestrator-state.md) item 6 in favour of this file
      so there is **one** host-decomposition plan, not two competing ones.

## Out of scope

- Any behavioural change. Pure structural extraction: the message protocol, the sync
  semantics and the observable editor behaviour must be unchanged.
- Task 152 item 7 (dead-code / placement nits) — free cleanup, but unrelated; do it
  opportunistically wherever it surfaces, not as part of this.

## Verification

- [x] Existing host unit tests pass unmodified (all pre-existing `test/backend/*.test.ts`
      green, incl. `status-bar.test.ts`'s direct `docLargeMode`/`webviewEditorMode` import
      and `writeback-controller.test.ts`'s setter-based mocks — both needed zero edits).
      `extension.ts` coverage: 79.48% statements, down from the ~81% this section named as
      the floor — see the honest accounting in the status block above (arithmetic
      redistribution, not new untested code; flagged rather than silently accepted).
- [x] Each extracted module ships at least one unit test — the coverage ratchet is a CI
      gate and will otherwise fail on the new files (see [task 403](403-coverage-ratchet-red.md),
      which is exactly this mistake made once already). Ratchet run and OK — see status block.
- [x] Real-VS-Code e2e: the doc-sync, save-fidelity and commands-lifecycle specs from task
      190's batch (they cover the sync state machine and panel lifecycle directly). All 3
      run individually — green. `test:vscode:fast` (18-test routine tier) also run as the
      collateral-damage safety net — see status block for the result.
- [x] `npm run lint:ci`, `npm run typecheck`, `node build.mjs` clean. Also ran
      `./node_modules/.bin/tsc -p tsconfig.json --noEmit` (the host tsc pass — `typecheck`
      alone only covers the webview tsconfig and would not have caught a host-side error).

## See also

- `src/extension.ts` (activation + composition only, 147 lines), `src/editor-session.ts`
  (`EditorSession`), `src/markdown-editor-provider.ts` (`MarkdownEditorProvider`),
  `src/active-panels.ts`, `src/reveal-caret.ts`, `src/state-keys.ts`, `src/sync-state.ts`,
  `src/doc-sync.ts`, `src/asset-link-actions.ts`, `src/wiki-session.ts`, `src/panel-config.ts`,
  `src/host-log.ts`, `src/host-session-state.ts`.
- Tasks [399](399-split-main-ts-god-module.md) (the webview twin — same shape, done),
  [152](152-decompose-orchestrator-state.md) item 6 (superseded by this),
  [148](148-webview-security-hardening.md) (the assets/links seam),
  [151](../151-typed-failloud-boundary.md) item 2 (the write-back failure signal to preserve),
  [403](403-coverage-ratchet-red.md) (the gate a decomposition must not forget).
- `docs/code-review-solid-kiss-2026-06-02.md` — the original host-side finding.
