#!/usr/bin/env node
// Task 460 — resolve-then-rewrite codemod for the module decomposition's import fixups (phases
// 1-2; the `git mv` itself is a separate, manual step per the commit-discipline rules).
//
// Usage:
//   node scripts/codemod-module-move.mjs --dry-run     # report every rewrite, write nothing
//   node scripts/codemod-module-move.mjs                # apply rewrites in place
//
// WHY THIS DOESN'T WALK THE MANIFEST TO COMPUTE TARGETS (read before changing the algorithm):
//
// A naive "map old path -> new path via the manifest, string-replace" breaks on depth changes —
// `media-src/src/d2-render.ts` -> `media-src/src/diagrams/d2/d2-render.ts` turns
// `../../src/protocol` into `../../../../src/shared/protocol`, and that recomputation has to
// happen from BOTH the importer's and the target's *actual* new locations, which the manifest
// alone doesn't give you (it gives module membership, not "has this specific file been
// git-mv'd yet in this phase").
//
// Instead this resolves against the tree AS IT ACTUALLY IS ON DISK, right now, in two steps:
//
//   1. Try the specifier literally: resolve it against the importing file's CURRENT directory.
//      If a file exists there, the specifier is already correct — skip it. This is what makes a
//      correct tree (including the current, wholly-unmoved tree, which compiles today by
//      definition) a no-op: every specifier already resolves.
//   2. If literal resolution fails (ENOENT — this is what "git mv, don't fix imports yet" in
//      commit (1) of each phase produces), the specifier is stale. Take its FINAL path segment
//      as the target's basename (module id) — this survives depth corruption even when the
//      leading `../` count is now wrong — and look that id up in a fresh index built by walking
//      `src/` and `media-src/src/` AS THEY ARE RIGHT NOW. That index reflects truth regardless
//      of how many files have moved in this run. Recompute the relative specifier from the
//      importer's CURRENT directory to the indexed target's CURRENT location.
//
// This is safe because every `.ts` basename under `src/` + `media-src/src/` is globally unique
// (187 files, 187 distinct basenames — verified by `scripts/module-manifest.mjs`, which this
// script does NOT import: the manifest tells `git mv` where files go, this script only cares
// where they currently ARE). Re-running is idempotent for the same reason step 1 makes the
// original tree a no-op: once a specifier is correct, it stays correct.
//
// Specifier forms covered: `import ... from '...'` / `export ... from '...'` (re-exports use the
// same `from '...'` syntax, one regex for both), `vi.mock(...)`, dynamic `import(...)`,
// `require(...)`, and bare side-effect `import '...'` (no `from` — CSS imports and
// `import '../src/preload'`-style harness bootstraps; missed on the first pass of this codemod
// because the `from`-regex requires the literal word "from", which a bare import never has —
// caught when `node build.mjs` still failed after phase 2's first apply. 34 occurrences: mostly
// `media-src/e2e/*-harness.ts`'s `import '../src/preload'`).
//
// Scope: every `.ts` file (including co-located `.test.ts`) under `src/`, `media-src/src/`,
// `media-src/e2e/`, `test/backend/`. `test/vscode-e2e/` is verified to have zero relative
// imports into either tree (it drives the extension via `extensionDevelopmentPath`, not module
// imports) and is excluded.
//
// NOT covered (by design, not oversight — see the task's "string-path inventory" section):
// `package.json` `main`, `media-src/build.mjs` entryPoints + the `elk-bundled-shim.ts` `new
// URL(...)`, `esbuild-shared.mjs`'s `new URL('./src/stubs/vditor-toolbar-stubs.ts', ...)`,
// `test/vitest.config.mts` coverage.exclude, `scripts/check-coverage-modules.mjs`'s 27 hardcoded
// paths. Those are string literals with no import semantics for a resolver to hook into — fix
// them by hand, one edit each, in the same commit as the corresponding move.

import fs from 'node:fs'
import path from 'node:path'

// --root=<path> overrides the repo root — lets this run against a disposable scratch tree
// (proving the post-move repair works, phase-0 verification) without touching real repo files.
// Not needed for normal use.
const rootArg = process.argv.find((a) => a.startsWith('--root='))
const ROOT = rootArg ? path.resolve(rootArg.slice('--root='.length)) : path.resolve(import.meta.dirname, '..')
const TARGET_ROOTS = [path.join(ROOT, 'src'), path.join(ROOT, 'media-src', 'src')]

// --importers=<comma-separated repo-relative dirs> scopes which trees get their specifiers
// rewritten, independent of TARGET_ROOTS (target resolution always considers both trees, so
// cross-side references still resolve correctly — only which *importers* get edited is scoped).
// Phase 1 (host-only move) uses this to rewrite `src/` + `test/backend/` but deliberately leave
// `media-src/src/` and `media-src/e2e/` untouched — the task's own phase boundary: webview-side
// cross-imports are expected to still read `../../src/<m>` at the end of phase 1 (`node
// build.mjs` is red on purpose until phase 2 gives them their final depth). Without this flag,
// the resolve-then-rewrite design would happily fix those cross-side imports *now* (it doesn't
// need the webview file to have moved to compute a correct depth) — which is fine, but it isn't
// what phase 1 asked for, so it's opt-in via this flag rather than the default.
const importersArg = process.argv.find((a) => a.startsWith('--importers='))
const IMPORTER_ROOTS = importersArg
  ? importersArg
      .slice('--importers='.length)
      .split(',')
      .map((rel) => path.join(ROOT, ...rel.split('/')))
  : [path.join(ROOT, 'src'), path.join(ROOT, 'media-src', 'src'), path.join(ROOT, 'media-src', 'e2e'), path.join(ROOT, 'test', 'backend')]

const dryRun = process.argv.includes('--dry-run')

function walkTs(dir, out, { includeTests }) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'media') continue // build artifact dir under media-src/src/, not source
    if (entry.name === 'node_modules') continue
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walkTs(p, out, { includeTests })
    else if (entry.name.endsWith('.test.ts')) {
      if (includeTests) out.push(p)
    } else if (entry.name.endsWith('.ts')) out.push(p)
  }
}

// Fresh index of every TARGET file (non-test .ts under src/ + media-src/src/), rebuilt on every
// invocation so it always reflects the tree as it is RIGHT NOW — see header.
function buildTargetIndex() {
  const files = []
  for (const root of TARGET_ROOTS) walkTs(root, files, { includeTests: false })
  const index = new Map() // basename (no ext) -> absolute path (no ext)
  const dupes = []
  for (const f of files) {
    const id = path.basename(f, '.ts')
    const noExt = f.slice(0, -3)
    if (index.has(id)) dupes.push(id)
    index.set(id, noExt)
  }
  if (dupes.length) {
    throw new Error(`codemod: duplicate basenames make target resolution ambiguous: ${dupes.join(', ')}`)
  }
  return index
}

function literalResolveExists(importerDir, specifier) {
  const candidate = path.resolve(importerDir, specifier)
  // TS import specifiers usually omit the extension; asset imports (json/css) include it. Must
  // be a FILE — a bare module id can now collide with a same-named MODULE DIRECTORY post-move
  // (e.g. '../../src/wiki' used to resolve to wiki.ts; after the move src/wiki/ is the `wiki/`
  // module dir containing wiki.ts, wiki-cache.ts, ... — existsSync('src/wiki') is true for the
  // directory too, which would wrongly read as "already correct" for a specifier that Node/TS
  // can no longer actually resolve there (no index.ts)).
  for (const ext of ['', '.ts', '.tsx']) {
    const p = candidate + ext
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return true
  }
  return false
}

function targetIdFromSpecifier(specifier) {
  const segs = specifier.split('/').filter(Boolean)
  let last = segs[segs.length - 1] || ''
  last = last.replace(/\.tsx?$/, '')
  return last
}

// Fallback for specifiers pointing OUTSIDE src/ + media-src/src/ entirely (vendor assets like
// `../vendor/elk/elk-api.js` — .js/.mjs, not tracked in the basename index at all) whose
// importer moved. Depth-corrupted the same way a tracked specifier would, but there's no id to
// look up. Instead: strip the leading run of `../`/`./` segments, then try re-attaching the
// SAME remainder path at increasing (then decreasing) `../` counts from the importer's current
// dir until one resolves to a real file. Bounded search, and only accepted if exactly one depth
// in range resolves — an ambiguous match (two different depths both resolving) is left
// unresolved rather than guessed.
function findByDepthAdjustment(importerDir, specifier) {
  const m = /^(\.\.?\/)*(.*)$/.exec(specifier)
  const remainder = m ? m[2] : specifier
  if (!remainder) return undefined
  const candidates = []
  for (let up = 0; up <= 6; up++) {
    const prefix = up === 0 ? './' : '../'.repeat(up)
    const candidateSpecifier = prefix + remainder
    const abs = path.resolve(importerDir, candidateSpecifier)
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) candidates.push(candidateSpecifier)
  }
  if (candidates.length === 1) return candidates[0]
  return undefined
}

function toSpecifier(fromDir, toNoExt) {
  let rel = path.relative(fromDir, toNoExt).split(path.sep).join('/')
  if (!rel.startsWith('.')) rel = `./${rel}`
  return rel
}

// Match all four "non-literal-`from`-only" additions plus `from '...'` itself, with capture-
// group indices (the `d` flag) so replacements can be applied by offset without re-scanning.
const PATTERNS = [
  { name: 'from', re: /\bfrom\s+(['"])(\.[^'"]+)\1/gd },
  { name: 'vi.mock', re: /\bvi\.mock\(\s*(['"])(\.[^'"]+)\1/gd },
  { name: 'import()', re: /\bimport\(\s*(['"])(\.[^'"]+)\1/gd },
  { name: 'require()', re: /\brequire\(\s*(['"])(\.[^'"]+)\1/gd },
  // Bare side-effect import: `import '...'` with nothing between `import` and the quote (no
  // `{`, no `* as x`, no `type`, no `(` — those are the four forms above). CSS imports and
  // harness bootstraps (`import '../src/preload'`) use this form.
  { name: 'bare import', re: /\bimport\s+(['"])(\.[^'"]+)\1/gd },
]

function processFile(file, index, stats) {
  const src = fs.readFileSync(file, 'utf8')
  const importerDir = path.dirname(file)
  const edits = [] // { start, end, text, form, oldSpecifier, newSpecifier }
  const unresolved = []

  for (const { name, re } of PATTERNS) {
    for (const m of src.matchAll(re)) {
      const specifier = m[2]
      const [start, end] = m.indices[2]
      if (literalResolveExists(importerDir, specifier)) continue // already correct — no-op

      const id = targetIdFromSpecifier(specifier)
      const targetNoExt = index.get(id)
      let newSpecifier
      if (targetNoExt) {
        newSpecifier = toSpecifier(importerDir, targetNoExt)
      } else {
        // Not a tracked .ts module (e.g. a vendor .js/.mjs asset) — try the depth-adjustment
        // fallback before giving up. See findByDepthAdjustment's header comment.
        newSpecifier = findByDepthAdjustment(importerDir, specifier)
        if (!newSpecifier) {
          unresolved.push({ form: name, specifier })
          continue
        }
      }
      if (newSpecifier === specifier) continue // defensive — shouldn't happen given the check above
      edits.push({ start, end, text: newSpecifier, form: name, oldSpecifier: specifier, newSpecifier })
    }
  }

  if (unresolved.length) {
    stats.unresolved.push({ file: path.relative(ROOT, file), refs: unresolved })
  }
  if (!edits.length) return

  edits.sort((a, b) => b.start - a.start) // apply back-to-front so offsets stay valid
  let out = src
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end)

  stats.filesChanged++
  stats.rewrites.push({
    file: path.relative(ROOT, file),
    edits: edits
      .slice()
      .sort((a, b) => a.start - b.start)
      .map((e) => ({ form: e.form, from: e.oldSpecifier, to: e.newSpecifier })),
  })
  for (const e of edits) stats.byForm[e.form] = (stats.byForm[e.form] || 0) + 1

  if (!dryRun) fs.writeFileSync(file, out, 'utf8')
}

function main() {
  const index = buildTargetIndex()

  const importers = []
  for (const root of IMPORTER_ROOTS) walkTs(root, importers, { includeTests: true })

  const stats = { filesChanged: 0, rewrites: [], unresolved: [], byForm: {} }
  for (const file of importers) processFile(file, index, stats)

  console.log(`codemod-module-move: ${dryRun ? 'DRY RUN' : 'APPLY'}`)
  console.log(`  importer files scanned: ${importers.length}`)
  console.log(`  target index size: ${index.size}`)
  console.log(`  files needing rewrite: ${stats.filesChanged}`)
  console.log(`  rewrites by form: ${JSON.stringify(stats.byForm)}`)

  if (stats.filesChanged) {
    console.log('\n--- rewrites ---')
    for (const r of stats.rewrites) {
      console.log(`${r.file}:`)
      for (const e of r.edits) console.log(`  [${e.form}] '${e.from}' -> '${e.to}'`)
    }
  }

  if (stats.unresolved.length) {
    console.log('\n--- UNRESOLVED (left untouched — investigate; may be legitimate non-module specifiers) ---')
    for (const u of stats.unresolved) {
      console.log(`${u.file}:`)
      for (const r of u.refs) console.log(`  [${r.form}] '${r.specifier}'`)
    }
  }

  if (stats.filesChanged === 0 && stats.unresolved.length === 0) {
    console.log('\ncodemod-module-move: no-op — every specifier already resolves.')
  }
}

main()
