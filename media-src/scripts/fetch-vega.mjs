#!/usr/bin/env node
/*
 * fetch-vega — pin & vendor the combined vega-embed + vega + vega-lite bundle (task 102 / 471).
 *
 * The stock `vega-embed` UMD published to unpkg (build/vega-embed.min.js, ~60KB) treats vega and
 * vega-lite as external peer globals — it does NOT bundle them, so it can't stand alone offline.
 * Our vendored vega-embed.min.js (~805KB) is OUR OWN combined bundle: `import embed from
 * 'vega-embed'` esbuild-bundled with vega + vega-lite pulled in transitively, so one <script> tag
 * gets a fully offline-capable window.vegaEmbed. No fetch script existed for this until task 471
 * (2026-08-01) reverse-engineered the recipe below and verified it byte-for-byte (sha256-identical)
 * against the bundle vendored in c25a098 (task 102) — so `vega`/`vega-embed`/`vega-lite` staying
 * devDependencies is confirmed load-bearing, not dead weight.
 *
 * This script does NOT hit the network: it bundles from whatever `vega-embed` (+ its `vega` /
 * `vega-lite` peers) is already installed as a media-src devDependency, so the installed versions
 * ARE the vendored versions. To bump: update the three devDependencies in media-src/package.json,
 * `npm install`, then re-run this script with the new vega-embed version.
 *
 * Usage:
 *   node media-src/scripts/fetch-vega.mjs <vega-embed-version>   e.g. 7.1.0
 *
 * Writes media-src/vendor/vega/{vega-embed.min.js,LICENSE,source.json}.
 */
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const MEDIA_SRC_DIR = path.resolve(SCRIPT_DIR, '..')
const VENDOR_DIR = path.join(MEDIA_SRC_DIR, 'vendor/vega')

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

const ENTRY = `import embed from 'vega-embed'
window.vegaEmbed = embed
`

async function installedVersion(pkgName) {
  const pkgPath = path.join(MEDIA_SRC_DIR, 'node_modules', pkgName, 'package.json')
  return JSON.parse(await fs.readFile(pkgPath, 'utf8')).version
}

async function main() {
  const version = process.argv[2]
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error('Usage: node media-src/scripts/fetch-vega.mjs <vega-embed-version>  (e.g. 7.1.0)')
    process.exit(1)
  }

  const embedVersion = await installedVersion('vega-embed')
  if (embedVersion !== version) {
    throw new Error(
      `node_modules/vega-embed is ${embedVersion}, not the requested ${version} — this script ` +
        `bundles from node_modules, it does not fetch from the network. Bump the "vega-embed" ` +
        `devDependency in media-src/package.json and \`npm install\` first.`,
    )
  }
  const vegaVersion = await installedVersion('vega')
  const vegaLiteVersion = await installedVersion('vega-lite')

  // vega-embed's own LICENSE only names itself; append the copyright lines for the two peers
  // bundled in (vega, vega-lite) so the vendored LICENSE covers everything actually shipped.
  const firstLine = async (pkgName) => {
    const text = await fs.readFile(
      path.join(MEDIA_SRC_DIR, 'node_modules', pkgName, 'LICENSE'),
      'utf8',
    )
    return text.split('\n')[0]
  }
  const vegaCopyright = await firstLine('vega')
  const vegaLiteCopyright = await firstLine('vega-lite')

  const result = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: MEDIA_SRC_DIR, loader: 'js' },
    bundle: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    write: false,
  })
  const js = Buffer.from(result.outputFiles[0].contents)
  if (!js.toString('utf8').includes('vegaEmbed')) {
    throw new Error('bundled output does not expose window.vegaEmbed — bundling broke.')
  }

  const embedLic = (
    await fs.readFile(path.join(MEDIA_SRC_DIR, 'node_modules/vega-embed/LICENSE'), 'utf8')
  ).trimEnd()
  const lic = `${embedLic}\n\n---\nvega: ${vegaCopyright}\nvega-lite: ${vegaLiteCopyright}\n`

  await fs.mkdir(VENDOR_DIR, { recursive: true })
  await fs.writeFile(path.join(VENDOR_DIR, 'vega-embed.min.js'), js)
  await fs.writeFile(path.join(VENDOR_DIR, 'LICENSE'), lic)
  const source = {
    version,
    description: `vega-embed + vega ${vegaVersion} + vega-lite ${vegaLiteVersion} — declarative data-viz (BSD-3-Clause)`,
    origin: 'https://github.com/vega/vega-embed',
    files: {
      'vega-embed.min.js': { sha256: sha256(js) },
    },
  }
  await fs.writeFile(
    path.join(VENDOR_DIR, 'source.json'),
    `${JSON.stringify(source, null, 4)}\n`,
  )
  console.log(
    `[fetch-vega] pinned vega-embed@${version} (vega ${vegaVersion}, vega-lite ${vegaLiteVersion}; sha256 ${source.files['vega-embed.min.js'].sha256.slice(0, 12)}…)`,
  )
  console.log('Remember to update tasks/102 + CHANGELOG if the bundle changed.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
