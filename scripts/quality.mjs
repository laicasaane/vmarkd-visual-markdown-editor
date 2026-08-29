// Quality-metrics suite (task 469 item 6). Runs every quality tool and reports ALL of them —
// unlike a plain `&&` chain, one red stage does not hide the rest. Run at the end of a task's
// implementation, alongside the existing "simplify pass at the end of every task" convention (see
// AGENTS.md "Quality-metrics toolchain").
//
// Exit code is non-zero iff any stage failed — same "gate" semantics a `&&` chain would give you,
// without the "stops at the first thing that's red" blind spot: a stage failing for reasons
// unrelated to the task at hand (e.g. a newly-deferred complexity site) would otherwise hide every
// stage after it in a plain `&&` chain.
//
// This whole script is NOT wired into CI as one step (task 469 item 6, reaffirmed by ADR-0005's
// Philosophy) — jscpd/dependency-cruiser stay local-only tools; knip/lint/coverage each already
// have their own dedicated CI step instead (see .github/workflows/ci.yml). Every stage below is
// clean on `main` as of 2026-08-07 (task 498-503's cleanup pass, task 482's audit fix).
import { spawnSync } from 'node:child_process'

const STAGES = [
  ['lint:ci', 'npm', ['run', 'lint:ci']],
  ['knip', 'npm', ['run', 'knip']],
  ['jscpd', 'npm', ['run', 'jscpd']],
  ['depcruise', 'npm', ['run', 'depcruise']],
  // Root + media-src npm trees at --audit-level=low, plus exact-version OSV checks for every
  // declared executable vendor component (task 518). The slower toolchain-downloading D2 Go
  // call-graph audit stays a separate nightly/release gate. test/vscode-e2e is also separate and
  // clean; its own workflows run `audit:vscode-e2e` where that isolated workspace is installed.
  ['audit', 'npm', ['run', 'audit']],
  ['test:coverage', 'npm', ['run', 'test:coverage']],
  // Separate from test:coverage itself (ci.yml runs them as two steps): this ratchet reads the
  // coverage-summary.json the run above just wrote, so it must come after, not instead of, it.
  ['check:coverage-modules', 'npm', ['run', 'check:coverage-modules']],
]

const results = []
for (const [name, cmd, args] of STAGES) {
  console.log(`\n─── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}\n`)
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' })
  results.push({ name, code: res.status ?? 1 })
}

console.log('\n─── quality summary ───────────────────────────────────────\n')
let failed = false
for (const { name, code } of results) {
  const ok = code === 0
  failed ||= !ok
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
}
process.exit(failed ? 1 : 0)
