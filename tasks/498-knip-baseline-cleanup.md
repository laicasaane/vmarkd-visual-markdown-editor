# Task 498 — knip cleanup: clear the 47-finding baseline down to documented false positives

**Status:** Done (2026-08-05) — `npm run knip` went from 56 findings (5 devDependencies + 41
unused exports + 5 unused exported types + 1 unused enum member + 4 config hints) to exactly the 5
documented devDependency false positives; 0 unused exports/types/enum members, 0 config hints (all
four turned out removable, not just one). All gates green (typecheck, unit, chromium e2e, real
VS Code fast tier, lint:ci); `npm run quality` exits 1 by design (only `knip`'s 5 accepted
false-positive findings fail it). · **Impact:** 🟢 no behaviour change — dead re-exports and
export-keyword removals only; zero runtime code paths touched · **Origin:** follow-up to
[task 469](done/469-housekeeping-sweep.md) item 5b (which filed the baseline) and
[task 471](done/471-dead-vendored-devdependencies.md) (which cleared the devDependency half).
Not a re-open of either.

## Goal

`npm run knip` currently exits 1 with **47 findings**. Task 469 wired knip into
`npm run quality` but left it red, explicitly deferring the export cleanup. The point of this
task is to get the residue down to **only findings that are documented, understood false
positives** — so knip can eventually be wired into CI as a real gate (469's stated end state)
and so any NEW finding is unambiguously the author's.

Target: **47 → ~9** (5 devDependencies + 4 `vscode-mock.ts` symbols, both left deliberately,
see below).

## What was already verified before filing (do not redo)

Two traps that would have made this cleanup wrong were checked first:

1. **Does knip count colocated `*.test.ts` as consumers?** YES — media-src's `project` glob is
   `src/**/*.ts`, tests are colocated, and knip resolves them. Grep hits that *looked* like test
   consumers for `outerFringeMask` (`plantuml-render.test.ts:288`),
   `outdentOrLiftListItemOnBackspace` (`list-backspace.test.ts:8`) and `BLOCK_WRAPPER_SEL`
   (`render-cache-client.test.ts:16`) are all **comments**, not imports. So "unused export"
   here really does mean unused.
2. **Consumers in trees knip structurally cannot see** (`ignoreWorkspaces: test/vscode-e2e`,
   `.worktrees/**`, plus `build.mjs` / `media-src/scripts/*.mjs`) — same trap class as task
   471's `esbuild stdin` finding. Checked by **name**-grep, not import-grep, because the
   vscode-e2e specs drive the webview through `evaluateInVSCode` string bodies. Hits found for
   `themeNomnomlSvg`, `renderD2`, `initLeafletMap`, `graphvizRender` in
   `test/vscode-e2e/*.spec.ts` — **all comments**. Zero real consumers.

**Keep this discipline for anything not already listed below:** a name-grep across
`test/vscode-e2e/`, `.worktrees/`, `build.mjs`, `media-src/build.mjs`, `media-src/scripts/*.mjs`
before removing any symbol, and read the hit rather than trusting the count.

### Third blind spot: script-loaded modules and window globals

A lot of this project's runtime code is **not reached through the TS import graph at all** — it's
loaded into the webview via `<script src>`: the ~18 vendored engine bundles under
`media-src/vendor/`, hljs, `vditor-icons.js`, i18n, plus the inline `scrollScript` template string
in `src/webview-host/html-builder.ts`. knip and dependency-cruiser only traverse
`project: ["src/**/*.ts", ...]`, so none of that is visible to either tool — same trap class as
task 471's devDependency false positives (bucket 4 below), just one layer further from the import
graph than "no import edge" (this is "no *file* in the graph at all").

Checked before this cleanup started, so it does not need redoing:

- All symbols removed/un-exported in buckets 1-2 (41 total), grepped across `media/` excluding our
  own build output (`media/dist/`) — i.e. the vendored bundles and static assets: **0 hits**.
- The same symbols grepped inside the inline `<script>` template strings in
  `src/webview-host/*.ts`: **0 hits**.
- Globals: no symbol on the removal list is *only* reachable through a `__vmarkd*` global.

  ⚠️ **Correction — the first version of this bullet was produced by a bad grep, do not copy it.**
  It searched `window\.__vmarkd[A-Za-z]*\s*=` and reported "the only three globals are
  `__vmarkdMorphPreview` / `__vmarkdRequestCaret` / `__vmarkdMermaidElkRegistered`". That pattern
  requires the literal receiver `window.`, so it missed every assignment written through a local
  alias or a cast — `w.__vmarkd…`, `win.__vmarkd…`, `g.__vmarkd…`, `store.__vmarkd…`,
  `;(window as any).__vmarkd…`, `;(win as unknown as Record<string, unknown>).__vmarkd…`. The
  correct search is on the property name alone, receiver-agnostic:

  ```bash
  grep -rn "__vmarkd[A-Za-z]*\s*=" media-src/src --include=*.ts | grep -v "=="
  ```

  which finds **~25** such globals, not 3 — across `clipboard/`, `editing/`, `links/`, `bridge/`,
  `diagram-kit/`, `diagrams/`, `boot/main.ts`.

  **The conclusion survives the correction, for a reason worth stating rather than assuming:** a
  symbol assigned to a global is by definition *used inside its own file*, which is exactly the
  case bucket 2 handles by dropping the `export` keyword and keeping the symbol — the global
  assignment is untouched either way. The live example is
  `outdentOrLiftListItemOnBackspace`: it IS on the removal list, it IS published as
  `w.__vmarkdListBackspaceOutdent` (`editing/list-backspace.ts:159`, the seam `fixList` calls
  through), the bad grep missed it, and it was still handled correctly — `export` dropped, global
  intact. The other two checks above (the `media/` and inline-script greps) were name-based and
  receiver-agnostic, so they were unaffected.

**Standing rule for any FUTURE knip pass:** before removing an export, in addition to the two
checks above, also (a) grep `media/` excluding `media/dist/`, (b) grep the inline script strings in
`src/webview-host/`, and (c) check whether the symbol is assigned to a `__vmarkd*` global **using
the receiver-agnostic pattern above, never `window\.__vmarkd`** — knip structurally cannot see any
of those three consumer shapes. And note the asymmetry: dropping `export` is safe for a
global-published symbol, but **deleting** it is not — so the un-export-vs-delete choice must be
made against the receiver-agnostic grep, not the narrow one.

## Bucket 1 — stale facade re-exports (27 findings) — the main prize

### 1a. `media-src/src/diagrams/custom-diagrams.ts` (25)

The file's own header comment says it is a **TRANSITIONAL FACADE** for
[task 409](done/409-split-custom-diagrams-into-engine-adapters.md) — it re-exports each migrated
engine so existing importers of `./custom-diagrams` keep working "without a churny cross-file
import-path update in the same commit as the move". **Task 409 is closed and every engine has
migrated**, and every real importer already resolves the engine directly. The re-export block is
now pure balast.

Real importers of `./custom-diagrams` today (`grep -rn "from '.*custom-diagrams'"` over
`src media-src/src media-src/e2e test`) — **these must keep working**:

| importer | imports |
|---|---|
| `media-src/src/diagrams/diagram-runtime.ts:3` | `observeCustomDiagrams` |
| `media-src/src/diagrams/diagram-retheme.ts:22` | `CUSTOM_DIAGRAM_ADAPTERS`, `reRenderD2`, `reRenderVega` |
| `media-src/src/diagrams/diagram-retheme.test.ts:11` | `CUSTOM_DIAGRAM_ADAPTERS` |
| `media-src/src/diagrams/custom-diagrams.test.ts:4` | `CUSTOM_DIAGRAM_ADAPTERS`, `customDiagramRenderers`, `presentCustomLangs` |

- [x] Delete the re-export-only entries: `findBlocks`, `getCdn`, `PANE_SEL`,
      `resetCustomBlocks` (from `../diagram-kit/diagram-dom`); `STL_MATERIAL_COLOR`,
      `renderStl`, `reRenderStl`; `renderWavedrom`, `reRenderWavedrom`; `themeNomnomlSvg`,
      `renderNomnoml`, `reRenderNomnoml`; `basemapFor`, `initLeafletMap`, `renderGeojson`,
      `renderTopojson`, `reRenderGeojson`, `reRenderTopojson`; `stripRemoteData`,
      `vegaRenderConfig`, `renderVega`, `renderVegaLite`; `enrichMarkdownLabels`, `renderD2`;
      and `export type { Basemap }`. Done.
- [x] **Keep** the `import` half wherever the file itself still uses the symbol in the shared
      dispatcher (`observeCustomDiagrams`, `CUSTOM_DIAGRAM_ADAPTERS`) — the file mixes
      `import X` + `export { X }` pairs; only the `export` side is dead. Removing the wrong half
      breaks the dispatcher, so change one export block at a time and typecheck. Done — changed
      one block per engine, ran `npm run typecheck` after each, exit 0 throughout.
- [x] **Keep** `reRenderD2` and `reRenderVega` exported — `diagram-retheme.ts` imports them
      through the facade. (Optionally re-point that importer at the engine files and drop them
      too, but that is a real import-path change, so decide explicitly rather than drifting
      into it.)
- [x] Update the header comment: the facade is no longer transitional, it is a shared
      dispatcher. Say what it exports now and why (the retheme entry points), so the next reader
      does not reconstruct this archaeology. Done.

### 1b. `media-src/src/diagrams/stream-render.ts` (2)

- [x] `STREAM_CHUNK_CHARS` and `chunkize` are re-exported from `../util/stream-chunk`; the two
      real consumers (`util/stream-chunk.ts` itself and `util/stream-chunk.test.ts`) use the
      original. Drop the re-export. Done.

## Bucket 2 — exports used only inside their own file (14 findings)

Import-grep confirmed: **none** of these has a cross-file `import { … }`. For each, decide
between (a) drop the `export` keyword, keeping it file-local, or (b) delete the symbol if it has
no in-file use either. Prefer (a) — quieter diff, and several are genuinely used locally.

- [x] `media-src/e2e/mouseops-helpers.ts` — `posted`, `editPosts`. **Deleted.** Zero cross-file
      consumers anywhere (`grep -rn "\bposted(\|editPosts(" media-src/e2e test/vscode-e2e`
      only turns up unrelated LOCAL `posted()` functions independently defined in
      `wiki-click.spec.ts`, `webview-behaviors.spec.ts`, `wiki-keyboard-focus.spec.ts` — none
      imports from `mouseops-helpers.ts`) and zero in-file use. Every real mouseops-helpers
      consumer (`dragdrop.spec.ts`, `mouse-selection.spec.ts`, `copy-cut*.spec.ts`,
      `paste-*.spec.ts`, `toolbar-selection.spec.ts`, `checkbox-click.spec.ts`) imports only
      `gotoMouseops`/`setDoc`/etc., never these two — the "reusable helper" intent never actually
      got reused, so deleted rather than kept with a knip ignore.
- [x] `media-src/src/boot/live-config.ts` — `applyContentTheme`. In-file use confirmed (called at
      line 71). Dropped `export`.
- [x] `media-src/src/diagram-kit/diagram-dom.ts` — `BLOCK_WRAPPER_SEL`. In-file use confirmed
      (used by `blockScopeOf`). Dropped `export`.
- [x] `media-src/src/diagram-kit/diagram-surfaces.ts` — `renderedDiagramPanes`. **Deleted** — zero
      callers anywhere (only self-referencing doc comments) and no test coverage in
      `diagram-surfaces.test.ts`. Also fixed the two stale doc comments (in this file and in
      `diagram-dom.ts`) that named it as still current.
- [x] `media-src/src/diagrams/d2/d2-render.ts` — `resolvePaint`. In-file use confirmed (3 call
      sites incl. line 339, 2020). Dropped `export`.
- [x] `media-src/src/diagrams/graphviz-render.ts` — `graphvizRender`. **Resolution (name
      collision, handled with care as flagged):** confirmed OUR `graphvizRender` (defined at
      `graphviz-render.ts:84`) is called nowhere in the TS import graph — NOT in-file, not by any
      other `media-src/src` file. Its only real consumer is `esbuild-shared.mjs`'s
      `patchGraphvizRender` (the `GRAPHVIZ_ANCHOR`-guarded rewrite of Vditor's own
      `graphvizRender.ts`): the patch bakes
      `import {graphvizRender as vmGraphvizRender} from "../../../../../src/diagrams/graphviz-render"`
      into the REWRITTEN VDITOR FILE as a string literal at build time — not a static import
      statement in any `.ts` source knip parses, so there is no import edge for knip to see (same
      "no import edge" trap as the `vditor-toolbar-stubs.ts` entry already in `knip.jsonc`).
      Separately, `plantuml-retheme.ts:8` imports Vditor's OWN (patched) `graphvizRender` from
      `vditor/src/ts/markdown/graphvizRender` — confirmed by reading the import line — which is
      the *same-named but different* export the collision warning was about; that import resolves
      to the patched shim, not to this file. **Left exported, NOT un-exported or deleted.**

      **Suppressed per-export, not per-file** (revised — the first attempt used a whole-file
      `ignore` entry, and a review flagged it as too coarse: `graphviz-render.ts` has THREE exports
      — `themeGraphvizSvg`, `applyGraphvizTheme`, `graphvizRender` — and only the last is a false
      positive, so a file-level ignore would blind knip to the other two permanently). The review
      excused the coarse lever with "no per-export ignore exists in knip 6.29" — **that claim is
      false**: `npx knip --help` on the pinned 6.29.0 lists `--tags  Include or exclude tagged
      exports`. Final shape:
      - `knip.jsonc` gained top-level `"tags": ["-knipignore"]`;
      - `graphvizRender`'s leading comment became a JSDoc block carrying `@knipignore` plus the
        reasoning above;
      - the whole-file `ignore` entry was removed, replaced by a comment saying why the file is
        deliberately NOT listed there.

      **Verified with a probe, because a clean run alone cannot distinguish "still analysed and
      clean" from "silently ignored".** Appended a throwaway `export const __knipProbe498 = 1` to
      the file → `npm run knip` reported `Unused exports (1) __knipProbe498
      media-src/src/diagrams/graphviz-render.ts:143:14`, proving the file is still fully analysed;
      probe removed, `npm run knip` back to the 5 devDependency findings only. (Also noted from the
      first attempt: `ignore` paths must be workspace-relative — `src/diagrams/graphviz-render.ts`,
      not `media-src/`-prefixed, which silently matches nothing.)
- [x] `media-src/src/diagrams/plantuml/plantuml-render.ts` — `outerFringeMask`. In-file use
      confirmed (2 call sites, lines 551/613). Dropped `export`.
- [x] `media-src/src/editing/list-backspace.ts` — `outdentOrLiftListItemOnBackspace`. In-file use
      confirmed (assigned to `window.__vmarkdListBackspaceOutdent`, the seam `fixList` actually
      calls through). Dropped `export`.
- [x] `media-src/src/links/caret-link.ts` — `LINK_LIKE_SELECTOR`. In-file use confirmed (used by
      the caret-link lookup). Dropped `export`.
- [x] `media-src/src/nav/heading-align.ts` — `clamp`. In-file use confirmed (2 call sites).
      Dropped `export`.
- [x] `src/shared/mermaid-palettes.ts` — `lower`. In-file use confirmed (4 call sites). Dropped
      `export`.
- [x] `src/webview-host/html-builder.ts` — `CONTENT_THEME_FILES` (used in-file at line 178).
      Dropped `export`.
- [x] `src/shared/protocol.ts` — `interface UploadFile`. In-file use confirmed (the `upload`
      command's `files` field). Dropped `export`.
- [x] `media-src/src/diagrams/d2/d2-wasm.ts` — `interface D2Style`, `interface D2Config`. Both
      confirmed in-file use (`iconStyle?: D2Style`, `config?: D2Config`). Dropped `export` on
      both.

## Bucket 3 — `test/backend/vscode-mock.ts` (4) — LEAVE, document

`DocumentSymbol`, `languages`, `SymbolKind`, `TreeItemCollapsibleState.Collapsed` are deliberate
mock API surface mirroring the real `vscode` namespace shape — the mock is more useful complete
than minimal, and `TreeItemCollapsibleState` *is* consumed (`src/markdown/outline-tree.ts`), just
not the `Collapsed` member.

- [x] Do **not** trim. Added `test/backend/vscode-mock.ts` to the root (`"."`) workspace's
      `ignore` list in `knip.jsonc` with a comment stating why, so these 4 stop appearing as
      actionable noise. (Whole-file `ignore`, not a narrower per-export mechanism — this knip
      version, 6.29.0, has no per-export suppression comment/tag; whole-file `ignore` is the same
      mechanism already used for `src/chrome/stubs/vditor-toolbar-stubs.ts`.)

## Bucket 4 — the 5 devDependencies — DO NOT TOUCH

`d3`, `three`, `vega`, `vega-embed`, `vega-lite`. Each is consumed only via a
`media-src/scripts/fetch-*.mjs` `esbuild.build({ stdin: { contents: … } })` call (`d3` also by
the vendored mermaid-layout-elk chunk at build time) — invisible to any import graph. Task 471
closes with: *"Do not remove any of these five in a future knip cleanup pass without re-reading
this file first."* This is that pass. They stay.

- [x] Leave `media-src/package.json` untouched. Added a pointer comment in `knip.jsonc` next to
      the existing "Deliberately NOT ignoring …" note so the reasoning is on the config, not
      only in a done/ task file.

## Bucket 5 — configuration hints (4) — all four turned out removable

Contrary to this task's own prediction ("only one is free" / "acting on the hint most likely
resurfaces it"), **all four hints were safe to remove**, verified by re-running `npm run knip`
after each individual removal (not just once at the end):

- [x] `src/app/extension.ts` "remove redundant entry pattern" — **safe**, `package.json`'s
      `main` now derives it. Removed from `knip.jsonc`'s `entry`. `npm run knip` re-run
      immediately after: hint gone, no new findings.
- [x] `test/vscode-e2e` (`ignoreWorkspaces`) — removed alone first. Re-ran `npm run knip`: no new
      findings (specifically, no spurious `unlisted dependency: vscode`). **Why the old comment's
      worry doesn't materialize:** `npx knip --debug` shows `[*] Included workspaces` lists only
      `['vmarkd', 'media-src']` and `Created 1 principal for 2 workspaces` — knip is NOT
      auto-discovering `test/vscode-e2e` as a third workspace at all, regardless of
      `ignoreWorkspaces`. Root `package.json` has no `"workspaces"` field (this repo doesn't use
      npm/yarn workspaces), and that's what knip's implicit-workspace discovery keys off — so
      there was never a third workspace for `ignoreWorkspaces` to suppress in the first place. The
      only trace of `test/vscode-e2e` in the debug output is its `tsconfig.json` showing up as a
      Playwright-plugin-discovered project reference under the `media-src` workspace's own scan
      (`entry:test/vscode-e2e/tsconfig.json`) — not a full dependency-graph scan of that tree, so
      no `vscode` import resolution is attempted against it. **Conclusion: this is not cosmetic
      luck, it's structural** — but see the caveat below.
- [x] `.worktrees/**` (`ignoreWorkspaces`) — removed on top of the above (so `ignoreWorkspaces`
      is gone entirely). Re-ran `npm run knip`: still clean, same reasoning (no `.worktrees/`
      checkout existed in this session to test the "scratch checkout" case directly, but the
      mechanism above — no root `"workspaces"` field, so no auto-discovery — applies equally).
- [x] `vscode` (top-level `ignoreDependencies`) — removed last, on its own. Re-ran `npm run knip`:
      still clean. Same root cause: with no implicit third workspace ever created, there's no
      code path where a bare `import ... from 'vscode'` could be resolved against it and flagged
      unlisted.
- Rewrote the stale header comment in `knip.jsonc` to record this finding (what it now says: the
  three hints are gone; root `package.json` has no `"workspaces"` field so knip's auto-discovery
  never reaches either directory; **re-check this if root `package.json` ever gains a
  `"workspaces"` field** — that's the condition under which the original worry would become real
  again).

## Verification

- [x] `npm run knip` — **before**: 5 unused devDependencies + 41 unused exports + 5 unused
      exported types + 1 unused exported enum member + 4 configuration hints = 56 individual
      findings printed (exit 1). (This task's header estimated 47; 56 is what was actually
      measured live at the start of this pass — recorded as measured, not reconciled against the
      older estimate.) **After:** only the 5 documented devDependency false positives
      (`d3`/`three`/`vega`/`vega-embed`/`vega-lite`) remain — 0 unused exports, 0 unused exported
      types, 0 unused enum members, 0 configuration hints (exit 1, since those 5 still print;
      that's the intended, documented end state, at the low end of the ~9/5 estimate since bucket
      3 got a full-file ignore instead of per-member suppression).
- [x] `npm run typecheck` — exit 0 (media-src's `tsc -p media-src/tsconfig.typecheck.json`); also
      ran the root workspace's `npx tsc -p tsconfig.json --noEmit` (not a package.json script,
      but the real gate for `src/shared/protocol.ts`'s `UploadFile` edit) — exit 0.
- [x] `npm test` (unit) — exit 0, **195 test files / 2748 tests passed**, 0 skipped. `uptime`
      checked first (load average 0.81, not under load) — the count is the normal full count, no
      task-476 silent-skip signature.
- [x] `xvfb-run -a npm --prefix media-src run test:e2e` — chromium harness, exit 0, 456 passed / 5
      skipped (pre-existing skips, unrelated to this task).
- [x] `xvfb-run -a npm run test:vscode:fast` — routine real-VS-Code tier, exit 0, **41/41 passed**
      in 6.5 min. No new webview behaviour was added by this task, so no new real-VS-Code spec was
      required; this run is the regression net for the diagram-engine facade edits.
- [x] `npm run lint:ci` — exit 0, 708 files checked, 0 warnings, no fixes applied.
- [x] `xvfb-run -a npm --prefix test/vscode-e2e test -- d2-lazy-load.spec.ts` — exit 0, 2/2 passed
      (45.3 s), after `node build.mjs` (exit 0). Run because the FAST tier does **not** include any
      dedicated D2 spec (`FAST_SPECS` in `test/vscode-e2e/playwright.config.ts` — the D2 specs
      `d2-lazy-load` / `d2-container-edge` / `d2-parallel-lane` / `d2-edit-perf` only run in the
      full suite), yet this diff touches three D2 files (`d2-render.ts`, `d2-wasm.ts`, and the D2
      re-exports deleted from the `custom-diagrams` facade). Those are all type-only /
      `export`-keyword changes that `typecheck` covers completely, so this was a belt-and-braces
      check of the lazy-load path, not a suspected risk. The other three D2 specs were NOT run —
      see Out of scope.
- [x] `npm run quality` at the end (per AGENTS.md), plus a `simplify` pass over the diff.
      **Per-stage result** (`scripts/quality.mjs` is not a `&&` chain — every stage runs
      regardless, then it prints a summary and exits non-zero iff any stage failed):
      ```
      PASS  lint:ci
      FAIL  knip
      PASS  jscpd
      PASS  depcruise
      PASS  test:coverage
      PASS  check:coverage-modules
      ```
      Overall exit code **1** — by design: `knip` FAILs because the 5 documented
      devDependency false positives (bucket 4) still print, which is the intended, accepted end
      state, not a regression (`scripts/quality.mjs` line 43: `process.exit(failed ? 1 : 0)`,
      confirmed by reading the script rather than inferring from the summary).
      - `lint:ci`: 0 warnings.
      - `knip`: exactly the 5 devDependency findings, as expected.
      - `jscpd`: 741 clones / 8.28% duplicated lines across 691 TS files — a pre-existing
        baseline (jscpd has no failure threshold configured in `.jscpd.json`, so it always
        "passes"); this diff didn't add or remove any duplication, it only deleted re-export
        lines and dropped `export` keywords.
      - `depcruise`: 0 violations, both host (52 modules/105 deps) and webview (170
        modules/354 deps) graphs.
      - `test:coverage`: 195 files / 2748 tests passed, matching the plain `npm test` run.
      - `check:coverage-modules`: "Coverage ratchet OK — 17 source module(s) at 0% (baseline
        19)" — 2 baseline-zero modules (`media-src/src/diagrams/diagram-zoom.ts`,
        `media-src/src/links/link-click-fix.ts`) now have coverage and the script recommends
        pruning them from `BASELINE_ZERO`; this is pre-existing drift unrelated to this task's
        diff (this task touched none of those two files) and is explicitly out of scope here —
        left untouched, noted for whoever picks it up next.
      **Simplify pass:** reviewed the diff directly against the four angles (reuse,
      simplification, efficiency, altitude) — checked every remaining `import` in
      `custom-diagrams.ts` is still consumed (yes), grepped the diff for any leftover reference to
      a symbol this task deleted (`renderedDiagramPanes`, `findBlocks`, `getCdn`,
      `resetCustomBlocks`, `STL_MATERIAL_COLOR`, `themeNomnomlSvg`, `basemapFor`,
      `initLeafletMap`, `stripRemoteData`, `vegaRenderConfig`, `enrichMarkdownLabels`) in any added
      line: zero hits. The diff is deletions, `export`-keyword drops, and self-consistent doc
      updates — no reuse, efficiency, or altitude issues to fix, and no dangling references to
      trim. `npm run typecheck` re-run after: exit 0. Nothing changed by this pass beyond what was
      already in place; states so plainly rather than inventing busywork.

## Out of scope

- Removing any of the 5 devDependencies (bucket 4) — settled by task 471.
- Re-pointing `diagram-retheme.ts` off the `custom-diagrams` facade onto the engine files. That
  is a defensible follow-up but it is an import-path refactor, not dead-code removal; if it is
  wanted, do it deliberately and say so, do not let it ride along.
- Wiring knip into CI. That is the *reason* for this task but a separate step — it needs a green
  baseline first, which is what this delivers.
- `type-coverage` / `media-src/tsconfig.json` `strict: false` (task 469 item 5e) — unrelated.
- Detecting when a **vendored bundle** under `media-src/vendor/` becomes unreferenced — knip
  cannot see script-loaded assets at all (see "Third blind spot" above) and does not report on
  this axis. `media-src/vendor/vendored-assets.mjs` already holds the asset list, so a future
  check could cross it against live TS consumers, but that's a known gap, explicitly not part of
  this task.
- **Consolidating `clamp`'s duplicated logic** (surfaced by the altitude review of bucket 2's
  `heading-align.ts` un-export): the same `Math.max(lo, Math.min(v, hi))` clamp arithmetic is
  written out longhand in `media-src/src/util/source-map.ts:20` and `:214`, and in
  `src/session/reveal-range.ts:25` — `clamp` was never actually a shared cross-file utility, it
  just sat exported-but-unused next to its own only caller. Consolidating the three sites onto one
  shared helper is a legitimate follow-up, but it's a cross-file, behaviour-preserving refactor,
  not a dead-export removal — out of scope here.
- **`check:coverage-modules` baseline-zero drift**, noticed in this task's `npm run quality` run
  but not caused by it (neither file is touched by this task): `media-src/src/diagrams/diagram-zoom.ts`
  and `media-src/src/links/link-click-fix.ts` now have real coverage and should be pruned from
  `BASELINE_ZERO` in `scripts/check-coverage-modules.mjs`, per the ratchet script's own message
  (`Coverage ratchet: 2 baseline module(s) now have coverage — prune from BASELINE_ZERO`). Left
  as-is — pruning the baseline list is a separate, deliberate edit, not part of a knip cleanup.
