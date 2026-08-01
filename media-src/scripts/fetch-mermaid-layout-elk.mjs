#!/usr/bin/env node
/*
 * fetch-mermaid-layout-elk — pin & vendor @mermaid-js/layout-elk at an explicit version (task 112).
 *
 * This is the official mermaid ELK layout adapter. Unlike mermaid itself (a single global UMD build we
 * vendor as one mermaid.min.js), layout-elk is a multi-file ESM package meant to be BUNDLED — we
 * esbuild it into media/vditor/dist/js/mermaid-layout-elk/mermaid-elk-main.js via mermaid-elk-entry.ts
 * (media-src/build.mjs mermaidElkOptions). Its only two bare imports are `d3` (resolved from
 * node_modules, tree-shaken to curveLinear) and `elkjs/lib/elk.bundled.js` — the latter ALIASED to
 * src/elk-bundled-shim.ts so it reuses our ONE shared main-thread elkjs (window.__vmarkdElk, booted by
 * elk-main.js) instead of vendoring a second ~1.5 MB elkjs + spawning a webview-hostile blob worker.
 *
 * We copy only the `.mjs` that the entry (mermaid-layout-elk.core.mjs) reaches — the core file plus its
 * `chunks/mermaid-layout-elk.core/*.mjs` (a helper chunk + the lazy render chunk). The chunk filenames
 * are content-hashed by the upstream build, so a re-pin regenerates source.json's files map.
 *
 * Usage:
 *   node media-src/scripts/fetch-mermaid-layout-elk.mjs <version>   e.g. 0.2.2
 *
 * Writes media-src/vendor/mermaid-layout-elk/{mermaid-layout-elk.core.mjs, chunks/…, LICENSE,
 * source.json}. build.mjs (syncVendored, via vendored-assets.mjs) sha-verifies every listed file and
 * ships the LICENSE next to the generated bundle.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG = '@mermaid-js/layout-elk'
const VENDOR_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../vendor/mermaid-layout-elk',
)
const CHUNK_SUBDIR = path.join('chunks', 'mermaid-layout-elk.core')

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

async function main() {
  const version = process.argv[2]
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(
      'Usage: node media-src/scripts/fetch-mermaid-layout-elk.mjs <version>  (e.g. 0.2.2)',
    )
    process.exit(1)
  }

  // npm pack the exact version into a throwaway dir, then extract it.
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'vmarkd-layout-elk-'))
  const tgzName = execFileSync(
    'npm',
    ['pack', `${PKG}@${version}`, '--pack-destination', tmp, '--silent'],
    { encoding: 'utf8' },
  ).trim()
  execFileSync('tar', ['xzf', tgzName, '-C', tmp], { cwd: tmp })
  const dist = path.join(tmp, 'package', 'dist')

  // The entry file (stable name) + every .mjs in its chunks dir (content-hashed names). We ship no
  // .map/.d.ts — only the runtime .mjs esbuild follows from the entry.
  const chunkDir = path.join(dist, CHUNK_SUBDIR)
  const chunkFiles = (await fs.readdir(chunkDir)).filter((f) => f.endsWith('.mjs'))
  const toCopy = [
    { rel: 'mermaid-layout-elk.core.mjs', abs: path.join(dist, 'mermaid-layout-elk.core.mjs') },
    ...chunkFiles.map((f) => ({
      rel: path.join(CHUNK_SUBDIR, f),
      abs: path.join(chunkDir, f),
    })),
  ]

  // Fresh vendor dir (drop any stale content-hashed chunk from a previous pin).
  await fs.rm(VENDOR_DIR, { recursive: true, force: true })
  await fs.mkdir(path.join(VENDOR_DIR, CHUNK_SUBDIR), { recursive: true })

  const files = {}
  for (const { rel, abs } of toCopy) {
    const buf = await fs.readFile(abs)
    await fs.writeFile(path.join(VENDOR_DIR, rel), buf)
    // Normalise Windows-style separators so the sha map key matches syncVendored's path.join lookup.
    files[rel.split(path.sep).join('/')] = { sha256: sha256(buf) }
  }

  await fs.copyFile(
    path.join(tmp, 'package', 'LICENSE'),
    path.join(VENDOR_DIR, 'LICENSE'),
  )

  const source = {
    package: PKG,
    version,
    fetchedFrom: `npm pack ${PKG}@${version}`,
    license: 'MIT',
    files,
    note: 'Official mermaid ELK layout adapter (task 112). esbuild-bundled into media/vditor/dist/js/mermaid-layout-elk/mermaid-elk-main.js via mermaid-elk-entry.ts; its `elkjs/lib/elk.bundled.js` import is aliased to src/elk-bundled-shim.ts so it reuses the ONE shared main-thread elkjs (window.__vmarkdElk). Re-pin with: node media-src/scripts/fetch-mermaid-layout-elk.mjs <version>.',
  }
  await fs.writeFile(
    path.join(VENDOR_DIR, 'source.json'),
    `${JSON.stringify(source, null, 2)}\n`,
  )

  await fs.rm(tmp, { recursive: true, force: true })
  console.log(
    `[fetch-mermaid-layout-elk] pinned ${PKG}@${version} — ${Object.keys(files).length} .mjs files`,
  )
  console.log('Remember to add a LICENSE/NOTICE + update tasks/112 + CHANGELOG.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
