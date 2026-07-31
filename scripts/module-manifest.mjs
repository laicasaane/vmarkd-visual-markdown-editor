#!/usr/bin/env node
// Task 460 — single source of truth for the module decomposition (host `src/` + webview
// `media-src/src/`). Checked in from `tmp/modmap3.mjs`'s `G` map (Fable's corrected grouping),
// reconciled against the tree as it stands NOW — modmap3.mjs was measured 2026-07-30 and a
// session's worth of new files landed since (code-ref-*, escape-*, outline-keyboard,
// roving-tabindex, same-doc-anchor, toolbar-icons, wiki-chip-a11y on the webview side;
// heading-slug, code-ref-core on the host side; `list-tight.ts` was deleted). The one-line
// reasoning for every reconciled file is in the phase-0 report, not reproduced here as prose —
// see inline comments below for the short version.
//
// IDs are bare basenames (no extension, no directory) keyed against the WHOLE tree — verified
// globally unique across `src/` + `media-src/src/` (187 files, 187 distinct basenames, including
// `diagram-engines/`, `stubs/`; the build-artifact `media/` dir is excluded). Each entry has a
// `dir` (the file's TARGET directory relative to its root) AND a `module` (its identity for
// grouping/cycle-check purposes) — these are DIFFERENT fields, not derived from each other.
//
// Corrected in phase 3 (task 460): the original version derived module identity FROM `dir`,
// which meant nesting a subdirectory under an existing module silently invented a new module.
// `diagrams/engines/`, `diagrams/d2/engines/` and `chrome/stubs/` are directories INSIDE the
// `diagrams`, `diagrams/d2` and `chrome` modules respectively (per the task table's own
// `engines/{...}` shorthand) — not siblings. Left un-split, the phase-3 cycle re-check reported a
// `diagrams <-> diagrams/engines` bidirectional pair that was never real: under the original
// `tmp/modmap3.mjs` grouping (one flat `diagrams` bucket including the engine files),
// `custom-diagrams -> vega` and `vega -> faithful-render` were intra-module edges, invisible to a
// cross-group scan — that's why the original measurement reported 1 pair, not 2. A manifest that
// conflates directory with module identity would have baked that false cycle straight into
// phase 4's boundary meta-test. `moduleDirFor(id)` still answers "where does this file go"; the
// new `moduleIdFor(id)` answers "which module is this file part of" — phase 4 and any cycle check
// must use the latter for grouping, never the manifest object's own keys (those are dir-shaped,
// not module-shaped, by construction — see WEBVIEW_MODULES below).
//
// This file is DATA + assertion tooling, not the codemod. `scripts/codemod-module-move.mjs`
// resolves import targets by scanning the tree (basename -> current absolute path), not by
// walking these tables at rewrite time — see that file's header for why that's the design that
// makes "no-op on an already-correct tree" hold. The manifest's job is (a) this totality/
// disjointness assertion, (b) telling `git mv` where each file goes in phases 1-2, (c) the
// phase-4 boundary meta-test (cycles, allowlist, `shared/` no-sibling-imports).
//
// Run directly (`node scripts/module-manifest.mjs`) to assert the manifest is TOTAL and
// DISJOINT against the tree on disk, wherever files currently sit (pre-move flat, or post-move
// in their module dirs — both are valid states this checks).

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const HOST_ROOT = path.join(ROOT, 'src')
const WEBVIEW_ROOT = path.join(ROOT, 'media-src', 'src')

// ---------------------------------------------------------------------------------------------
// Host `src/` -> 8 modules (46 files: task file's 44 baseline + heading-slug + code-ref-core).
//
// DECIDED (phase-0 review, team-lead): `heading-slug.ts` AND `md-scan.ts` both go in `shared/`.
// `heading-slug` is imported cross-side by `media-src/src/same-doc-anchor.ts` — the criterion for
// `shared/` is "part of the cross-side contract," not "is a leaf," so it qualifies by definition.
// `md-scan` comes with it because `heading-slug` needs it and `md-scan` is itself a true level-0
// leaf (task doc's own measurement), so it cannot violate "`shared/` imports nothing from
// siblings" (phase-4 assertion). `markdown/`'s three remaining files (minimal-diff-writeback,
// outline-tree, table-pipe-escape) now import from `shared/` — the same relationship every other
// module already has to it. The rejected alternative (heading-slug -> markdown/ + a phase-4
// allowlist exception for a webview -> markdown/ cross-side edge) would have put a hole in "the
// webview reaches into src/shared/ and nowhere else" on day one — not worth the one avoided move.
export const HOST_MODULES = {
  shared: {
    dir: 'shared',
    ids: [
      'protocol',
      'message-shape',
      'theme-registry',
      'mermaid-palettes',
      'echarts-theme',
      'echarts-gallery',
      'wiki-core',
      'code-ref-core', // NEW (task 229) — true leaf, only importer is webview code-ref-decorate.ts
      'heading-slug', // NEW (task 243) — see OPEN QUESTION above
      'md-scan', // moved from markdown/ alongside heading-slug, see OPEN QUESTION above
    ],
  },
  markdown: { dir: 'markdown', ids: ['diff-lines', 'table-pipe-escape', 'minimal-diff-writeback', 'outline-tree', 'reading-time'] },
  lute: { dir: 'lute', ids: ['lute-host', 'lute-block-repair', 'lute-gap-repair'] },
  writeback: { dir: 'writeback', ids: ['writeback-controller', 'git-diff', 'git-conflict', 'doc-sync', 'sync-state'] },
  wiki: { dir: 'wiki', ids: ['wiki', 'wiki-cache', 'wiki-session', 'link-target', 'asset-link-actions'] },
  'webview-host': { dir: 'webview-host', ids: ['html-builder', 'webview-message-shape', 'diagram-cache-host', 'panel-config'] },
  platform: {
    dir: 'platform',
    ids: [
      'extension',
      'markdown-editor-provider',
      'commands',
      'status-bar',
      'active-panels',
      'tab-targeting',
      'state-keys',
      'host-log',
      'host-session-state',
      'editor-config',
      'default-mode',
    ],
  },
  session: { dir: 'session', ids: ['editor-session', 'reveal-caret', 'reveal-range'] },
}

// ---------------------------------------------------------------------------------------------
// Webview `media-src/src/` -> the task table's 13 named modules (`diagrams` further splits into
// diagrams/{engines,d2,d2/engines,plantuml,mermaid} sub-dirs; `chrome` gains a `stubs` sub-dir) —
// 141 files: task file's 132 baseline, minus deleted `list-tight`, plus 9 new files reconciled
// against the current tree, plus `stubs/vditor-toolbar-stubs.ts`. `diagram-engines/` is renamed
// `engines/` and nested under `diagrams/` (and `diagrams/d2/` for the d2 engine file) per the
// task table's own `engines/{...}` shorthand.
export const WEBVIEW_MODULES = {
  util: {
    dir: 'util',
    ids: [
      'webview-log',
      'source-map',
      'stream-chunk',
      'debounce',
      'deep-merge',
      'disposables',
      'observe-coalesce',
      'format-timestamp',
      'lang',
      'platform',
      'load-script',
      'utils',
      'types',
      'inner-vditor',
      'roving-tabindex', // NEW (task 456/458) — generic composite-widget primitive; used by
      // outline-keyboard (nav/) today and designed for escape-toolbar (chrome/) too — 2 unrelated
      // domain callers is exactly the util/ criterion (decision #2 in the task file).
    ],
  },
  'diagram-kit': {
    dir: 'diagram-kit',
    ids: [
      'engine-registry',
      'diagram-dom',
      'diagram-error',
      'diagram-loading',
      'diagram-note',
      'diagram-surfaces',
      'diagram-palette',
      'd2-config',
      'native-offscreen',
      'diagram-config-delta',
    ],
  },
  boot: {
    dir: 'boot',
    ids: ['vditor-theme', 'main', 'preload', 'finish-init', 'init-payload', 'vditor-init', 'vditor-options', 'live-config', 'editor-session-state'],
  },
  bridge: { dir: 'bridge', ids: ['message-router', 'vscode-api', 'edit-sync', 'edit-sync-tuning', 'save-flush', 'pending-edit', 'incremental-md'] },
  editing: {
    dir: 'editing',
    ids: [
      'caret',
      'caret-preserve',
      'caret-scroll',
      'editor-caret',
      'initial-caret',
      'focus-restore',
      'gap-paragraph',
      'hr-nav',
      'list-backspace',
      // 'list-tight' DELETED since modmap3.mjs was measured — do not re-add.
      'fix-table-ir',
      'spin-skip-fence',
      'spin-strip',
      'wysiwyg-code-highlight',
      'code-source',
      'edit-activity',
      'mutation-scope',
      'html-comment',
      'table-hotkey',
      'undo-keybind',
      'callouts',
      'callout-nav',
      'preview-morph',
    ],
  },
  clipboard: { dir: 'clipboard', ids: ['clipboard-line', 'paste-transform', 'paste-table', 'image-convert', 'upload-handler', 'upload-name'] },
  links: {
    dir: 'links',
    ids: [
      'link-click',
      'link-click-fix',
      'link-open-policy',
      'link-url',
      'raw-href',
      'wiki-serialize',
      'custom-renderer',
      'code-ref-decorate', // NEW (task 229) — "link cluster" per the task list; clickable code refs
      'code-ref-resolve', // NEW (task 229) — host round-trip for the above, paired 1:1
      'same-doc-anchor', // NEW (task 243) — "link cluster"; same-document #fragment anchor links
      'wiki-chip-a11y', // NEW (task 457) — a11y attr shared by all 3 wiki-chip renderers, all in links/
    ],
  },
  nav: {
    dir: 'nav',
    ids: [
      'outline',
      'outline-resize',
      'heading-align',
      'preview-scroll-preserve',
      'split-scroll-sync',
      'viewport-gate',
      'outline-keyboard', // NEW (task 458) — outline tree keyboard nav, co-located with outline.ts
    ],
  },
  chrome: {
    dir: 'chrome',
    ids: [
      'toolbar',
      'toolbar-actions',
      'toolbar-dismiss',
      'toolbar-scroll-guard',
      'busy-cursor',
      'prerender-overlay',
      'open-preview',
      'responsive-tables',
      'diff-markers',
      'escape-arm', // NEW (task 456) — toolbar-escape state machine, paired with escape-toolbar
      'escape-toolbar', // NEW (task 456) — drives toolbar DOM + roving tabindex
      'toolbar-icons', // NEW (task 470) — extracted out of toolbar.ts, only importer is toolbar.ts
    ],
  },
  diagrams: {
    dir: 'diagrams',
    ids: [
      'diagram-retheme',
      'echarts-retheme',
      'flowchart-retheme',
      'custom-diagrams',
      'diagram-runtime',
      'diagram-zoom',
      'diagram-zoom-gate',
      'render-cache-client',
      'faithful-render',
      'stream-render',
      'abc-fit',
      'echarts-apply',
      'echarts-fit',
      'markmap-fit',
      'graphviz-render',
      'smiles-render',
    ],
  },
  'diagrams/engines': { dir: 'diagrams/engines', ids: ['geojson-topojson', 'nomnoml', 'stl', 'vega', 'wavedrom'] },
  'diagrams/d2': {
    dir: 'diagrams/d2',
    ids: ['d2-entry', 'd2-geometry', 'd2-refine', 'd2-render', 'd2-sketch', 'd2-wasm', 'astar', 'elk-layout', 'elk-entry', 'elk-bundled-shim', 'boot-elk'],
  },
  'diagrams/d2/engines': { dir: 'diagrams/d2/engines', ids: ['d2'] },
  'diagrams/plantuml': { dir: 'diagrams/plantuml', ids: ['plantuml-render', 'plantuml-stdlib', 'plantuml-timing', 'plantuml-retheme'] },
  'diagrams/mermaid': { dir: 'diagrams/mermaid', ids: ['mermaid-elk', 'mermaid-elk-entry', 'mermaid-retheme', 'mermaid-theme'] },
  // stubs/ is redirected to via esbuild-shared.mjs:101's `new URL(...)`, not an import specifier
  // — the codemod's import-rewrite pass will NOT catch that reference; see phase-0 report.
  'chrome/stubs': { dir: 'chrome/stubs', ids: ['vditor-toolbar-stubs'] },
}

// Non-.ts files the task calls out to relocate explicitly rather than leave stranded. Not part
// of the id-based .ts manifest above (checkManifest doesn't scan non-.ts files).
// `media/` (media-src/src/media/) is a BUILD ARTIFACT directory — leave in place, not listed.
export const EXTRA_RELOCATIONS = {
  // only importers are d2-quality.test.ts / d2-theme.test.ts, both moving to diagrams/d2/.
  'media-src/src/__fixtures__/d2-raw-layouts.json': 'media-src/src/diagrams/d2/__fixtures__/d2-raw-layouts.json',
}

// ---------------------------------------------------------------------------------------------

function flatten(modules) {
  const idToDir = new Map()
  const dupes = []
  for (const { dir, ids } of Object.values(modules)) {
    for (const id of ids) {
      if (idToDir.has(id)) dupes.push(id)
      idToDir.set(id, dir)
    }
  }
  return { idToDir, dupes }
}

export function moduleDirFor(id) {
  const { idToDir: hostMap } = flatten(HOST_MODULES)
  if (hostMap.has(id)) return { side: 'host', dir: hostMap.get(id) }
  const { idToDir: webviewMap } = flatten(WEBVIEW_MODULES)
  if (webviewMap.has(id)) return { side: 'webview', dir: webviewMap.get(id) }
  return undefined
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'media') continue // build artifact dir, left in place
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(p)
  }
}

// Assert totality + disjointness against the tree ON DISK, wherever files currently sit.
export function checkManifest({ verbose = true } = {}) {
  let ok = true
  const report = (msg) => {
    if (verbose) console.log(msg)
  }

  for (const [label, modules, rootDir] of [
    ['HOST', HOST_MODULES, HOST_ROOT],
    ['WEBVIEW', WEBVIEW_MODULES, WEBVIEW_ROOT],
  ]) {
    const { idToDir, dupes } = flatten(modules)
    if (dupes.length) {
      ok = false
      report(`[${label}] DUPLICATE ids in manifest: ${dupes.join(', ')}`)
    }

    const onDisk = []
    walk(rootDir, onDisk)
    const diskIds = new Set(onDisk.map((f) => path.basename(f, '.ts')))

    const missingFromManifest = [...diskIds].filter((id) => !idToDir.has(id))
    if (missingFromManifest.length) {
      ok = false
      report(`[${label}] ON DISK but not in manifest: ${missingFromManifest.sort().join(', ')}`)
    }

    const missingFromDisk = [...idToDir.keys()].filter((id) => !diskIds.has(id))
    if (missingFromDisk.length) {
      ok = false
      report(`[${label}] in manifest but MISSING from disk: ${missingFromDisk.sort().join(', ')}`)
    }

    report(
      `[${label}] modules=${Object.keys(modules).length} manifestIds=${idToDir.size} onDisk=${onDisk.length}` +
        ` ok=${!dupes.length && !missingFromManifest.length && !missingFromDisk.length}`,
    )
  }

  // Global uniqueness: no basename may appear on both sides (the codemod's target-resolution
  // relies on this — see codemod-module-move.mjs header).
  const { idToDir: hostIds } = flatten(HOST_MODULES)
  const { idToDir: webviewIds } = flatten(WEBVIEW_MODULES)
  const crossCollisions = [...hostIds.keys()].filter((id) => webviewIds.has(id))
  if (crossCollisions.length) {
    ok = false
    report(`CROSS-TREE basename collisions (host vs webview): ${crossCollisions.join(', ')}`)
  }

  return ok
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ok = checkManifest()
  if (!ok) {
    console.error('\nmodule-manifest: FAILED — not total/disjoint against the tree on disk.')
    process.exit(1)
  }
  console.log('\nmodule-manifest: OK — total and disjoint.')
}
