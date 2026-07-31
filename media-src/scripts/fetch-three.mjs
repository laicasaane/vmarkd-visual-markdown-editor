#!/usr/bin/env node
/*
 * fetch-three — pin & vendor the tree-shaken three.js STL viewer bundle (task 100 / 471).
 *
 * Unlike mermaid/echarts (a single pre-built UMD fetched from unpkg), three.js ships no
 * "STL viewer" build — three-stl.min.js is OUR OWN tree-shaken subset (Scene/Camera/Renderer +
 * STLLoader + OrbitControls only, ~529KB vs. the full library) esbuild-bundled from the `three`
 * npm package's ESM source and its examples/jsm/ modules. No fetch script existed for this until
 * task 471 (2026-08-01) reverse-engineered the recipe below and verified it byte-for-byte
 * (sha256-identical) against the bundle vendored in dfbd952 (task 100) — so `three` staying a
 * devDependency is confirmed load-bearing, not dead weight.
 *
 * This script does NOT hit the network: it bundles from whatever `three` is already installed as
 * a media-src devDependency, so the installed version IS the vendored version. To bump: update
 * `three` in media-src/package.json, `npm install`, then re-run this script with the new version.
 *
 * Usage:
 *   node media-src/scripts/fetch-three.mjs <version>   e.g. 0.184.0
 *
 * Writes media-src/vendor/threejs/{three-stl.min.js,LICENSE,source.json}.
 */
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const MEDIA_SRC_DIR = path.resolve(SCRIPT_DIR, '..')
const VENDOR_DIR = path.join(MEDIA_SRC_DIR, 'vendor/threejs')

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

// The exact API surface stl.ts's `window.__threeSTL` consumes (see initStlViewer in
// src/diagrams/engines/stl.ts). Key ORDER in both the import list and the object literal is
// preserved verbatim from the reverse-engineered original — esbuild's minifier assigns short
// names in declaration order, so reordering these silently changes the emitted bytes (and would
// break the sha256 match this script was written to prove).
const ENTRY = `import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Mesh,
  MeshPhongMaterial,
  AmbientLight,
  DirectionalLight,
  Box3,
  Vector3,
  Color,
} from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

window.__threeSTL = {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Mesh,
  MeshPhongMaterial,
  AmbientLight,
  DirectionalLight,
  Box3,
  Vector3,
  Color,
  STLLoader,
  OrbitControls,
}
`

async function main() {
  const version = process.argv[2]
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error('Usage: node media-src/scripts/fetch-three.mjs <version>  (e.g. 0.184.0)')
    process.exit(1)
  }

  const pkgPath = path.join(MEDIA_SRC_DIR, 'node_modules/three/package.json')
  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'))
  if (pkg.version !== version) {
    throw new Error(
      `node_modules/three is ${pkg.version}, not the requested ${version} — this script bundles ` +
        `from node_modules, it does not fetch from the network. Bump the "three" devDependency ` +
        `in media-src/package.json and \`npm install\` first.`,
    )
  }

  const result = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: MEDIA_SRC_DIR, loader: 'js' },
    bundle: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    write: false,
  })
  const js = Buffer.from(result.outputFiles[0].contents)
  if (!js.toString('utf8').includes('__threeSTL')) {
    throw new Error('bundled output does not expose window.__threeSTL — bundling broke.')
  }

  const lic = await fs.readFile(path.join(MEDIA_SRC_DIR, 'node_modules/three/LICENSE'))

  await fs.mkdir(VENDOR_DIR, { recursive: true })
  await fs.writeFile(path.join(VENDOR_DIR, 'three-stl.min.js'), js)
  await fs.writeFile(path.join(VENDOR_DIR, 'LICENSE'), lic)
  const source = {
    version,
    description:
      'three.js tree-shaken STL viewer (Scene+Camera+Renderer+STLLoader+OrbitControls, MIT)',
    origin: 'https://github.com/mrdoob/three.js',
    files: {
      'three-stl.min.js': { sha256: sha256(js) },
    },
  }
  await fs.writeFile(
    path.join(VENDOR_DIR, 'source.json'),
    `${JSON.stringify(source, null, 4)}\n`,
  )
  console.log(
    `[fetch-three] pinned v${version} (sha256 ${source.files['three-stl.min.js'].sha256.slice(0, 12)}…)`,
  )
  console.log('Remember to update tasks/100 + CHANGELOG if the bundle changed.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
