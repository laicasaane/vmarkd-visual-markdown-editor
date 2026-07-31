# Task 460 — Physical module decomposition (host + webview) and import cleanup

**Status:** ✅ DONE 2026-07-31 (phases 0–4; the full real-VS-Code suite is the one deliberately
outstanding item — see Verification) · **Impact:** 🟢 zero behaviour change by construction (pure
relocation + import rewrite), 🔴 high blast radius (≈250 files touched) · **Origin:** architecture
review 2026-07-30, cross-checked by an independent Fable review; measured with `tmp/modmap.mjs`.

> ### ⚠️ CORRECTION — the "0 cycles" claim below was measured wrong, then re-established for real (RESOLVED 2026-07-31)
>
> The `Result` paragraph and commits `cdb475d`/`e3e68b7` state **0 bidirectional pairs**. That was
> measured with an extraction that matched only `from '…'` — **one of the six specifier forms this
> very task's phase 0 enumerated.** Widening it to all six (`vi.mock`, dynamic `import()`,
> `require()`, bare side-effect `import '…'`, re-exports) found **four real edges the claim missed**:
> `chrome`, `clipboard`, `links` and `util` each do `import '../bridge/vscode-api'` — a bare
> side-effect import, no `from` keyword, invisible to the old regex. Since `bridge->{chrome,
> clipboard, links, util}` were already allowed, those close **four `bridge<->X` cycles**, which
> transitively puts 12 of 13 webview modules on a cycle.
>
> The lesson is the task's own and it landed twice in one day: *the net you measure with decides what
> you are allowed to claim.* Phase 0 wrote down all six forms because the codemod had to be patched
> for two of them; phase 4 then built the meta-test on one.
>
> **Decision (measured, then taken):** move `media-src/src/bridge/vscode-api.ts` → `util/`. It has
> exactly two imports and both are type-only, so it is a zero-value-import leaf — a `util/` resident
> under this task's own encoded decision #2, the same rule that placed `webview-log`/`source-map`/
> `stream-chunk`. It lives in `bridge/` for topical reasons; topic is not a layering argument.
> Expected to dissolve all four cycles with no allowlist exception.
>
> **Outcome:** the move landed and the prediction held exactly. Measured with identical logic over a
> `git archive` of the pre-move tree and the post-move tree (`tmp/measure-cycles.mjs`, throwaway):
>
> | webview inter-module graph | before | after |
> |---|---|---|
> | edges | 48 | 44 |
> | modules on a cycle | 12 of 13 | **0** |
>
> The edge-set difference is exactly `chrome->bridge`, `clipboard->bridge`, `links->bridge`,
> `util->bridge` removed and **nothing added** — so the four bare side-effect imports were the whole
> of it, and no allowlist entry was needed. All 7 meta-tests are green. Host was and remains 0.
>
> One thing the correction above got wrong in the other direction: it is 12 of **13** distinct
> webview modules, and the manifest holds 16 *entries* because three module names are split across
> two entries each (`diagrams`, `diagrams/d2`, `chrome`). Count modules, not manifest rows.
>
> `depcruise:webview` still reports `caret.ts → gap-paragraph.ts → caret.ts`. That is the
> **pre-existing task 472 baseline, not a regression** — both files are inside `editing`, so it is an
> intra-module cycle and invisible to the inter-module graph above, by the "intra-module edges are
> unconstrained" rule. It must keep being reported: it is the live proof that the two new
> `.dependency-cruiser.cjs` rules did not weaken `no-circular`.
>
> **Also structurally invisible, left alone on purpose:** the 93 `vi.mock` specifiers can never reach
> this test — `walkTs` excludes `*.test.ts`, and a `foo.test` basename matches no manifest entry
> anyway. Pulling test files into the module graph is its own design decision.

**Result:** 22 modules (9 host + 13 webview), **zero inter-module cycles on both trees** — measured
over all six specifier forms, not just `from '…'` (see the correction block above; the 8-host/21-total
figure this paragraph used to carry was the 2026-07-30 planning baseline, the manifest is the truth) —
and every webview→host edge resolving to `src/shared/` with **zero exceptions**. Locked down by
`test/backend/module-boundaries.test.ts` (7 tests, proven red before green) against the checked-in
`scripts/module-manifest.mjs`, plus two zero-exception path-shape rules in `.dependency-cruiser.cjs`.
Branch `refactor/460-module-decomposition`, commits `2e7b393` (tooling) → `e3e68b7` (phase 4) →
`6946463` (the `package.json` `main` bug) → `724d0fa` (depcruise rules) → the `vscode-api` move.

## Why this exists

Both source trees are **flat**: host `src/` is 44 files / 7,854 lines with zero subdirectories,
webview `media-src/src/` is 132 non-test files / 23,774 lines with one (`diagram-engines/`). The
grouping that already exists in people's heads is invisible on disk, and the shared host↔webview
kernel has no name — the webview reaches **into the host folder** (`../../src/protocol`) for 7
modules.

This task does the physical move, rewrites every import, and locks the resulting layering down with
a meta-test so it cannot rot back.

## Ground truth (measured — do not re-derive)

Produced by `tmp/modmap.mjs` (baseline) and `tmp/modmap3.mjs` (target grouping). **`tmp/` is
gitignored throwaway — those files may be gone by the time this is executed.** Phase 0's very first
action is to copy the `G` map out of `tmp/modmap3.mjs` into checked-in tooling; the numbers below are
the record of what it produced.

- **Host `src/` is already an acyclic 8-level DAG.** Level 0 leaves: `protocol`, `theme-registry`,
  `mermaid-palettes`, `wiki-core`, `md-scan`, `link-target`, `diff-lines`, `reveal-range`,
  `sync-state`, `host-log`, `state-keys`, `active-panels`, `message-shape`, `diagram-cache-host`,
  `git-conflict`, `echarts-gallery`, `reading-time`, `lute-block-repair`. Sinks:
  `editor-session` (19 deps) → `markdown-editor-provider` → `extension`. **The host needs folders,
  not surgery.**
- **Shared-kernel leak:** the webview imports 7 host modules — `protocol` (8 importers),
  `theme-registry` (5), `mermaid-palettes` (4), `echarts-theme` (3), `wiki-core` (2),
  `message-shape` (1), `lute-gap-repair` (1).
- **Webview cross-group cycles:** 9 bidirectional pairs under the first-draft grouping → **1** under
  the target grouping below (relabeling only, zero code changes) → **0** after the
  `message-router` inversion (phase 3). Cross-group edge kinds drop 49 → 43.
- **True leaves (import nothing):** `engine-registry`, `diagram-dom`, `webview-log`, `source-map`,
  `stream-chunk`, `d2-config`, `vditor-theme`.
- **`diagram-retheme` is a per-engine dispatcher**, not a cross-cutting layer — it imports
  `mermaid-retheme` / `echarts-retheme` / `flowchart-retheme` / `plantuml-retheme` by design,
  exactly as `custom-diagrams` does for render. It is not evidence of a missing leaf.

## Target layout

> **The two tables below are the PLAN, not the result — `scripts/module-manifest.mjs` is the source
> of truth and wins wherever they disagree.** Six files landed elsewhere than planned, each for a
> reason recorded in this file: `extension`/`markdown-editor-provider`/`commands`/`status-bar` split
> out of `platform/` into `app/`; `asset-link-actions` went `wiki/` → `session/` (it was the last
> `platform<->wiki` edge); `link-target` went `wiki/` → `shared/` and `lute-gap-repair` +
> `lute-block-repair` went `lute/` → `shared/` (all three pass purity, and moving them is what made
> the cross-side rule zero-exception); `escape-arm`/`escape-toolbar` went `chrome/` → `editing/`;
> `editor-view-type.ts` is new in `shared/`. Read the tables for the *reasoning*; read the manifest
> for the *layout*.

### Host — `src/` → 8 modules (44 files)

`src/shared/` is a **subfolder of `src/`, not a third top-level unit.** Root `tsconfig.json` has
`rootDir: "src"` and `package.json` has `main: "out/extension.js"`; a top-level `shared/` forces
`rootDir: "."`, reshapes `out/` to `out/src/…` and breaks `main`. Verified.

| module | files |
|---|---|
| `shared/` (7) | protocol, message-shape, theme-registry, mermaid-palettes, echarts-theme, echarts-gallery, wiki-core |
| `markdown/` (6) | md-scan, diff-lines, table-pipe-escape, minimal-diff-writeback, outline-tree, reading-time |
| `lute/` (3) | lute-host, lute-block-repair, lute-gap-repair |
| `writeback/` (5) | writeback-controller, git-diff, git-conflict, doc-sync, sync-state |
| `wiki/` (5) | wiki, wiki-cache, wiki-session, link-target, asset-link-actions |
| `webview-host/` (4) | html-builder, webview-message-shape, diagram-cache-host, panel-config |
| `platform/` (11) | extension, markdown-editor-provider, commands, status-bar, active-panels, tab-targeting, state-keys, host-log, host-session-state, editor-config, default-mode |
| `session/` (3) | editor-session, reveal-caret, reveal-range |

`src/shared/` must import **nothing** from the other host modules — it is the contract both sides
depend on. Assert this in the phase-4 meta-test.

**CORRECTED (phase 3, task 460).** The line above states the RESULT of the invariant, not what
membership actually tests. The real definition, found the hard way (see `heading-slug`/`md-scan`,
`code-ref-core`, and `editor-view-type` below, and `isWikiFile`'s rejection in the same phase):

> `shared/` is **the dependency-free kernel — no `vscode`, no Node, no browser APIs.** The
> host↔webview contract is its principal tenant, not its membership test. Purity is what makes a
> module safe to sit at the bottom of BOTH the host and webview import graphs simultaneously; "used
> by both sides" is just the most common reason a file ends up there.

Worked examples, all now in `shared/`: `md-scan.ts` and `heading-slug.ts` (the webview never
imports `md-scan` directly — it's there because `heading-slug` needs it and it's dependency-free).
`code-ref-core.ts` (true leaf, one cross-side importer). `editor-view-type.ts` (`MarkdownEditorViewType`
— a package.json-declared string constant, needed by `platform/` AND `wiki/` but not the webview at
all; it passes on purity, same as `md-scan`, and resolved the `platform<->wiki` module cycle).

The worked NEGATIVE example is `isWikiFile` (also `platform<->wiki`, considered and rejected in the
same phase): self-contained within `wiki.ts` — no sibling-module imports — but its whole job is
reading `vscode.workspace` config/folders, so it fails purity outright. Moving it would have broken
the invariant for the 3 webview files that already import `wiki-core.ts` on the promise it never
touches `vscode`/Node. **The purity rule is what makes shared/ safe; the "both sides" framing on the
line above is a symptom of it, not the rule itself — read it that way from here on.**

### Webview — `media-src/src/` → 13 modules (132 files)

| module | files |
|---|---|
| `util/` (14) | webview-log, source-map, stream-chunk, debounce, deep-merge, disposables, observe-coalesce, format-timestamp, lang, platform, load-script, utils, types, inner-vditor |
| `diagram-kit/` (10) | engine-registry, diagram-dom, diagram-error, diagram-loading, diagram-note, diagram-surfaces, diagram-palette, d2-config, native-offscreen, diagram-config-delta |
| `boot/` (9) | main, preload, finish-init, init-payload, vditor-init, vditor-options, vditor-theme, live-config, editor-session-state |
| `bridge/` (7) | message-router, vscode-api, edit-sync, edit-sync-tuning, save-flush, pending-edit, incremental-md |
| `editing/` (23) | caret, caret-preserve, caret-scroll, editor-caret, initial-caret, focus-restore, gap-paragraph, hr-nav, list-backspace, list-tight, fix-table-ir, spin-skip-fence, spin-strip, wysiwyg-code-highlight, code-source, edit-activity, mutation-scope, html-comment, table-hotkey, undo-keybind, callouts, callout-nav, preview-morph |
| `clipboard/` (6) | clipboard-line, paste-transform, paste-table, image-convert, upload-handler, upload-name |
| `links/` (7) | link-click, link-click-fix, link-open-policy, link-url, raw-href, wiki-serialize, custom-renderer |
| `nav/` (6) | outline, outline-resize, heading-align, preview-scroll-preserve, split-scroll-sync, viewport-gate |
| `chrome/` (9) | toolbar, toolbar-actions, toolbar-dismiss, toolbar-scroll-guard, busy-cursor, prerender-overlay, open-preview, responsive-tables, diff-markers |
| `diagrams/` (20) | diagram-retheme, custom-diagrams, diagram-runtime, diagram-zoom, diagram-zoom-gate, render-cache-client, faithful-render, stream-render, abc-fit, echarts-apply, echarts-fit, echarts-retheme, flowchart-retheme, markmap-fit, graphviz-render, smiles-render, engines/{geojson-topojson, nomnoml, stl, vega, wavedrom} |
| `diagrams/d2/` (12) | d2-entry, d2-geometry, d2-refine, d2-render, d2-sketch, d2-wasm, astar, elk-layout, elk-entry, elk-bundled-shim, boot-elk, engines/d2 |
| `diagrams/plantuml/` (4) | plantuml-render, plantuml-stdlib, plantuml-timing, plantuml-retheme |
| `diagrams/mermaid/` (4) | mermaid-elk, mermaid-elk-entry, mermaid-retheme, mermaid-theme |

Three decisions this encodes, each measured:

1. **No horizontal `theme/` layer.** Per-engine **vertical slices** — each engine owns its render
   *and* its retheme. The first draft's `theme/` group produced the largest cycle (14 edges out,
   5 back). Dissolving it also drops total cross-group edge kinds 49 → 43.
2. **`diagram-kit/` is strictly diagram-domain.** `webview-log`, `source-map` and `stream-chunk` are
   generic leaves (logging / position mapping for `nav` / chunk reassembly for `bridge`) and belong
   in `util/`. Putting them in `diagram-kit` invites the next diagram feature to dump unrelated leaf
   code there.
3. **`vditor-theme` is boot, not theme.** Zero imports, exactly one importer (`vditor-init`); it is
   not diagram theming.

Also relocate, and state explicitly in the manifest rather than leaving them stranded:
`stubs/vditor-toolbar-stubs.ts`, `__fixtures__/d2-raw-layouts.json`, `media/vditor/` (a build
artifact directory — leave in place).

Co-located `*.test.ts` files move **with their source**, unchanged in that respect.

## Non-goals — read before starting

- [x] **`d2-render.ts` (2423 lines) and `d2-refine.ts` (1651) are NOT split here.** That is a
      *content* refactor; mixing it into a pure-rename pass destroys the commit discipline below and
      loses `git blame` on the two largest files in the repo. It is the single highest-value
      readability win available (and `d2` is already the cleanest-layered cluster) — file it as its
      own task — **now filed as [474](474-d2-render-refine-content-split.md)** (2026-07-31), with
      task 469's cognitive-complexity measurement as evidence: `d2-render.ts` holds a **CC 255**
      function and `d2-refine.ts` holds **23** functions over the threshold of 15, out of 107 in the
      whole tree. 474 must NOT overlap with this task, same reason as 469 §4 — recommended after.
      (461-465 are the patch-vs-runtime cleanup.) Reference it from
      here. **If you disagree, say so before phase 0, not during.**
- [x] **No `tsconfig paths` / esbuild `alias` / `vitest resolve.alias` aliasing.** This pass uses
      relative paths and a codemod. Aliases would make *future* moves free but add new machinery to
      three configs; adopting them halfway through is the bad outcome. Explicit follow-up, not scope.
- [x] **`editor-session.ts` (679 lines, 19 deps) is not "fixed".** It is a composition-root sink,
      the same intentional pattern as `main.ts` / `finish-init.ts` on the webview side. Document it
      in ADR-0005 (phase 4); do not decompose it.
- [x] ~~**`VDITOR_TS_PATCHES` (`media-src/esbuild-shared.mjs`) is untouched.** Verified: its `filter`
      regexes target *vendored Vditor* files, not ours. Folders neither help nor hurt it.~~
      **WRONG — corrected in phase 2.** The `filter` regexes are indeed untouched (they match
      vendored Vditor files, as claimed), but three of the *patches themselves* inject import
      statements as literal TEXT into that vendored source (`fixGraphvizRender`,
      `fixPreviewMdRerender`, `fixPlantumlRender`), with hardcoded relative paths from
      `node_modules/vditor/src/ts/...` back into **our** files
      (`../../../../../src/graphviz-render`, `.../src/html-comment`, `.../src/plantuml-render`).
      Those are strings inside JS template literals, not import syntax — invisible to both the
      codemod's regexes and to `tsc`/`git mv`. A module move needs these three edited by hand.
      Caught by `node build.mjs` failing with `Could not resolve "../../../../../src/graphviz-
      render"` reported from *inside* `node_modules/vditor/src/ts/markdown/graphvizRender.ts` —
      not from anywhere in our own source, which is what made it non-obvious at first read of the
      error. Fixed in phase 2 (`e22e3a1`): `../../../../../src/diagrams/graphviz-render`, `.../
      src/editing/html-comment`, `.../src/diagrams/plantuml/plantuml-render`.
- [x] No behaviour change anywhere. Any diff that is not a move or a path rewrite (outside phase 3)
      is out of scope.

## Preconditions

- [ ] **Working tree clean.** A mass rename on top of in-flight work tangles both and destroys
      reviewability. At the time of writing: `M media-src/src/main.css`, `M tasks/244-*`,
      `M test/vscode-e2e/retheme-preview-surface.spec.ts`, plus untracked `preview-spacing*` e2e
      files. The user controls git — land or park these first; do not stash them unasked.
      **NOT met, deliberately** — the tree was never fully clean during this arc (parallel work on
      244/454/469 ran throughout). It cost less than the precondition predicted because every phase
      was two commits and the codemod was idempotent, so the rename diff stayed separable from the
      in-flight edits. Do not read this as "the precondition was wrong": it held for the *host*
      files, which nothing else was touching. Had 244's webview edits overlapped phase 2, it would
      have bitten.
- [x] Branch agreed with the user (this is a whole-tree rename; it should not ride along on a
      feature branch).

## Phase 0 — manifest + codemod tooling

- [x] **First action:** copy the `G` map out of `tmp/modmap3.mjs` into a checked-in
      `scripts/module-manifest.mjs` (module → file list, both sides) before `tmp/` is lost. This is
      the single source of truth for every later phase and for the phase-4 meta-test.
- [x] Assert the manifest is total and disjoint: every `.ts` under `src/` and `media-src/src/` is in
      exactly one module; no file listed twice; no listed file missing from disk.
- [x] Write the **resolve-then-rewrite codemod**: resolve each specifier against the layout **as it
      is on disk right now** → map the target through the manifest → recompute the relative path
      from the importing file's *current* location. A naive string replace is not sufficient — depth
      changes (`media-src/src/d2-render.ts` → `media-src/src/diagrams/d2/d2-render.ts` turns
      `../../src/protocol` into `../../../../src/shared/protocol`).
- [x] **The codemod must be re-runnable and idempotent**, driven by the manifest and current file
      locations — never a one-shot old→new diff. It runs at least twice over the same files: phase 1
      points `test/backend` at `src/shared/*`, then phase 2 moves webview files and changes the depth
      of those very same `../../src/shared/*` specifiers. Running it on an already-correct tree must
      be a no-op.
- [x] The codemod must cover **all specifier forms**, not just `from '…'`. Measured across
      `media-src/src`, `media-src/e2e`, `test/backend`: **129 non-`from` relative references** —
      93× `vi.mock(…)`, 34× dynamic `import(…)`, 2× `require(…)`. `vi.mock` is the dangerous one:
      it fails at *runtime*, not compile time (e.g.
      `vditor-init.test.ts:56 → vi.mock('../../src/echarts-theme', …)`).
      **This list was incomplete — corrected in phase 2.** Bare side-effect imports
      (`import '../src/preload'`, `import './main.css'` — no `from` keyword at all) are a genuine
      sixth form; the `from`-regex can't match them since it requires the literal word "from".
      34 occurrences (mostly `media-src/e2e/*-harness.ts`'s `import '../src/preload'`, plus
      `main.ts`'s two CSS imports). Missed on phase 2's first codemod pass; caught because
      `node build.mjs` stayed red after the apply — `main.ts`'s `./main.css` was the tell. Codemod
      now has a `bare import` pattern alongside the other four regexes.
- [x] Dry-run mode that reports every rewrite without writing, plus a count per file set.

## Phase 1 — host `src/` → 8 modules (including `shared/`)

All 44 host files move to their **final** locations in one pass. Do not stage `src/shared/`
separately: the 7 kernel modules would move twice and `test/backend`'s 36 distinct targets would be
rewritten twice for nothing.

- [x] `git mv` the 44 files into the 8 modules above, `shared/` included.
- [x] Rewrite intra-`src/` imports.
- [x] Rewrite **63 files in `test/backend/`** — 13 import `../../src/extension` alone, 5
      `wiki-cache`, 3 `theme-registry`; every one of the 36 distinct targets moves.
- [x] `package.json` `main`: `out/extension.js` → `out/platform/extension.js`.
- [x] Assert `src/shared/` imports nothing from sibling host modules.
- [x] Gates (below) green before continuing.

Webview-side imports still point at `../../src/<m>` at the end of this phase and are **broken until
phase 2** — that is expected. The host gates (`tsc`, `npm test` for `test/backend`) are green;
`node build.mjs` is not. Do not try to fix it here: the webview rewrite needs phase 2's new depths.

## Phase 2 — webview `media-src/src/` → 13 modules (+ the cross-side rewrite)

- [x] `git mv` the 132 files (+ `stubs/`) into the modules above.
- [x] Rewrite intra-webview imports, including the 129 non-`from` forms.
- [x] Rewrite the cross-side imports in the same pass, since they need the same new depths:
      `../../src/<m>` → `…/src/shared/<m>` from each file's new location.
- [x] Rewrite **38 files in `media-src/e2e/`** that import `../src/<m>`, plus its two cross-side
      imports (`../../src/echarts-theme`, `../../src/theme-registry`).
- [x] `media-src/build.mjs`: 4 `entryPoints` — `./src/main.ts` → `./src/boot/main.ts`,
      `./src/elk-entry.ts` → `./src/diagrams/d2/elk-entry.ts`, `./src/d2-entry.ts` →
      `./src/diagrams/d2/d2-entry.ts`, `./src/mermaid-elk-entry.ts` →
      `./src/diagrams/mermaid/mermaid-elk-entry.ts`.
- [x] `media-src/build.mjs:84` — `new URL('./src/elk-bundled-shim.ts', …)`. **A path reference
      outside the `entryPoints` array**; easy to miss.

## Phase 3 — `message-router` inversion (the only real code change)

The last remaining cycle. `main.ts` → `message-router`, while `message-router` imports back into
boot: `applyBodyOptions` / `swapStyle` / `initOnlyChanged` (live-config), `sessionState`
(editor-session-state), `initVditor` / `renderCacheThemeKey` (vditor-init) — all real value imports
called while dispatching host messages. (The `import type { InitPayload }` is type-only and erases;
ignore it.)

- [x] Extract a handler-map type; `main.ts` as composition root builds it and passes it in.
- [x] `message-router` stops importing boot modules. Touches 2 files.
- [x] Re-run the cycle check: expect **0** bidirectional pairs.
- [x] Worth doing **even if the physical move is abandoned** — it is a genuine architectural fix,
      contained and independently valuable.

## Phase 4 — lock it down

- [x] **Boundary meta-test** (`test/backend/module-boundaries.test.ts`), following this repo's own
      pattern (`engine-registry.test.ts`, `harness-registry.test.ts`): reads the phase-0 manifest and
      asserts (a) every `.ts` is in exactly one module, (b) **zero cross-module cycles**, (c) an
      allowed-edge allowlist, (d) `src/shared/` has no sibling imports. Without this the DAG rots and
      the whole reorg was cosmetic.
- [x] **Do not assert "`diagram-kit/` is a leaf layer" — it isn't, and three measured edges prove
      it:** `native-offscreen` → `diagram-dom`, `diagram-config-delta` → `engine-registry`,
      `diagram-palette` → `d2-config` (plus a host `type` import). The rule to encode is
      *intra-module edges are unconstrained; **inter-module** edges must be in the allowlist and
      acyclic*. `diagram-kit` is a bottom **module** (nothing outside it that it depends on), not a
      set of pure leaves. Writing the assertion the other way makes it fail on day one.
- [x] **ADR-0005 drift fix** — it currently claims `protocol.ts` lives in `media-src/src/` (it is in
      `src/`), and it does not record that `editor-session.ts` / `main.ts` / `finish-init.ts` are
      *intentional* composition-root sinks.
- [x] **ADR-0008** — the module decomposition itself: the 21 modules, the three encoded decisions,
      why `src/shared/` is not top-level, and the aliasing non-goal.

## String-path inventory — the class no compiler catches

`tsc --noEmit` and esbuild hard-fail on every broken *import*, so import breakage is cheap to find.
These are paths in **strings and configs**, which fail silently or late:

- [x] `package.json` → `main: "out/extension.js"` (phase 1). ⚠️ **This entry was ticked and still
      shipped broken.** Phase 1 moved `extension.ts` into `platform/` and updated `main`; phase 3
      moved it `platform/`→`app/` and updated nothing, so `main` pointed at `out/platform/extension.js`
      — a path the build no longer produces. **A clean checkout could not activate the extension.**
      It passed every gate because nothing cleans `out/` between builds: a stale artifact from before
      the split sat next to the real one. Reproduced with `rm -rf out && node build.mjs`; found by
      accident while sourcing a fact for ADR-0008, by no gate at all. Fixed in `6946463`, and
      `test/backend/manifest.test.ts` no longer pins the literal string — it globs `src/**/extension.ts`
      and derives the expected `main` from disk, so the two cannot drift again. The old test was
      *worse than useless*: it pinned the wrong value and was dutifully updated in lockstep with it.
- [x] **Quality-tool configs — the gap this section had.** They were not listed here, and both bugs
      above are exactly this class. A stale exclude/entry path does not error; it matches nothing and
      **silently stops enforcing**, so the tool keeps reporting green over a smaller graph than you
      think it checks. `knip.jsonc` had **7 stale flat-tree paths** (`src/extension.ts`,
      `src/main.ts`, `src/elk-entry.ts`, `src/d2-entry.ts`, `src/mermaid-elk-entry.ts`,
      `src/stubs/vditor-toolbar-stubs.ts`, `src/types.ts`) — all rewritten in `6946463`. Verified
      safe: `.jscpd.json` and `.dependency-cruiser.cjs` use recursive globs / regex path shapes, and
      `scripts/quality.mjs` invokes the npm scripts rather than naming source paths.
      **Rule for the next reorg: grep every config for a source path, not just the build inputs.**
- [x] `media-src/build.mjs` → 4 `entryPoints` + the `elk-bundled-shim.ts` `new URL(…)` (phase 2).
- [x] `test/vitest.config.ts` → `coverage.exclude` lists `media-src/src/main.ts`, `preload.ts`,
      `types.ts` — all three move.
- [x] `scripts/check-coverage-modules.mjs` → **27 hardcoded paths** (24 `BASELINE_ZERO` + 3
      `EXCLUDED`, mirroring the vitest exclude). Behaviour after a move, traced: stale entries fall
      out of `BASELINE_ZERO` into the advisory `pruned` list (exit 0), while each moved file appears
      at its *new* path at 0% and not in the baseline → `newlyZero` → **exit 1**. So it fails
      loudly, not silently — good, but it means `npm run test:coverage` is red until all 27 are
      rewritten. Rewrite them in the same commit as the corresponding move.
- [x] Verified **safe, no change needed** (recorded so nobody re-checks): `biome.json` uses
      recursive globs (`src/**/*.ts`); `test/vitest.config.ts` `include` is recursive;
      `.vscodeignore` excludes `src`/`test` wholesale; `.vscode/launch.json` uses
      `out/**/*.js` + `extensionDevelopmentPath=${workspaceRoot}`;
      `test/vscode-e2e/playwright.config.ts` `extensionDevelopmentPath` is `repoRoot`;
      `src/html-builder.ts` references `media/dist/main.css` (a **build output**, not a source path);
      root `tsconfig.json` `rootDir: "src"` stays valid.

## Commit discipline (non-negotiable)

- [x] **Two commits per phase.** (1) pure `git mv`, zero content changes. (2) import/path rewrites.
      Combining them collapses git's rename-detection similarity score and you lose `blame` on
      `d2-render.ts` (2423 lines) for real.
- [x] **Commit (1) does not compile, on purpose.** Do not try to make it green — every import in the
      moved files is stale until commit (2). The **phase** (both commits together) is the unit that
      compiles, passes gates and can be reverted; individual commits are not. An executor who
      insists on a green commit (1) will merge the two and lose the blame.
- [x] Add the rewrite commits to `.git-blame-ignore-revs` (create it if absent).

## Verification (run per phase, not once at the end)

```bash
npx tsc --noEmit -p ./                      # host
npm --prefix media-src run typecheck        # webview (tsconfig.typecheck.json)
node build.mjs                              # esbuild resolves EVERY import — the real import check
npm test                                    # vitest, both sides (this is what catches vi.mock breakage)
npm run test:coverage                       # includes the 27-path ratchet
npm run lint:ci                             # Biome, whole tree
xvfb-run -a npm run test:vscode:fast        # real VS Code, routine tier
```

- [ ] Full real-VS-Code suite (`test:vscode`, ~1–2 h) **proposed to the user for the handover, not
      started unilaterally**. Given the blast radius, this is the one task where it is genuinely
      warranted before merge. **STILL OUTSTANDING** — proposed, and the user has the whole suite on
      hold. This is the only unticked deliverable of the task; do not merge to `main` without it.
- [x] Cycle check re-run from the checked-in manifest: 1 pair before phase 3, **0** after.

Gates actually run on the final tree (2026-07-31, load 2.7):

| gate | result |
|---|---|
| host `tsc` / webview `typecheck` | clean / clean |
| `node build.mjs` | green |
| `npm test` | **174 files, 2481/2481** |
| `npm run test:coverage` + ratchet | OK — 21 at 0%, baseline 21 |
| `npm run lint:ci` | clean, 655 files |
| chromium harness (`media-src/e2e`) | 428 passed, 1 skipped |
| `test:vscode:fast` | see the run in this task's commit message |

## Definition of done

Every phase checkbox ticked, all gates green, boundary meta-test in place and failing when a cycle
is introduced (prove it: add a deliberate bad import, watch it go red, revert), ADR-0005 corrected,
ADR-0008 written, and **[474](474-d2-render-refine-content-split.md)** filed for the
`d2-render`/`d2-refine` split. (The line above originally said "task 461" — that number was taken by
the patch-vs-runtime block and the split was refiled as 474.)
