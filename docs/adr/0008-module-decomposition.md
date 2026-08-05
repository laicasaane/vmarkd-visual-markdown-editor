# ADR-0008 — Module decomposition: named modules for both source trees

- **Status:** Accepted
- **Date:** 2026-07-31
- **Tags:** architecture, refactoring, modules, host, webview, build
- **Related:** task 460 (this ADR's task), task 474 (`d2-render.ts`/`d2-refine.ts` content split,
  filed as a non-goal of 460), ADR-0005 (architecture overview — owns the `shared/` membership rule
  and the four worked cases; this ADR does not repeat them), `scripts/module-manifest.mjs` (the
  checked-in module map), `test/backend/module-boundaries.test.ts` (the enforcement).

## Context

Both source trees were flat. Host `src/` was 44 files / 7,854 lines with zero subdirectories;
webview `media-src/src/` was 132 non-test files / 23,774 lines with one (`diagram-engines/`). The
grouping that already existed in people's heads was invisible on disk, and the webview reached
**into the host folder** (`../../src/protocol`) for 7 modules with no named shared kernel. Task 460
did the physical move, rewrote every import, and locked the result down with a meta-test so it
cannot rot back. This ADR records the decomposition itself; see ADR-0005's "Module decomposition
(task 460)" subsection for the `shared/` membership rule and the four cases that decided it.

## Decision

### Host `src/` — 9 modules, 47 files

The task's original grouping proposed 8 modules; a single `platform/` held both composition-root
sinks (`extension`, `markdown-editor-provider`) and leaves (`host-log`, `state-keys`,
`active-panels`, …), which structurally cycles with everything in between — measured as 3
bidirectional module pairs (`platform<->session`, `platform<->webview-host`, `platform<->wiki`)
once checked at module level rather than file level. `platform/` was split into `app/` (the sinks)
and `platform/` (the leaves) during phase 3, which resolved two of the three pairs outright; the
third (`platform<->wiki`) needed `editor-view-type.ts` moved into `shared/` (see ADR-0005). This is
the layout now on disk and asserted by `scripts/module-manifest.mjs`.

| module | files |
|---|---|
| `shared/` (14) | protocol, message-shape, theme-registry, mermaid-palettes, echarts-theme, echarts-gallery, wiki-core, code-ref-core, heading-slug, md-scan, editor-view-type, link-target, lute-gap-repair, lute-block-repair |
| `markdown/` (5) | diff-lines, table-pipe-escape, minimal-diff-writeback, outline-tree, reading-time |
| `lute/` (1) | lute-host |
| `writeback/` (5) | writeback-controller, git-diff, git-conflict, doc-sync, sync-state |
| `wiki/` (3) | wiki, wiki-cache, wiki-session |
| `webview-host/` (4) | html-builder, webview-message-shape, diagram-cache-host, panel-config |
| `app/` (4) | extension, markdown-editor-provider, commands, status-bar |
| `platform/` (7) | active-panels, tab-targeting, state-keys, host-log, host-session-state, editor-config, default-mode |
| `session/` (4) | editor-session, reveal-caret, reveal-range, asset-link-actions |

`src/shared/` is a **subfolder of `src/`, not a third top-level unit.** Root `tsconfig.json` has
`rootDir: "src"` and `package.json` has a `main` field pointing at the compiled entry point; a
top-level `shared/` would force `rootDir: "."`, reshape `out/` to `out/src/…` and break `main`.
Verified during the task. (`extension.ts` itself moved twice — `platform/` in phase 1, then
`app/` in phase 3 once the `app`/`platform` split was found; see "What this cost" below for the
`package.json` `main` field this left stale.)

### Webview `media-src/src/` — 13 modules, 141 files

| module | files |
|---|---|
| `util/` (16) | webview-log, source-map, stream-chunk, debounce, deep-merge, disposables, observe-coalesce, format-timestamp, lang, platform, load-script, utils, types, inner-vditor, roving-tabindex, vscode-api |
| `diagram-kit/` (10) | engine-registry, diagram-dom, diagram-error, diagram-loading, diagram-note, diagram-surfaces, diagram-palette, d2-config, native-offscreen, diagram-config-delta |
| `boot/` (9) | vditor-theme, main, preload, finish-init, init-payload, vditor-init, vditor-options, live-config, editor-session-state |
| `bridge/` (6) | message-router, edit-sync, edit-sync-tuning, save-flush, pending-edit, incremental-md |
| `editing/` (24) | caret, caret-preserve, caret-scroll, editor-caret, initial-caret, focus-restore, gap-paragraph, gap-boundary, gap-nav, gap-click, list-backspace, fix-table-ir, spin-skip-fence, spin-strip, wysiwyg-code-highlight, code-source, edit-activity, mutation-scope, html-comment, table-hotkey, undo-keybind, callouts, callout-nav, preview-morph, escape-arm, escape-toolbar |
| `clipboard/` (6) | clipboard-line, paste-transform, paste-table, image-convert, upload-handler, upload-name |
| `links/` (11) | link-click, link-click-fix, link-open-policy, link-url, raw-href, wiki-serialize, custom-renderer, code-ref-decorate, code-ref-resolve, same-doc-anchor, wiki-chip-a11y |
| `nav/` (7) | outline, outline-resize, heading-align, preview-scroll-preserve, split-scroll-sync, viewport-gate, outline-keyboard |
| `chrome/` (11, incl. `chrome/stubs/`) | toolbar, toolbar-actions, toolbar-dismiss, toolbar-scroll-guard, busy-cursor, prerender-overlay, open-preview, responsive-tables, diff-markers, toolbar-icons, `stubs/vditor-toolbar-stubs` |
| `diagrams/` (21, incl. `diagrams/engines/`) | diagram-retheme, echarts-retheme, flowchart-retheme, custom-diagrams, diagram-runtime, diagram-zoom, diagram-zoom-gate, render-cache-client, faithful-render, stream-render, abc-fit, echarts-apply, echarts-fit, markmap-fit, graphviz-render, smiles-render, `engines/`{geojson-topojson, nomnoml, stl, vega, wavedrom} |
| `diagrams/d2/` (12, incl. `diagrams/d2/engines/`) | d2-entry, d2-geometry, d2-refine, d2-render, d2-sketch, d2-wasm, astar, elk-layout, elk-entry, elk-bundled-shim, boot-elk, `engines/d2` |
| `diagrams/plantuml/` (4) | plantuml-render, plantuml-stdlib, plantuml-timing, plantuml-retheme |
| `diagrams/mermaid/` (4) | mermaid-elk, mermaid-elk-entry, mermaid-retheme, mermaid-theme |

This is 13 *modules* by grouping identity (`moduleIdFor` in `scripts/module-manifest.mjs`), even
though `diagrams/engines/`, `diagrams/d2/engines/` and `chrome/stubs/` are separate *directories*
on disk — they are subdirectories of the `diagrams`, `diagrams/d2` and `chrome` modules
respectively, not sibling modules. Conflating directory with module identity was tried first and
produced a false `diagrams <-> diagrams/engines` cycle report in phase 3; `moduleDirFor` (where a
file lives) and `moduleIdFor` (which module it belongs to for cycle/allowlist purposes) are
deliberately separate functions in the manifest for this reason.

Three decisions this encodes, each measured:

1. **No horizontal `theme/` layer.** Per-engine **vertical slices** — each engine owns its render
   *and* its retheme. The first draft's `theme/` group produced the largest cycle (14 edges out, 5
   back). Dissolving it dropped total cross-group edge kinds 49 → 43.
2. **`diagram-kit/` is strictly diagram-domain.** `webview-log`, `source-map` and `stream-chunk`
   are generic leaves (logging / position mapping for `nav/` / chunk reassembly for `bridge/`) and
   belong in `util/`. Putting them in `diagram-kit/` would invite the next diagram feature to dump
   unrelated leaf code there.
3. **`vditor-theme` is boot, not theme.** Zero imports, exactly one importer (`vditor-init`); it is
   not diagram theming.
4. **`vscode-api` is `util/`, not `bridge/`** — the one placement that reads wrong topically. It is
   "the handle to the host", so `bridge/` is where you look for it; but its own two imports are both
   *type-only*, making it a zero-value-import leaf, exactly the criterion decision 2 used. Topic is
   not a layering argument. This was not free: it sat in `bridge/` until 2026-07-31, and because
   `chrome`, `clipboard`, `links` and `util` each reach it through a **bare side-effect**
   `import '../bridge/vscode-api'` — no `from` keyword, invisible to a `from '…'`-only regex — it
   closed four `bridge<->X` cycles that put 12 of 13 webview modules on a cycle while the meta-test
   reported zero. Moving it removed those four edges and added none. See task 460's correction block.

### Disagreement with the task file, resolved in favour of the manifest

The task file's tables (written at the 2026-07-30 baseline measurement) show 8 host modules / 44
files and 13 webview modules / 132 files. The layout actually on disk, and asserted by
`scripts/module-manifest.mjs`, is **9 host modules / 47 files** and **13 webview modules / 141
files** (webview module *count* matches; the file count grew). The manifest wins in every case —
it is re-verified against the tree by `checkManifest()`, the task file's tables are not. The
deltas, all reconciled in the manifest with inline comments at each site:

- Files added after the baseline measurement landed in their modules: `asset-link-actions`
  (wiki → session), `link-target` (wiki → shared), `lute-gap-repair` + `lute-block-repair`
  (lute → shared), `escape-arm` / `escape-toolbar` (chrome → editing), `code-ref-core` /
  `heading-slug` (new, shared), `editor-view-type` (new, shared — see below),
  `code-ref-decorate` / `code-ref-resolve` / `same-doc-anchor` / `wiki-chip-a11y` (links),
  `outline-keyboard` (nav), `toolbar-icons` (chrome), `roving-tabindex` (util).
- `list-tight.ts` (in the task file's `editing/` list) was deleted before the move; it is absent
  from the manifest.
- Host `platform/` split into `app/` + `platform/` (see the host table above) — a module-level
  finding the file-level baseline could not have shown, since "host `src/` is an acyclic DAG" in
  the task's ground truth was a file-level fact, not a module-level one.

## Why `src/shared/` is not a third top-level unit

Covered above under the host table; restated here because it is a decision, not incidental to the
layout: a top-level `shared/` sibling to `src/` would force `rootDir: "."` in the root
`tsconfig.json`, reshape build output to `out/src/…`, and break `package.json`'s `main` field.
Nesting it inside `src/` avoids all three. Verified during the task, not merely asserted.

## Enforcement

`test/backend/module-boundaries.test.ts` reads `scripts/module-manifest.mjs` and asserts, against
the real tree, on every test run:

1. The manifest is total and disjoint (every `.ts` file under `src/` and `media-src/src/` is in
   exactly one module).
2. **Zero inter-module cycles**, computed per side by a DFS/SCC walk over module-level edges — not
   a pairwise `A<->B` check, which would miss a 3-node `A->B->C->A` cycle.
3. Every inter-module edge kind is in an explicit allowlist (`HOST_ALLOWED_EDGES` /
   `WEBVIEW_ALLOWED_EDGES`); a new, undocumented inter-module import fails the test instead of
   landing silently.
4. Cross-side imports (webview → host) resolve to `src/shared/` only, with zero exceptions.
5. `src/shared/` imports nothing outside itself.

The rule the test deliberately does **not** encode: `diagram-kit/` is a bottom **module**, not a
set of pure leaves. It has real intra-module edges (`native-offscreen` → `diagram-dom`,
`diagram-config-delta` → `engine-registry`, `diagram-palette` → `d2-config`) and one real
inter-module edge (`diagram-kit` → `util`). Intra-module edges are unconstrained by design; only
inter-module edges are allowlisted and required to be acyclic. Asserting "`diagram-kit/` is a leaf
layer" outright would have failed on day one against these three edges.

## Consequences / non-goals

- **No `tsconfig` paths / esbuild `alias` / `vitest resolve.alias` aliasing.** The move uses
  relative paths and a codemod (`scripts/codemod-module-move.mjs`). Aliases would make *future*
  moves free but add new machinery to three configs (`tsconfig.json`, `media-src/build.mjs`,
  `test/vitest.config.ts`); adopting them halfway through this pass would have been the bad
  outcome. This is an explicit follow-up, not scope of task 460.
- **`d2-render.ts` (2,423 lines) and `d2-refine.ts` (1,651 lines) were not split.** That is a
  *content* refactor, not a rename; mixing it into a pure-relocation pass would have collapsed
  `git`'s rename-detection similarity score and lost blame on the two largest files in the repo.
  Filed as task 474, to run after this task, not overlapping it.
- **`editor-session.ts` (679 lines, ~19 deps), `main.ts` and `finish-init.ts` are intentional
  composition-root sinks**, the same pattern as the new `app/` module's `extension.ts` and
  `markdown-editor-provider.ts`. They import nearly everything by design; this is documented, not
  debt to "fix".

## What this cost / what to watch

`tsc --noEmit` and esbuild hard-fail on every broken *import*, so import breakage was cheap to
find and fix. The genuinely costly class was **paths inside strings and configs**, invisible to
both the codemod and the compiler:

- `package.json` → `main: "out/extension.js"`. Phase 1 rewrote it to
  `out/platform/extension.js`, correct at the time (`extension.ts` lived in `platform/`). Phase 3
  then split `platform/` into `app/` + `platform/` and moved `extension.ts` into `app/` without a
  matching rewrite here — **`main` still reads `out/platform/extension.js` as of this ADR**, and
  only keeps working because `out/` is not cleaned between builds, so a stale
  `out/platform/extension.js` from before the split still exists on disk alongside the current
  `out/app/extension.js`. This is exactly the class of breakage this section is about: it is a
  genuine miss, not a resolved example, caught while writing this ADR rather than by any gate —
  `tsc`/esbuild have nothing to check here, and the extension still launches today by accident of
  a stale build artifact.
- `media-src/build.mjs` → 4 `entryPoints` and a `new URL('./src/elk-bundled-shim.ts', …)` call
  outside the `entryPoints` array — easy to miss because it isn't in the array the other three
  live in.
- `test/vitest.config.ts` → `coverage.exclude` listing `media-src/src/main.ts`, `preload.ts`,
  `types.ts` by their old flat paths.
- `scripts/check-coverage-modules.mjs` → 27 hardcoded paths (24 `BASELINE_ZERO` + 3 `EXCLUDED`),
  mirroring the vitest exclude list.

The sharpest instance was the three `VDITOR_TS_PATCHES` in `media-src/esbuild-shared.mjs`
(`fixGraphvizRender`, `fixPreviewMdRerender`, `fixPlantumlRender`): they inject import statements
as literal **text** into vendored Vditor source, with hardcoded relative paths from
`node_modules/vditor/src/ts/...` back into our own files
(`../../../../../src/graphviz-render`, `.../src/html-comment`, `.../src/plantuml-render`). These
are strings inside JS template literals, not import syntax — invisible to the codemod's regexes
and to `tsc`/`git mv` alike. The break surfaced as `node build.mjs` failing to resolve
`"../../../../../src/graphviz-render"` from *inside*
`node_modules/vditor/src/ts/markdown/graphvizRender.ts` — not from anywhere in our own source,
which is what made it non-obvious on first read. All three needed hand-editing to
`../../../../../src/diagrams/graphviz-render`, `.../src/editing/html-comment`,
`.../src/diagrams/plantuml/plantuml-render`.

This is the durable lesson of the task: a codemod driven by import syntax cannot see a path that
isn't import syntax. Any future move must grep configs and template-literal-injected code for bare
path strings as a separate, deliberate step — not assume "the compiler will catch it."
