// Vendor the PlantUML stdlib icon libraries we support offline. Our TeaVM engine ships no stdlib and has
// no include hook, so we inline `!include <lib/…>` textually before render() (see plantuml-stdlib.ts).
// This script fetches each library's `.puml` source tree and PACKS it into one JS file-map per lib —
// `media-src/vendor/plantuml-stdlib/<lib>.js` = window.__vmarkdPumlStdlib merged with
// { "<lib>/<relpath-no-ext>": "<file text>" } — plus a LICENSE-<lib> and a sha entry in source.json. The
// build copies the .js into media/vditor/dist/js/plantuml-stdlib/ (vendored-assets registry); the webview
// lazy-fetches only the libs a diagram references.
//
// Two source tiers:
//   • task 136 — C4/awslib/azure, each from its OWN upstream repo (dedicated icon projects), pinned to a
//     release TAG (task 353).
//   • task 354 — 7 MIT/Apache icon libs (k8s, eip, edgy, domainstory, cloudogu, cloudinsight, kubernetes)
//     from the plantuml/plantuml-stdlib AGGREGATOR under stdlib/<folder>, pinned to a commit SHA (the
//     aggregator has no release tags). The aggregator carries no per-lib license, so each lib's license is
//     sourced from its ORIGIN repo (licenseUrl) or a synthesized MIT NOTICE (licenseText) — see LIBS.
//     Libs with an unclear/copyleft license (adaml GPL, gcp/elastic brand icons w/o a license, classy)
//     are deliberately NOT vendored.
//
// Run: `node media-src/scripts/fetch-plantuml-stdlib.mjs [<lib>|all]` (default all).
import { createHash } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'
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

// The plantuml/plantuml-stdlib aggregator, pinned to a commit SHA (it has NO release tags, unlike the
// dedicated C4/awslib/azure repos). All task-354 libs source their .puml from stdlib/<folder> here.
const STDLIB_REPO = 'plantuml/plantuml-stdlib'
const STDLIB_SHA = 'bdbb819f76c75e7a23af582b2a63ea7dc43eed7c' // master @ 2026-07-05

// Standard MIT text for the two libs (edgy, cloudogu) that DECLARE MIT in their README but ship no
// LICENSE file (in the aggregator or the origin repo) — we vendor a NOTICE carrying the MIT text, the
// declared copyright holder, and where the declaration lives, so the shipped-license invariant holds
// (test/backend/vendored-licenses.test.ts). The other libs fetch their origin repo's real LICENSE file.
const mitNotice = (holder, declaredAt) =>
  `MIT License

Copyright (c) ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

--
The origin repo ships no LICENSE file; MIT is declared at ${declaredAt}.
Vendored offline in Visual Markdown Editor via the PlantUML stdlib pack pipeline (task 354).
`

// Each lib: a GitHub repo + an immutable ref (`tag` for the dedicated C4/awslib/azure repos, task 353;
// `sha` for the plantuml-stdlib aggregator, task 354) + the dist subdir holding the .puml files. The
// `<lib/…>` include prefix (case-SENSITIVE — the map key uses it verbatim) maps to that subdir. License:
// `license` = a filename copied from the fetched repo; `licenseUrl` = fetched from an origin repo (the
// aggregator carries none); `licenseText` = a synthesized NOTICE. To bump a lib: change the ref, re-run
// this script, re-run the PlantUML e2e, commit the new source.json sha.
const LIBS = {
  c4: {
    prefix: 'C4',
    repo: 'plantuml-stdlib/C4-PlantUML',
    tag: 'v2.13.0', // latest stable release (2026-07-05)
    distSub: '.', // C4 .puml files live at the repo root
    license: 'LICENSE',
  },
  awslib: {
    prefix: 'awslib',
    repo: 'awslabs/aws-icons-for-plantuml',
    tag: 'v23.0', // latest stable release (2026-07-05)
    distSub: 'dist',
    license: 'LICENSE',
  },
  azure: {
    prefix: 'azure',
    repo: 'plantuml-stdlib/Azure-PlantUML',
    tag: 'v2.2', // latest stable release (2026-07-05)
    distSub: 'dist',
    license: 'LICENSE',
  },
  // ── task 354: 7 MIT/Apache libs from the plantuml-stdlib aggregator (stdlib/<folder>) ──
  k8s: {
    prefix: 'k8s',
    repo: STDLIB_REPO,
    sha: STDLIB_SHA,
    distSub: 'stdlib/k8s',
    // dcasati/kubernetes-PlantUML — MIT
    licenseUrl:
      'https://raw.githubusercontent.com/dcasati/kubernetes-PlantUML/master/LICENSE',
  },
  eip: {
    prefix: 'eip',
    repo: STDLIB_REPO,
    sha: STDLIB_SHA,
    distSub: 'stdlib/eip',
    // plantuml-stdlib/EIP-PlantUML — MIT
    licenseUrl:
      'https://raw.githubusercontent.com/plantuml-stdlib/EIP-PlantUML/main/LICENSE',
  },
  edgy: {
    prefix: 'edgy',
    repo: STDLIB_REPO,
    sha: STDLIB_SHA,
    distSub: 'stdlib/edgy',
    // boessu/plantuml-stdlib — MIT (README badge, no LICENSE file)
    licenseText: mitNotice(
      'the boessu/plantuml-stdlib contributors',
      'https://github.com/boessu/plantuml-stdlib#readme (MIT badge)',
    ),
  },
  domainstory: {
    prefix: 'DomainStory', // NOTE mixed-case include prefix: `!include <DomainStory/domainStory>`
    repo: STDLIB_REPO,
    sha: STDLIB_SHA,
    distSub: 'stdlib/DomainStory',
    // johthor/DomainStory-PlantUML — MIT
    licenseUrl:
      'https://raw.githubusercontent.com/johthor/DomainStory-PlantUML/main/LICENSE',
  },
  cloudogu: {
    prefix: 'cloudogu',
    repo: STDLIB_REPO,
    sha: STDLIB_SHA,
    distSub: 'stdlib/cloudogu',
    // cloudogu/plantuml-cloudogu-sprites — MIT (declared in README, no LICENSE file)
    licenseText: mitNotice(
      'Cloudogu GmbH',
      'https://cloudogu.com/en/license/ and the plantuml-cloudogu-sprites README',
    ),
  },
  cloudinsight: {
    prefix: 'cloudinsight',
    repo: STDLIB_REPO,
    sha: STDLIB_SHA,
    distSub: 'stdlib/cloudinsight',
    // plantuml-stdlib/cicon-plantuml-sprites — MIT
    licenseUrl:
      'https://raw.githubusercontent.com/plantuml-stdlib/cicon-plantuml-sprites/master/LICENSE',
  },
  // ── task 384: the 15 icons `domainstory` names by DEFAULT, and only those ──
  // domainstory ships no sprites; it pulls each one with `!include <material2.1.19/$icon>`, where
  // `$icon` is a PROCEDURE PARAMETER — a key our textual expander can never resolve. It does not have
  // to: the include is not load-bearing (the library's `%set_variable_value($var, "$ma_" + $icon)`
  // runs regardless), so the icons draw as soon as the sprite `$ma_<name>` EXISTS. Proven in the real
  // editor before this was written.
  //
  // Which 15: the library picks its names statically at include time from `$…_IconStyle` (default
  // `outline`), so the default look is a closed list. Vendoring all of material2.1.19 would be 2153
  // files / 6.5 MB (the "16 MB" in task 354's note is material7.4.47, a different variant); this is
  // 46 KB of source, and 3 KB once recompressed. An icon the user names outside this list is still
  // missing — and the task-384 note is what reports that.
  material: {
    prefix: 'material2.1.19', // the include prefix domainstory writes, version and all
    repo: STDLIB_REPO,
    sha: STDLIB_SHA,
    distSub: 'stdlib/material2.1.19',
    only: [
      'account',
      'account_outline',
      'account_multiple',
      'account_multiple_outline',
      'laptop',
      'file_document',
      'document',
      'folder',
      'folder_outline',
      'phone',
      'email',
      'message',
      'message_outline',
      'information',
      'information_outline',
    ],
    // Upstream ships these in the UNCOMPRESSED `/16` grid (one hex digit per pixel, ~3 KB each).
    // Re-encoding to `16z` is 15x smaller and byte-equivalent after decode — verified by rendering
    // the recompressed sprites in the real editor, not just by round-tripping our own codec.
    recompress16z: true,
    // Material Design Icons (Pictogrammers) — the vendored LICENSE-material is their "Pictogrammers
    // Free License": the icons themselves are redistributed under Apache-2.0, non-icon files MIT.
    licenseUrl:
      'https://raw.githubusercontent.com/Templarian/MaterialDesign/master/LICENSE',
  },
  kubernetes: {
    prefix: 'kubernetes',
    repo: STDLIB_REPO,
    sha: STDLIB_SHA,
    distSub: 'stdlib/kubernetes',
    // plantuml-stdlib/plantuml-kubernetes-sprites — Apache-2.0
    licenseUrl:
      'https://raw.githubusercontent.com/plantuml-stdlib/plantuml-kubernetes-sprites/main/LICENSE',
  },
}

// Files dropped from the vendored map:
//  - example/test dirs (C4-PlantUML's repo root carries percy/ + samples/; the aggregator libs each
//    carry an `_examples_/` dir), not part of the include surface;
//  - EVERY `all.puml` CATEGORY AGGREGATOR — pure REDUNDANCY: each `all.puml` resolves (after inlining or
//    static `!include` of its siblings) to EXACTLY its category's individual icon files (verified for
//    awslib/azure ~3.4 MB, gcp's 13 categories, k8s/OSS, cloudinsight). We don't ship them — the expander
//    SYNTHESIZES `<lib/Cat/all>` on the fly from the individual `<lib/Cat/*>` icons we DO ship
//    (plantuml-stdlib.ts). Full coverage, less size. (A lib whose `all.puml` is a CURATED cross-category
//    list — e.g. elastic — is NOT synthesis-reproducible and would need shipping; none of the vendored
//    libs are that case.)
const EXCLUDE_DIR =
  /(^|\/)(percy|samples|examples?|_examples_|tests?|\.github|docs)(\/|$)/i
const EXCLUDE_FILE = /(^|\/)all$/i // basename `all` (extension already stripped)

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

// PlantUML's compressed sprite alphabet (its own base64 variant) — 6 bits per character.
const SPRITE_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'

// `sprite $x [WxH/16] { <hex grid> }` → `sprite $x [WxH/16z] { <deflated> }`. The grid is one hex digit
// per pixel (level 0-15); the compressed form is those levels as raw bytes, deflate-RAW, then 6 bits per
// character over the alphabet above. Sprites already in another format are left untouched.
function recompressSprites(text) {
  return text.replace(
    /sprite (\$\w+) \[(\d+)x(\d+)\/16\]\s*\{([\s\S]*?)\}/g,
    (whole, name, w, h, grid) => {
      const levels = [...grid.replace(/\s+/g, '')].map((c) => Number.parseInt(c, 16))
      // A grid that does not match its declared size is not something to re-encode blind.
      if (levels.length !== Number(w) * Number(h) || levels.some(Number.isNaN))
        return whole
      const raw = deflateRawSync(Buffer.from(levels), { level: 9 })
      let bits = ''
      for (const b of raw) bits += b.toString(2).padStart(8, '0')
      while (bits.length % 6) bits += '0'
      let enc = ''
      for (let i = 0; i < bits.length; i += 6)
        enc += SPRITE_ALPHABET[Number.parseInt(bits.slice(i, i + 6), 2)]
      return `sprite ${name} [${w}x${h}/16z] {\n${enc.match(/.{1,120}/g).join('\n')}\n}`
    },
  )
}

const isSha = (ref) => /^[0-9a-f]{40}$/i.test(ref)

function fetchRepo(repo, ref) {
  // Cache dir keyed on repo AND ref so switching refs never reuses a stale snapshot from tmp/. NOTE the
  // aggregator (plantuml-stdlib) tarball is large (~100 MB — it bundles ibm/tupadr3/material we don't
  // vendor); it's downloaded once per sha and cached. codeload serves a raw sha at tar.gz/<sha> and a
  // release tag at tar.gz/refs/tags/<tag>.
  const dir = path.join(TMP, `${repo.replace('/', '__')}@${ref.replace(/\//g, '_')}`)
  if (existsSync(dir)) return dir
  mkdirSync(TMP, { recursive: true })
  const tar = `${dir}.tar.gz`
  const url = `https://codeload.github.com/${repo}/tar.gz/${isSha(ref) ? ref : `refs/tags/${ref}`}`
  console.log(`[stdlib] fetching ${url}`)
  execFileSync('curl', ['-sSL', '--fail', '--max-time', '300', '-o', tar, url])
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
  const repoDir = fetchRepo(lib.repo, lib.sha || lib.tag)
  const distRoot = path.resolve(repoDir, lib.distSub)
  const map = {}
  for (const file of walkPuml(distRoot)) {
    const rel = path.relative(distRoot, file).replace(/\\/g, '/').replace(/\.puml$/i, '')
    if (EXCLUDE_DIR.test(rel) || EXCLUDE_FILE.test(rel)) continue // not part of the include surface
    // `only` = an allowlist of basenames: ship a SUBSET of a large library (see material).
    if (lib.only && !lib.only.includes(rel.split('/').pop())) continue
    const text = readFileSync(file, 'utf8')
    map[`${lib.prefix}/${rel}`] = lib.recompress16z ? recompressSprites(text) : text
  }
  mkdirSync(OUT, { recursive: true })
  // Emit a .js (not .json) that MERGES the map onto a window global, so the webview loads it via
  // loadScript (script-src) — CSP does not allow fetch() of a resource. Values are JSON (valid JS
  // literal) so all .puml special chars are escaped safely.
  const js = `window.__vmarkdPumlStdlib=Object.assign(window.__vmarkdPumlStdlib||{},${JSON.stringify(map)});\n`
  const jsName = `${key}.js`
  writeFileSync(path.join(OUT, jsName), js)
  // Vendor the license alongside: inline NOTICE (licenseText), fetched from an origin repo (licenseUrl —
  // the aggregator carries no per-lib license), or copied from the fetched repo (license = filename).
  const licDst = path.join(OUT, `LICENSE-${key}`)
  if (lib.licenseText != null) {
    writeFileSync(licDst, lib.licenseText)
  } else if (lib.licenseUrl) {
    execFileSync('curl', ['-sSL', '--fail', '--max-time', '60', '-o', licDst, lib.licenseUrl])
  } else if (lib.license) {
    const licSrc = path.join(repoDir, lib.license)
    if (existsSync(licSrc)) writeFileSync(licDst, readFileSync(licSrc))
  }
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
source.note =
  'PlantUML stdlib icon libs packed to per-lib JS file-maps. C4/AWS/Azure from their own repos pinned to release tags (task 136/353); k8s/eip/edgy/domainstory/cloudogu/cloudinsight/kubernetes from the plantuml-stdlib aggregator pinned to a commit sha (task 354).'
source.version = 'per-lib (see libs) — offline PlantUML stdlib icon set'
source.files = source.files || {}
source.libs = source.libs || {}
for (const key of keys) {
  const lib = LIBS[key]
  const r = packLib(key)
  source.files[r.jsName] = { sha256: r.sha }
  source.libs[key] = {
    prefix: lib.prefix,
    repo: lib.repo,
    ...(lib.sha ? { sha: lib.sha } : { tag: lib.tag }),
    files: r.files,
    kb: r.kb,
    js: r.jsName,
    license: `LICENSE-${key}`,
  }
}
writeFileSync(srcPath, `${JSON.stringify(source, null, 2)}\n`)
console.log('[stdlib] wrote source.json')
