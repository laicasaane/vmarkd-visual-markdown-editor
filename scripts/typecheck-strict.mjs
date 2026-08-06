#!/usr/bin/env node
// Task 503 — an ADDITIVE strict typecheck for media-src/src/**, run alongside (never instead of)
// `npm run typecheck`. It enables three `strict` sub-flags (useUnknownInCatchVariables,
// noImplicitAny, strictFunctionTypes) via media-src/tsconfig.typecheck.strict.json, then filters
// media-src/node_modules/vditor/** diagnostics out of tsc's output before deciding pass/fail.
//
// Why filter instead of fixing Vditor: we import Vditor's OWN TypeScript source directly
// (`vditor/src/index` and internals — ADR-0004), not the built package, so tsc compiles it as
// part of this program. Measured 2026-08-06: all three flags fail entirely on Vditor's source —
// 3/3, 3/18, 77/83 errors respectively — and we cannot edit that source. Filtering is the only
// way to gate OUR code without editing a dependency or weakening `npm run typecheck` (which still
// compiles Vditor's source at today's laxer strictness and still catches an esbuild patch anchor
// drifting out of type-sync with it — see test/backend/vditor-source-patches.test.ts and
// build.mjs's literal-anchor match for the other two nets on those anchors).
//
// `strictPropertyInitialization` is NOT included: `tsc` hard-errors (TS5052) if it's enabled
// without `strictNullChecks`, which stays out of scope here (see tasks/503, ~1659 of its ~1694
// errors are Vditor's).
//
// A plain `tsc | grep -v vditor` can't do this correctly: multi-line diagnostics (a TS2345's
// nested "Types of parameters X and Y are incompatible" continuation lines) don't repeat the
// file path, so a naive per-line grep would keep an upstream diagnostic's continuation lines
// after dropping its header, or vice versa. This groups full diagnostic blocks first.

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..')
const CONFIG = path.join('media-src', 'tsconfig.typecheck.strict.json')
const VDITOR_MARKER = 'media-src/node_modules/vditor'

// tsc's default (non---pretty) output is a flat list of lines. Each diagnostic starts with a
// line matching `path(line,col): error TSxxxx: ...`; every following line up to the next such
// header is that diagnostic's continuation (nested type-incompatibility detail).
const DIAG_HEADER = /^\S.*\(\d+,\d+\): error TS\d+:/

function groupDiagnostics(stdout) {
  const lines = stdout.split('\n')
  const blocks = []
  for (const line of lines) {
    if (DIAG_HEADER.test(line)) blocks.push([line])
    else if (blocks.length) blocks[blocks.length - 1].push(line)
  }
  return blocks
}

const result = spawnSync(
  path.join(ROOT, 'node_modules', '.bin', 'tsc'),
  ['-p', CONFIG, '--noEmit', '--pretty', 'false'],
  { cwd: ROOT, encoding: 'utf8' },
)

// tsc exit 0 with no diagnostics — nothing to filter, pass straight through.
if (result.status === 0 && !result.stdout.trim()) {
  console.log('typecheck:strict — clean (0 diagnostics)')
  process.exit(0)
}

const blocks = groupDiagnostics(result.stdout)
const ours = blocks.filter((b) => !b[0].includes(VDITOR_MARKER))
const vditorCount = blocks.length - ours.length

if (ours.length === 0) {
  console.log(
    `typecheck:strict — clean (0 diagnostics ours; ${vditorCount} pre-existing in Vditor's source, filtered — see scripts/typecheck-strict.mjs header)`,
  )
  process.exit(0)
}

console.error(`typecheck:strict — ${ours.length} diagnostic(s) in our code:\n`)
for (const block of ours) console.error(block.join('\n'))
console.error(
  `\n(${vditorCount} additional diagnostic(s) in Vditor's own source were filtered — not actionable here, see this script's header)`,
)
process.exit(1)
