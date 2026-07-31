#!/usr/bin/env node
/*
 * fetch-markmap — pin & vendor the combined markmap offline bundle (task 95 / 471).
 *
 * markmap.min.js is a concatenation of THREE parts, each with its own wrapper, merging onto
 * `window.markmap`:
 *   1. `var d3=(…);` — a hand-tree-shaken subset of d3 (only the exports markmap-view actually
 *      calls: linkHorizontal, max, min, minIndex, scaleOrdinal, schemeCategory10, select, zoom,
 *      zoomIdentity, zoomTransform), esbuild-bundled from the `d3` npm package. d3's full UMD is
 *      ~278KB; this subset is ~54KB.
 *   2. markmap-lib's own published browser build (`dist/browser/index.iife.js`), fetched from
 *      unpkg verbatim — byte-identical, not rebuilt.
 *   3. markmap-view's own published browser build (`dist/browser/index.js`), fetched from unpkg
 *      verbatim — byte-identical, not rebuilt.
 * Parts are joined with the literal separator `\n;\n` (matches how the original was assembled).
 *
 * No fetch script existed for this until task 471 (2026-08-01) reverse-engineered the recipe
 * above. Parts 2 and 3 were verified byte-for-byte (sha256-identical substrings) against the
 * bundle vendored in dfbd952 (task 95). Part 1 (the d3 subset) reproduces the same tree-shaken
 * export set with the same esbuild bundling technique but is NOT byte-identical — the minified
 * internal variable names differ, most likely because the original bundle was built with a
 * different esbuild version than the one currently pinned (media-src/package.json's `esbuild`).
 * Documented as accepted drift in tasks/471; the combined output is NOT re-vendored by default —
 * see the `--write` flag below.
 *
 * markmap-lib and markmap-view are NOT media-src devDependencies (task 481 removed them as
 * genuinely unused at the source level) — this script fetches their prebuilt browser dists from
 * the network instead, same as fetch-mermaid.mjs. `d3` stays a devDependency (task 481 pinned it
 * explicitly after discovering the vendored mermaid-layout-elk chunk needs it transitively); this
 * script reuses that same installed copy for part 1 rather than declaring a second d3 dependency.
 *
 * Usage:
 *   node media-src/scripts/fetch-markmap.mjs <version> [--write]
 *     <version>  the shared markmap-lib/markmap-view version, e.g. 0.18.12
 *     --write    write into media-src/vendor/markmap/ even if part 1 doesn't hash-match the
 *                currently vendored bytes (without it, a hash mismatch on part 1 alone is logged
 *                and the script exits non-zero without touching vendor/ — see the drift note above)
 *
 * Writes media-src/vendor/markmap/{markmap.min.js,LICENSE,source.json}.
 */
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const MEDIA_SRC_DIR = path.resolve(SCRIPT_DIR, '..')
const VENDOR_DIR = path.join(MEDIA_SRC_DIR, 'vendor/markmap')
const JOIN = '\n;\n'

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

// Exact export set + order markmap-view calls off the `d3` global (verified against the currently
// vendored bundle) — reordering these changes the minified bytes, same caveat as fetch-three.mjs.
const D3_ENTRY = `export {
  linkHorizontal,
  max,
  min,
  minIndex,
  scaleOrdinal,
  schemeCategory10,
  select,
  zoom,
  zoomIdentity,
  zoomTransform,
} from 'd3'
`

async function getBuf(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'vmarkd-fetch-markmap' } })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${res.statusText}`)
  return Buffer.from(await res.arrayBuffer())
}

async function main() {
  const args = process.argv.slice(2)
  const write = args.includes('--write')
  const version = args.find((a) => !a.startsWith('--'))
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(
      'Usage: node media-src/scripts/fetch-markmap.mjs <version> [--write]  (e.g. 0.18.12)',
    )
    process.exit(1)
  }

  const d3Pkg = JSON.parse(
    await fs.readFile(path.join(MEDIA_SRC_DIR, 'node_modules/d3/package.json'), 'utf8'),
  )

  const d3Result = await esbuild.build({
    stdin: { contents: D3_ENTRY, resolveDir: MEDIA_SRC_DIR, loader: 'js' },
    bundle: true,
    minify: true,
    format: 'iife',
    globalName: 'd3',
    platform: 'browser',
    write: false,
  })
  const d3Js = Buffer.from(d3Result.outputFiles[0].contents)

  const libUrl = `https://unpkg.com/markmap-lib@${version}/dist/browser/index.iife.js`
  const viewUrl = `https://unpkg.com/markmap-view@${version}/dist/browser/index.js`
  const libJs = await getBuf(libUrl)
  const viewJs = await getBuf(viewUrl)

  const existingPath = path.join(VENDOR_DIR, 'markmap.min.js')
  let existing
  try {
    existing = await fs.readFile(existingPath)
  } catch {
    existing = null
  }
  if (existing) {
    const existingText = existing.toString('utf8')
    const libStr = libJs.toString('utf8').trim()
    const viewStr = viewJs.toString('utf8').trim()
    const libMatches = existingText.includes(libStr)
    const viewMatches = existingText.includes(viewStr)
    console.log(
      `[fetch-markmap] markmap-lib browser build byte-identical to vendored: ${libMatches}`,
    )
    console.log(
      `[fetch-markmap] markmap-view browser build byte-identical to vendored: ${viewMatches}`,
    )
    const expectedD3 = existingText.slice(0, existingText.indexOf(libStr) - JOIN.length)
    const d3Matches = expectedD3 === d3Js.toString('utf8')
    console.log(`[fetch-markmap] d3 subset byte-identical to vendored: ${d3Matches}`)
    if (!d3Matches) {
      console.log(
        '[fetch-markmap] DRIFT (expected, documented in tasks/471): the d3 subset reproduces the ' +
          'same tree-shaken exports via the same esbuild technique, but minified internal names ' +
          'differ (likely esbuild-version drift). Pass --write to re-vendor anyway.',
      )
      if (!write) {
        console.log('[fetch-markmap] not writing vendor/ (pass --write to override). Exiting 1.')
        process.exit(1)
      }
    }
  }

  const combined = Buffer.concat([
    d3Js,
    Buffer.from(JOIN),
    libJs.subarray(0, libJs.toString('utf8').trimEnd().length),
    Buffer.from(JOIN),
    viewJs.subarray(0, viewJs.toString('utf8').trimEnd().length),
    Buffer.from('\n'),
  ])
  if (!combined.toString('utf8').includes('window.markmap')) {
    throw new Error('combined bundle does not reference window.markmap — assembly broke.')
  }

  const markmapLic = await getBuf(`https://unpkg.com/markmap-lib@${version}/LICENSE`)
  const d3Lic = await getBuf(`https://unpkg.com/d3@${d3Pkg.version}/LICENSE`)
  const license =
    'markmap-lib, markmap-view — MIT License\n' +
    'Copyright (c) 2020 Gerald\n' +
    'https://github.com/markmap/markmap\n\n' +
    `d3 (subset) — ISC License\n` +
    'Copyright 2010-2023 Mike Bostock\n' +
    'https://github.com/d3/d3\n\n' +
    '---\n\n' +
    markmapLic.toString('utf8').trim() +
    '\n\n---\n\n' +
    d3Lic.toString('utf8').trim() +
    '\n'

  await fs.mkdir(VENDOR_DIR, { recursive: true })
  await fs.writeFile(existingPath, combined)
  await fs.writeFile(path.join(VENDOR_DIR, 'LICENSE'), license)
  const source = {
    version,
    description: `Combined offline bundle: d3 ${d3Pkg.version} (tree-shaken subset) + markmap-lib ${version} (browser IIFE) + markmap-view ${version} (browser UMD). Concatenated — each part uses its own UMD wrapper, merging onto window.markmap.`,
    origin: {
      d3: 'https://github.com/d3/d3 (ISC)',
      'markmap-lib': 'https://github.com/markmap/markmap (MIT)',
      'markmap-view': 'https://github.com/markmap/markmap (MIT)',
    },
    files: {
      'markmap.min.js': { sha256: sha256(combined) },
    },
  }
  await fs.writeFile(
    path.join(VENDOR_DIR, 'source.json'),
    `${JSON.stringify(source, null, 2)}\n`,
  )
  console.log(
    `[fetch-markmap] pinned v${version} (sha256 ${source.files['markmap.min.js'].sha256.slice(0, 12)}…)`,
  )
  console.log('Remember to update tasks/95 + CHANGELOG if the bundle changed.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
