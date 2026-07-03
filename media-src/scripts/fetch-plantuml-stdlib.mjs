// Vendor the PlantUML stdlib subsets we support offline (task 136): C4 + awslib + azure. Our TeaVM
// engine ships no stdlib and has no include hook, so we inline `!include <lib/…>` textually before
// render() (see media-src/src/plantuml-stdlib.ts). This script fetches each library's `.puml` source
// tree from upstream and PACKS it into one JSON file-map per lib —
// `media-src/vendor/plantuml/stdlib/<lib>.json` = { "<lib>/<relpath-no-ext>": "<file text>" } — plus a
// LICENSE and a sha entry in vendor/plantuml/stdlib/source.json. The build copies the JSONs into
// media/vditor/dist/js/plantuml/stdlib/ (vendored-assets registry); the webview lazy-fetches only the
// libs a diagram references.
//
// Run: `node media-src/scripts/fetch-plantuml-stdlib.mjs [c4|awslib|azure|all]` (default all).
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// Flat vendor dir (no slash) so syncVendored's `${dir}.${license}` naming works + the webview fetches
// media/vditor/dist/js/plantuml-stdlib/<lib>.json.
const OUT = path.join(HERE, '..', 'vendor', 'plantuml-stdlib')
const TMP = path.join(HERE, '..', '..', 'tmp', 'puml-stdlib-fetch')

// Each lib: a GitHub repo + branch + the dist subdir holding the .puml files. The `<lib/…>` stdlib
// include prefix maps to that subdir (e.g. <awslib/Compute/EC2> = dist/Compute/EC2.puml).
const LIBS = {
  c4: {
    prefix: 'C4',
    repo: 'plantuml-stdlib/C4-PlantUML',
    branch: 'master',
    distSub: '.', // C4 .puml files live at the repo root
    license: 'LICENSE',
  },
  awslib: {
    prefix: 'awslib',
    repo: 'awslabs/aws-icons-for-plantuml',
    branch: 'main',
    distSub: 'dist',
    license: 'LICENSE',
  },
  azure: {
    prefix: 'azure',
    repo: 'plantuml-stdlib/Azure-PlantUML',
    branch: 'master',
    distSub: 'dist',
    license: 'LICENSE',
  },
}

// Files NOT part of the includable `<lib/…>` surface, dropped from the vendored map:
//  - example/test dirs (C4-PlantUML's repo root carries percy/ + samples/);
//  - the awslib/azure `all.puml` CATEGORY AGGREGATORS — ~49% of the payload (3.7 MB) for 50 files that
//    just re-declare every icon in a category. Individual icons (`<awslib/Compute/EC2>`) still work; a
//    rare `<awslib/Compute/all>` include falls back to the "not found offline" note. Halves the bundle.
const EXCLUDE_DIR = /(^|\/)(percy|samples|examples?|tests?|\.github|docs)(\/|$)/i
const EXCLUDE_FILE = /(^|\/)all$/i // basename `all` (extension already stripped)

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

function fetchRepo(repo, branch) {
  const dir = path.join(TMP, repo.replace('/', '__'))
  if (existsSync(dir)) return dir
  mkdirSync(TMP, { recursive: true })
  const tar = `${dir}.tar.gz`
  const url = `https://codeload.github.com/${repo}/tar.gz/refs/heads/${branch}`
  console.log(`[stdlib] fetching ${url}`)
  execFileSync('curl', ['-sSL', '--fail', '--max-time', '120', '-o', tar, url])
  mkdirSync(dir, { recursive: true })
  execFileSync('tar', ['xzf', tar, '-C', dir, '--strip-components=1'])
  rmSync(tar, { force: true })
  return dir
}

function walkPuml(root) {
  const files = []
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = path.join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (e.endsWith('.puml')) files.push(p)
    }
  }
  walk(root)
  return files
}

function packLib(key) {
  const lib = LIBS[key]
  const repoDir = fetchRepo(lib.repo, lib.branch)
  const distRoot = path.resolve(repoDir, lib.distSub)
  const map = {}
  for (const file of walkPuml(distRoot)) {
    const rel = path.relative(distRoot, file).replace(/\\/g, '/').replace(/\.puml$/i, '')
    if (EXCLUDE_DIR.test(rel) || EXCLUDE_FILE.test(rel)) continue // not part of the include surface
    map[`${lib.prefix}/${rel}`] = readFileSync(file, 'utf8')
  }
  mkdirSync(OUT, { recursive: true })
  // Emit a .js (not .json) that MERGES the map onto a window global, so the webview loads it via
  // loadScript (script-src) — CSP does not allow fetch() of a resource. Values are JSON (valid JS
  // literal) so all .puml special chars are escaped safely.
  const js = `window.__vmarkdPumlStdlib=Object.assign(window.__vmarkdPumlStdlib||{},${JSON.stringify(map)});\n`
  const jsName = `${key}.js`
  writeFileSync(path.join(OUT, jsName), js)
  // vendor the license alongside
  const licSrc = path.join(repoDir, lib.license)
  if (existsSync(licSrc)) writeFileSync(path.join(OUT, `LICENSE-${key}`), readFileSync(licSrc))
  const kb = Math.round(Buffer.byteLength(js) / 1024)
  console.log(`[stdlib] ${key}: ${Object.keys(map).length} files → ${jsName} (${kb} KB)`)
  return { jsName, sha: sha256(js), files: Object.keys(map).length, kb }
}

const which = (process.argv[2] || 'all').toLowerCase()
const keys = which === 'all' ? Object.keys(LIBS) : [which]
// Merge into an existing source.json so a single-lib re-run keeps the others. `files` is the sha map the
// build's syncVendored verifies; `libs` is descriptive provenance.
const srcPath = path.join(OUT, 'source.json')
const source = existsSync(srcPath)
  ? JSON.parse(readFileSync(srcPath, 'utf8'))
  : {}
source.note = 'PlantUML stdlib subsets (C4/AWS/Azure) packed to per-lib JS file-maps (task 136).'
source.version = 'C4-PlantUML + aws-icons-for-plantuml + Azure-PlantUML (see libs)'
source.files = source.files || {}
source.libs = source.libs || {}
for (const key of keys) {
  const r = packLib(key)
  source.files[r.jsName] = { sha256: r.sha }
  source.libs[key] = {
    prefix: LIBS[key].prefix,
    repo: LIBS[key].repo,
    branch: LIBS[key].branch,
    files: r.files,
    kb: r.kb,
    js: r.jsName,
    license: `LICENSE-${key}`,
  }
}
writeFileSync(srcPath, `${JSON.stringify(source, null, 2)}\n`)
console.log('[stdlib] wrote source.json')
