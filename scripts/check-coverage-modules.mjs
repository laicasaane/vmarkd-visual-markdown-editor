#!/usr/bin/env node
// Coverage ratchet (task 190) — fail if a SOURCE module drops to 0% statement coverage that
// wasn't already there. It stops the untested-module list from GROWING as features land: a new
// media-src/src or src module must ship with at least one unit test (or an e2e whose coverage is
// merged) — never silently at 0%. Reads coverage/coverage-summary.json (json-summary reporter,
// wired in test/vitest.config.ts), so run `npm run test:coverage` first.
//
// BASELINE_ZERO is the set of modules already at 0% UNIT coverage when the ratchet was introduced
// (2026-07-03). Many ARE exercised by the e2e suites (whose coverage isn't merged into this
// report) — they're webview-wiring/observer modules. PRUNE an entry the moment it gains unit
// coverage; NEVER add one to silence a failure (that defeats the ratchet — write the test instead).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

// Mirrors test/vitest.config.ts coverage.exclude (entry points that need the real host/DOM).
const EXCLUDED = new Set([
  'media-src/src/main.ts',
  'media-src/src/preload.ts',
  'media-src/src/types.ts',
])

const BASELINE_ZERO = new Set([
  'media-src/src/abc-fit.ts',
  'media-src/src/callout-nav.ts',
  'media-src/src/caret-preserve.ts',
  'media-src/src/caret-scroll.ts',
  'media-src/src/diagram-retheme.ts',
  'media-src/src/diagram-zoom.ts',
  'media-src/src/echarts-apply.ts',
  'media-src/src/echarts-fit.ts',
  'media-src/src/echarts-retheme.ts',
  'media-src/src/editor-caret.ts',
  'media-src/src/elk-entry.ts',
  'media-src/src/finish-init.ts',
  'media-src/src/fix-table-ir.ts',
  'media-src/src/flowchart-retheme.ts',
  'media-src/src/hr-nav.ts',
  'media-src/src/html-comment.ts',
  'media-src/src/init-payload.ts',
  'media-src/src/inner-vditor.ts',
  'media-src/src/link-click-fix.ts',
  'media-src/src/load-script.ts',
  'media-src/src/markmap-fit.ts',
  'media-src/src/mermaid-retheme.ts',
  'media-src/src/outline-resize.ts',
  'media-src/src/outline.ts',
  'media-src/src/plantuml-retheme.ts',
  'media-src/src/prerender-overlay.ts',
  'media-src/src/preview-scroll-preserve.ts',
  'media-src/src/responsive-tables.ts',
  'media-src/src/split-scroll-sync.ts',
  'media-src/src/stream-render.ts',
  'media-src/src/stubs/vditor-toolbar-stubs.ts',
  'media-src/src/table-hotkey.ts',
  'media-src/src/toolbar-dismiss.ts',
  'media-src/src/toolbar-scroll-guard.ts',
  'media-src/src/utils.ts',
  'src/protocol.ts',
])

let summary
try {
  summary = JSON.parse(
    readFileSync(resolve(root, 'coverage/coverage-summary.json'), 'utf8'),
  )
} catch {
  console.error(
    'check-coverage-modules: coverage/coverage-summary.json not found — run `npm run test:coverage` first.',
  )
  process.exit(1)
}

const zero = []
for (const [key, v] of Object.entries(summary)) {
  if (key === 'total') continue
  const rel = key.replace(`${root}/`, '').replace(/\\/g, '/')
  if (!/^(media-src\/src|src)\//.test(rel)) continue
  if (rel.endsWith('.test.ts')) continue
  if (EXCLUDED.has(rel)) continue
  if ((v.statements?.pct ?? 0) === 0) zero.push(rel)
}

const newlyZero = zero.filter((m) => !BASELINE_ZERO.has(m)).sort()
if (newlyZero.length) {
  console.error(
    'Coverage ratchet FAILED — these source modules are at 0% coverage and are NOT in the baseline:',
  )
  for (const m of newlyZero) console.error(`  ${m}`)
  console.error(
    '\nAdd a unit test (or an e2e whose coverage is merged) that exercises them. Do NOT add them to BASELINE_ZERO.',
  )
  process.exit(1)
}

const pruned = [...BASELINE_ZERO].filter((m) => !zero.includes(m)).sort()
if (pruned.length) {
  console.log(
    `Coverage ratchet: ${pruned.length} baseline module(s) now have coverage — prune from BASELINE_ZERO:`,
  )
  for (const m of pruned) console.log(`  ${m}`)
}
console.log(
  `Coverage ratchet OK — ${zero.length} source module(s) at 0% (baseline ${BASELINE_ZERO.size}).`,
)
