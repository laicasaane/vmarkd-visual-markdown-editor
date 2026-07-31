// Quality-metrics suite (task 469 item 6). Runs every quality tool and reports ALL of them —
// unlike a plain `&&` chain, one red stage does not hide the rest. Run at the end of a task's
// implementation, alongside the existing "simplify pass at the end of every task" convention (see
// AGENTS.md "Quality-metrics toolchain").
//
// Exit code is non-zero iff any stage failed — same "gate" semantics a `&&` chain would give you,
// without the "stops at the first thing that's red" blind spot. Right now `lint:ci` is red for
// reasons unrelated to any one task (10 complexity sites deferred behind other agents' in-flight
// edits, task 469 5a) — a `&&` chain would report NOTHING past that. This script still runs knip/
// jscpd/dependency-cruiser/test:coverage and shows their output even while lint:ci is red.
//
// NOT wired into CI yet (task 469 item 6) — knip/jscpd currently have real, un-actioned findings
// (dead devDependencies, an unreduced export surface, an unset duplication target) and the
// coverage-modules ratchet (last stage) is separately red (an untested module, see task 469 item
// 3). Wire this in only once every stage is clean or deliberately baselined.
import { spawnSync } from 'node:child_process'

const STAGES = [
  ['lint:ci', 'npm', ['run', 'lint:ci']],
  ['knip', 'npm', ['run', 'knip']],
  ['jscpd', 'npm', ['run', 'jscpd']],
  ['depcruise', 'npm', ['run', 'depcruise']],
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
