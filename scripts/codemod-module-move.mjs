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
// Five specifier forms are covered (measured: 93 `vi.mock(...)`, 34 dynamic `import(...)`,
// 2 `require(...)`, plus every `import ... from '...'` / `export ... from '...'` — re-exports
// use the same `from '...'` syntax as imports, so one regex covers both of those two forms).
//
// Scope: every `.ts` file (including co-located `.test.ts`) under `src/`, `media-src/src/`,
// `media-src/e2e/`, `test/backend/`. `test/vscode-e2e/` is verified to have zero relative
// imports into either tree (it drives the extension via `extensionDevelopmentPath`, not module
// imports) and is excluded.
//
// NOT covered (by design, not oversight — see the task's "string-path inventory" section):
// `package.json` `main`, `media-src/build.mjs` entryPoints + the `elk-bundled-shim.ts` `new
// URL(...)`, `esbuild-shared.mjs`'s `new URL('./src/stubs/vditor-toolbar-stubs.ts', ...)`,
// `test/vitest.config.ts` coverage.exclude, `scripts/check-coverage-modules.mjs`'s 27 hardcoded
// paths. Those are string literals with no import semantics for a resolver to hook into — fix
// them by hand, one edit each, in the same commit as the corresponding move.

import fs from 'node:fs'
import path from 'node:path'

// --root=<path> overrides the repo root — used by scripts/codemod-module-move.selftest.mjs to
// run the real algorithm against a disposable scratch tree (proving the post-move repair works)
// without touching this repo's actual files. Not needed for normal use.
const rootArg = process.argv.find((a) => a.startsWith('--root='))
const ROOT = rootArg ? path.resolve(rootArg.slice('--root='.length)) : path.resolve(import.meta.dirname, '..')
const TARGET_ROOTS = [path.join(ROOT, 'src'), path.join(ROOT, 'media-src', 'src')]
const IMPORTER_ROOTS = [
  path.join(ROOT, 'src'),
  path.join(ROOT, 'media-src', 'src'),
  path.join(ROOT, 'media-src', 'e2e'),
  path.join(ROOT, 'test', 'backend'),
]

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
  // TS import specifiers usually omit the extension; asset imports (json/css) include it.
  for (const ext of ['', '.ts', '.tsx']) {
    if (fs.existsSync(candidate + ext)) return true
  }
  return false
}

function targetIdFromSpecifier(specifier) {
  const segs = specifier.split('/').filter(Boolean)
  let last = segs[segs.length - 1] || ''
  last = last.replace(/\.tsx?$/, '')
  return last
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
      if (!targetNoExt) {
        unresolved.push({ form: name, specifier })
        continue
      }
      const newSpecifier = toSpecifier(importerDir, targetNoExt)
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
