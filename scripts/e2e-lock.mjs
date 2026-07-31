// Refuse to start a second real-VS-Code run while one is already going.
//
// WHY THIS EXISTS (measured 2026-07-31, not hypothetical): two full-suite runs were started at once
// — the first looked dead (`ps` showed nothing at a moment between VS Code boots, and its output was
// buffered behind a pipe) so a second was launched. Both ran for an hour and produced 11 failures
// that were partly artefacts of each other. The wasted hour is the cheap part; the expensive part is
// that a contaminated red result is indistinguishable from a real one until you re-run everything.
//
// TWO INDEPENDENT MECHANISMS BREAK, and this is why directory isolation alone would NOT be enough:
//   1. SHARED RENDER CACHE. `diagram-cache-host.ts` backs the diagram render cache with
//      `context.globalStorageUri`, and the suite reuses ONE worker-scoped globalStorage across every
//      test (see that file's own comment). Two runs on `.vscode-test/worker-0` therefore share it, so
//      the cache-hit specs (plantuml-cache, diagram-cache-mermaid, abc-flip-cache-hit) see entries
//      written by the other run and assert against a cache they didn't populate.
//   2. CPU CONTENTION. Several specs assert *relative timings* — plantuml-phase-timing compares cold
//      vs engine-warm vs cache-hit on the same fixture. Those comparisons are meaningless when
//      another VS Code instance is competing for the machine, and NO amount of per-run directory
//      isolation fixes it.
// Mechanism 2 is the reason this is a lock rather than an isolation scheme: you cannot make two
// timing-sensitive suites coexist on one box, so the correct answer is to not try.
//
// `playwright.config.ts` already sets `workers: 1` / `fullyParallel: false`, so there is no
// intra-run parallelism to worry about — the only hazard is a second *invocation*, which is exactly
// what this guards.
//
// Fails LOUDLY and immediately rather than queueing: waiting silently behind an hour-long run looks
// identical to a hang, and the whole point is to make the mistake visible at the moment it is made.
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LOCK = path.join(
  fileURLToPath(new URL('..', import.meta.url)),
  'tmp',
  'vscode-e2e.lock',
)

// A lock file whose owner died (Ctrl-C, OOM, a killed agent) must not wedge the suite forever.
// `process.kill(pid, 0)` throws ESRCH iff no such process exists — signal 0 only checks liveness.
function staleLock(pid) {
  try {
    process.kill(pid, 0)
    return false
  } catch {
    return true
  }
}

if (existsSync(LOCK)) {
  const owner = Number.parseInt(readFileSync(LOCK, 'utf8').trim(), 10)
  if (Number.isFinite(owner) && !staleLock(owner)) {
    // KNOWN GAP, hit for real 2026-07-31: this proves the WRAPPER is alive, not that its
    // playwright child still is. If a session ends and takes the child but not the wrapper, the
    // wrapper never sees the child's 'exit' and holds the lock while guarding nothing. Hence the
    // diagnostic below — `ps` shows whether any VS Code is genuinely running, which is what
    // distinguishes "wait" from "kill the orphan".
    console.error(
      `\n[e2e-lock] A real-VS-Code run is ALREADY RUNNING (pid ${owner}).\n` +
        '\nRefusing to start a second one. Two concurrent runs share the diagram render\n' +
        'cache under globalStorageUri AND compete for CPU, which silently corrupts the\n' +
        'cache-hit and timing specs — you get red tests that are artefacts, not bugs.\n' +
        '\nIs it actually doing anything? This lock only proves the wrapper is alive:\n' +
        '  ps -p ' +
        `${owner} -o etime=          # how long it has held the lock\n` +
        '  ps aux | grep -ci "[e]lectron"  # 0 means the child died and this is an orphan\n' +
        `\nWait for it, or kill ${owner} (its SIGTERM handler releases the lock cleanly).\n`,
    )
    process.exit(1)
  }
  console.error(`[e2e-lock] Clearing stale lock from dead pid ${owner}.`)
  unlinkSync(LOCK)
}

// `tmp/` is gitignored, so on a fresh clone it may not exist yet.
mkdirSync(path.dirname(LOCK), { recursive: true })
writeFileSync(LOCK, String(process.pid))
const release = () => {
  try {
    unlinkSync(LOCK)
  } catch {
    // Already gone — nothing to do.
  }
}
process.on('exit', release)
// Without these, Ctrl-C leaves a lock behind that only the staleness check above would clear.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    release()
    process.exit(130)
  })
}

// Forward the child's exit code VERBATIM. Wrapping a test command in anything that can swallow its
// status is how a red run gets reported as green — this repo lost an hour to exactly that today
// (`… | tail -60` makes the pipeline's status `tail`'s, i.e. always 0).
const child = spawn(process.argv[2], process.argv.slice(3), {
  stdio: 'inherit',
  shell: false,
})
child.on('exit', (code, signal) => {
  release()
  process.exit(signal ? 128 + 1 : (code ?? 1))
})
