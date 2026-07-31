# Task 460 — Physical module decomposition (host + webview) and import cleanup

**Status:** 📋 OPEN — not started · **Impact:** 🟢 zero behaviour change by construction (pure
relocation + import rewrite), 🔴 high blast radius (≈250 files touched) · **Origin:** architecture
review 2026-07-30, cross-checked by an independent Fable review; measured with `tmp/modmap.mjs`.

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

- [ ] **`d2-render.ts` (2423 lines) and `d2-refine.ts` (1651) are NOT split here.** That is a
      *content* refactor; mixing it into a pure-rename pass destroys the commit discipline below and
      loses `git blame` on the two largest files in the repo. It is the single highest-value
      readability win available (and `d2` is already the cleanest-layered cluster) — file it as its
      own task — **now filed as [474](474-d2-render-refine-content-split.md)** (2026-07-31), with
      task 469's cognitive-complexity measurement as evidence: `d2-render.ts` holds a **CC 255**
      function and `d2-refine.ts` holds **23** functions over the threshold of 15, out of 107 in the
      whole tree. 474 must NOT overlap with this task, same reason as 469 §4 — recommended after.
      (461-465 are the patch-vs-runtime cleanup.) Reference it from
      here. **If you disagree, say so before phase 0, not during.**
- [ ] **No `tsconfig paths` / esbuild `alias` / `vitest resolve.alias` aliasing.** This pass uses
      relative paths and a codemod. Aliases would make *future* moves free but add new machinery to
      three configs; adopting them halfway through is the bad outcome. Explicit follow-up, not scope.
- [ ] **`editor-session.ts` (679 lines, 19 deps) is not "fixed".** It is a composition-root sink,
      the same intentional pattern as `main.ts` / `finish-init.ts` on the webview side. Document it
      in ADR-0005 (phase 4); do not decompose it.
- [ ] **`VDITOR_TS_PATCHES` (`media-src/esbuild-shared.mjs`) is untouched.** Verified: its `filter`
      regexes target *vendored Vditor* files, not ours. Folders neither help nor hurt it.
- [ ] No behaviour change anywhere. Any diff that is not a move or a path rewrite (outside phase 3)
      is out of scope.

## Preconditions

- [ ] **Working tree clean.** A mass rename on top of in-flight work tangles both and destroys
      reviewability. At the time of writing: `M media-src/src/main.css`, `M tasks/244-*`,
      `M test/vscode-e2e/retheme-preview-surface.spec.ts`, plus untracked `preview-spacing*` e2e
      files. The user controls git — land or park these first; do not stash them unasked.
- [ ] Branch agreed with the user (this is a whole-tree rename; it should not ride along on a
      feature branch).

## Phase 0 — manifest + codemod tooling

- [ ] **First action:** copy the `G` map out of `tmp/modmap3.mjs` into a checked-in
      `scripts/module-manifest.mjs` (module → file list, both sides) before `tmp/` is lost. This is
      the single source of truth for every later phase and for the phase-4 meta-test.
- [ ] Assert the manifest is total and disjoint: every `.ts` under `src/` and `media-src/src/` is in
      exactly one module; no file listed twice; no listed file missing from disk.
- [ ] Write the **resolve-then-rewrite codemod**: resolve each specifier against the layout **as it
      is on disk right now** → map the target through the manifest → recompute the relative path
      from the importing file's *current* location. A naive string replace is not sufficient — depth
      changes (`media-src/src/d2-render.ts` → `media-src/src/diagrams/d2/d2-render.ts` turns
      `../../src/protocol` into `../../../../src/shared/protocol`).
- [ ] **The codemod must be re-runnable and idempotent**, driven by the manifest and current file
      locations — never a one-shot old→new diff. It runs at least twice over the same files: phase 1
      points `test/backend` at `src/shared/*`, then phase 2 moves webview files and changes the depth
      of those very same `../../src/shared/*` specifiers. Running it on an already-correct tree must
      be a no-op.
- [ ] The codemod must cover **all five specifier forms**, not just `from '…'`. Measured across
      `media-src/src`, `media-src/e2e`, `test/backend`: **129 non-`from` relative references** —
      93× `vi.mock(…)`, 34× dynamic `import(…)`, 2× `require(…)`. `vi.mock` is the dangerous one:
      it fails at *runtime*, not compile time (e.g.
      `vditor-init.test.ts:56 → vi.mock('../../src/echarts-theme', …)`).
- [ ] Dry-run mode that reports every rewrite without writing, plus a count per file set.

## Phase 1 — host `src/` → 8 modules (including `shared/`)

All 44 host files move to their **final** locations in one pass. Do not stage `src/shared/`
separately: the 7 kernel modules would move twice and `test/backend`'s 36 distinct targets would be
rewritten twice for nothing.

- [ ] `git mv` the 44 files into the 8 modules above, `shared/` included.
- [ ] Rewrite intra-`src/` imports.
- [ ] Rewrite **63 files in `test/backend/`** — 13 import `../../src/extension` alone, 5
      `wiki-cache`, 3 `theme-registry`; every one of the 36 distinct targets moves.
- [ ] `package.json` `main`: `out/extension.js` → `out/platform/extension.js`.
- [ ] Assert `src/shared/` imports nothing from sibling host modules.
- [ ] Gates (below) green before continuing.

Webview-side imports still point at `../../src/<m>` at the end of this phase and are **broken until
phase 2** — that is expected. The host gates (`tsc`, `npm test` for `test/backend`) are green;
`node build.mjs` is not. Do not try to fix it here: the webview rewrite needs phase 2's new depths.

## Phase 2 — webview `media-src/src/` → 13 modules (+ the cross-side rewrite)

- [ ] `git mv` the 132 files (+ `stubs/`) into the modules above.
- [ ] Rewrite intra-webview imports, including the 129 non-`from` forms.
- [ ] Rewrite the cross-side imports in the same pass, since they need the same new depths:
      `../../src/<m>` → `…/src/shared/<m>` from each file's new location.
- [ ] Rewrite **38 files in `media-src/e2e/`** that import `../src/<m>`, plus its two cross-side
      imports (`../../src/echarts-theme`, `../../src/theme-registry`).
- [ ] `media-src/build.mjs`: 4 `entryPoints` — `./src/main.ts` → `./src/boot/main.ts`,
      `./src/elk-entry.ts` → `./src/diagrams/d2/elk-entry.ts`, `./src/d2-entry.ts` →
      `./src/diagrams/d2/d2-entry.ts`, `./src/mermaid-elk-entry.ts` →
      `./src/diagrams/mermaid/mermaid-elk-entry.ts`.
- [ ] `media-src/build.mjs:84` — `new URL('./src/elk-bundled-shim.ts', …)`. **A path reference
      outside the `entryPoints` array**; easy to miss.

## Phase 3 — `message-router` inversion (the only real code change)

The last remaining cycle. `main.ts` → `message-router`, while `message-router` imports back into
boot: `applyBodyOptions` / `swapStyle` / `initOnlyChanged` (live-config), `sessionState`
(editor-session-state), `initVditor` / `renderCacheThemeKey` (vditor-init) — all real value imports
called while dispatching host messages. (The `import type { InitPayload }` is type-only and erases;
ignore it.)

- [ ] Extract a handler-map type; `main.ts` as composition root builds it and passes it in.
- [ ] `message-router` stops importing boot modules. Touches 2 files.
- [ ] Re-run the cycle check: expect **0** bidirectional pairs.
- [ ] Worth doing **even if the physical move is abandoned** — it is a genuine architectural fix,
      contained and independently valuable.

## Phase 4 — lock it down

- [ ] **Boundary meta-test** (`test/backend/module-boundaries.test.ts`), following this repo's own
      pattern (`engine-registry.test.ts`, `harness-registry.test.ts`): reads the phase-0 manifest and
      asserts (a) every `.ts` is in exactly one module, (b) **zero cross-module cycles**, (c) an
      allowed-edge allowlist, (d) `src/shared/` has no sibling imports. Without this the DAG rots and
      the whole reorg was cosmetic.
- [ ] **Do not assert "`diagram-kit/` is a leaf layer" — it isn't, and three measured edges prove
      it:** `native-offscreen` → `diagram-dom`, `diagram-config-delta` → `engine-registry`,
      `diagram-palette` → `d2-config` (plus a host `type` import). The rule to encode is
      *intra-module edges are unconstrained; **inter-module** edges must be in the allowlist and
      acyclic*. `diagram-kit` is a bottom **module** (nothing outside it that it depends on), not a
      set of pure leaves. Writing the assertion the other way makes it fail on day one.
- [ ] **ADR-0005 drift fix** — it currently claims `protocol.ts` lives in `media-src/src/` (it is in
      `src/`), and it does not record that `editor-session.ts` / `main.ts` / `finish-init.ts` are
      *intentional* composition-root sinks.
- [ ] **ADR-0008** — the module decomposition itself: the 21 modules, the three encoded decisions,
      why `src/shared/` is not top-level, and the aliasing non-goal.

## String-path inventory — the class no compiler catches

`tsc --noEmit` and esbuild hard-fail on every broken *import*, so import breakage is cheap to find.
These are paths in **strings and configs**, which fail silently or late:

- [ ] `package.json` → `main: "out/extension.js"` (phase 1).
- [ ] `media-src/build.mjs` → 4 `entryPoints` + the `elk-bundled-shim.ts` `new URL(…)` (phase 2).
- [ ] `test/vitest.config.ts` → `coverage.exclude` lists `media-src/src/main.ts`, `preload.ts`,
      `types.ts` — all three move.
- [ ] `scripts/check-coverage-modules.mjs` → **27 hardcoded paths** (24 `BASELINE_ZERO` + 3
      `EXCLUDED`, mirroring the vitest exclude). Behaviour after a move, traced: stale entries fall
      out of `BASELINE_ZERO` into the advisory `pruned` list (exit 0), while each moved file appears
      at its *new* path at 0% and not in the baseline → `newlyZero` → **exit 1**. So it fails
      loudly, not silently — good, but it means `npm run test:coverage` is red until all 27 are
      rewritten. Rewrite them in the same commit as the corresponding move.
- [ ] Verified **safe, no change needed** (recorded so nobody re-checks): `biome.json` uses
      recursive globs (`src/**/*.ts`); `test/vitest.config.ts` `include` is recursive;
      `.vscodeignore` excludes `src`/`test` wholesale; `.vscode/launch.json` uses
      `out/**/*.js` + `extensionDevelopmentPath=${workspaceRoot}`;
      `test/vscode-e2e/playwright.config.ts` `extensionDevelopmentPath` is `repoRoot`;
      `src/html-builder.ts` references `media/dist/main.css` (a **build output**, not a source path);
      root `tsconfig.json` `rootDir: "src"` stays valid.

## Commit discipline (non-negotiable)

- [ ] **Two commits per phase.** (1) pure `git mv`, zero content changes. (2) import/path rewrites.
      Combining them collapses git's rename-detection similarity score and you lose `blame` on
      `d2-render.ts` (2423 lines) for real.
- [ ] **Commit (1) does not compile, on purpose.** Do not try to make it green — every import in the
      moved files is stale until commit (2). The **phase** (both commits together) is the unit that
      compiles, passes gates and can be reverted; individual commits are not. An executor who
      insists on a green commit (1) will merge the two and lose the blame.
- [ ] Add the rewrite commits to `.git-blame-ignore-revs` (create it if absent).

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
      warranted before merge.
- [ ] Cycle check re-run from the checked-in manifest: 1 pair before phase 3, **0** after.

## Definition of done

Every phase checkbox ticked, all gates green, boundary meta-test in place and failing when a cycle
is introduced (prove it: add a deliberate bad import, watch it go red, revert), ADR-0005 corrected,
ADR-0008 written, and task 461 filed for the `d2-render`/`d2-refine` split.
