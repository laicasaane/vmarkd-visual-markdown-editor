// Vendored-asset usage check (task 500). knip/dependency-cruiser only traverse the TS import
// graph; every vendored engine under media-src/vendor/ is a pre-built bundle loaded into the
// webview by `<script src>` at RUNTIME (via getCdn()), so neither tool has any opinion about it —
// if an engine's last consumer were deleted, its vendor/ dir (and the copy that ships inside the
// VSIX, see vendored-assets.mjs's header) would keep shipping forever with zero complaint. This
// script is the missing check: cross VENDORED_ASSETS (the declarative "what we ship" table)
// against a literal-string "used" predicate and report anything with no live consumer.
//
// The "used" predicate (settled explicitly, task 500 step 1 — a naive check produces false "dead"
// verdicts, the same failure mode that made task 471's devDependency finding wrong the first time):
// an asset dir `D` counts as USED if either literal substring appears anywhere in the corpus below:
//   - `dist/js/D/`  — the runtime path every getCdn()-based `<script src>`/`addStylesheet` call
//     builds (media-src/src/**), AND the path Vditor's OWN native-engine loaders build internally
//     for the 6 engines Vditor fetches itself (lute/mermaid/echarts/markmap/abcjs/smiles-drawer —
//     these have NO getCdn() call in our source at all, so the corpus must include Vditor's
//     bundled dist/index.js or all 6 would false-positive as dead).
//   - `vendor/D/`    — a real relative import from media-src/src/** straight into the vendor dir,
//     the build-time-bundled shape (task 481's mermaid-layout-elk→d3 precedent): elk-entry.ts and
//     mermaid-elk-entry.ts import `../../../vendor/{elk,mermaid-layout-elk}/...` directly; esbuild
//     inlines the bytes into the generated elk-main.js/mermaid-elk-main.js, which is what actually
//     ships (VENDORED_ASSETS' `copy: []` for both rows) and is ALSO reachable via `dist/js/D/`, but
//     this second pattern is kept as an independent signal for future assets that might be
//     build-time-only with no runtime cdn path of their own.
// The corpus is: media-src/src/**/*.ts, src/**/*.ts, and media-src/node_modules/vditor/dist/
// index.js + method.js (the vendored Vditor library's own hardcoded loader strings). No vendor dir
// currently references another vendor dir by string (checked directly), so vendor/** is not part
// of the search corpus — only imported FROM, per the `vendor/D/` pattern above.
//
// plantuml-stdlib (data for the pre-inline expander, task 136) and lute (the markdown core, not a
// diagram engine) are NOT diagram engines, but the predicate makes no assumption about what kind of
// consumer counts — a literal reference is a literal reference regardless of why the code wants it.
//
// Report-only by design (task 500: "prefer reporting over failing at first" — a heuristic that
// hard-fails the build gets disabled the first time it's wrong, ADR-0005's philosophy). Exits 0
// unless --strict is passed, matching quality.mjs's opt-in-gating precedent (task 469). Lands in
// root scripts/ (like check-bundle-size.mjs, check-coverage-modules.mjs) — outside biome's lint
// tree (`biome.json`'s `files.includes` lists `*.mjs` at repo root only, not `scripts/**/*.mjs`;
// confirmed with `biome check scripts/quality.mjs` → "ignored by the configuration"), so no lint
// gate applies to this file, same as its siblings.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { VENDORED_ASSETS } from '../media-src/vendor/vendored-assets.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

/** Recursively collect files under `dir` matching `exts`, skipping `node_modules`/`dist`/hidden dirs. */
function collectFiles(dir, exts, opts = {}) {
  const { skipNodeModules = true } = opts
  const out = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    if (skipNodeModules && e.name === 'node_modules') continue
    const full = `${dir}/${e.name}`
    if (e.isDirectory()) {
      out.push(...collectFiles(full, exts, opts))
    } else if (exts.some((ext) => e.name.endsWith(ext))) {
      out.push(full)
    }
  }
  return out
}

function buildCorpus() {
  const files = [
    ...collectFiles(`${root}media-src/src`, ['.ts']),
    ...collectFiles(`${root}src`, ['.ts']),
  ]
  // Vditor's own bundled loaders (lute/mermaid/echarts/markmap/abcjs/smiles-drawer are fetched by
  // Vditor internally via its own `cdn` option — no getCdn() call of ours ever names them).
  for (const f of ['media-src/node_modules/vditor/dist/index.js', 'media-src/node_modules/vditor/dist/method.js']) {
    const full = `${root}${f}`
    try {
      statSync(full)
      files.push(full)
    } catch {
      // vendored dep tree not installed (e.g. fresh checkout without npm ci) — report as unknown,
      // not a false "dead", see the printed caveat below.
    }
  }
  return files.map((f) => ({ path: f, text: readFileSync(f, 'utf8') }))
}

function findUsage(corpus, dir) {
  // Check the runtime-path pattern across the WHOLE corpus before falling back to the
  // build-time-import pattern, so a merely-explanatory comment mentioning `vendor/D/` (e.g. a
  // license-path reference) never shadows the real evidence when both patterns are present.
  const patterns = [`dist/js/${dir}/`, `vendor/${dir}/`]
  for (const p of patterns) {
    for (const { path, text } of corpus) {
      if (text.includes(p)) {
        return { pattern: p, file: path.slice(root.length) }
      }
    }
  }
  return null
}

const corpus = buildCorpus()
const vditorDistMissing = !corpus.some((f) => f.path.includes('node_modules/vditor/dist'))

const rows = VENDORED_ASSETS.map((entry) => {
  const hit = findUsage(corpus, entry.dir)
  return { dir: entry.dir, used: Boolean(hit), hit }
})

console.log('Vendored-asset usage check (task 500)\n')
if (vditorDistMissing) {
  console.log(
    '⚠️  media-src/node_modules/vditor/dist not found (run `npm --prefix media-src ci` first) — ' +
      'lute/mermaid/echarts/markmap/abcjs/smiles-drawer may false-report DEAD below; their only ' +
      'consumer is Vditor\'s own bundled loader, not our source.\n',
  )
}

let deadCount = 0
for (const { dir, used, hit } of rows) {
  if (used) {
    console.log(`USED  ${dir.padEnd(22)} ${hit.pattern}  (${hit.file})`)
  } else {
    deadCount++
    console.log(`DEAD  ${dir.padEnd(22)} no reference found in the corpus`)
  }
}

console.log(`\n${rows.length - deadCount}/${rows.length} assets have a live reference; ${deadCount} reported dead.`)
if (deadCount > 0) {
  console.log(
    'A "dead" verdict is NOT proof of removability — verify by hand before proposing removal ' +
      '(see tasks/500-vendored-asset-usage-check.md and tasks/done/471-dead-vendored-devdependencies.md ' +
      'for how a naive check gets this wrong). Deleting a vendored bundle is always a separate task.',
  )
}

const strict = process.argv.includes('--strict')
process.exit(strict && deadCount > 0 ? 1 : 0)
