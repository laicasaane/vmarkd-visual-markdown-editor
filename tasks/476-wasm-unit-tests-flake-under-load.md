# Task 476 — WASM-backed backend unit tests flake under machine load (default 5 s timeout)

**Status:** 📋 OPEN — measured, not yet fixed · **Impact:** 🟡 medium — a *green* suite that goes red
for no code reason wastes exactly the debugging attention this repo has been careful to spend well ·
**Origin:** observed by the team lead 2026-07-31 while running gates during heavy parallel agent
work. **Related:** [451](451-replace-fixed-sleeps-with-polls.md) (same family: time-based assumptions
that hold on an idle box and break on a busy one), [467](467-concurrent-e2e-shares-user-data-dir.md)
(contention is real, corruption was not).

## Measured

`npm test` on a box at **load average 24** (several agents building and running e2e concurrently):

```
Test Files  1 failed | 173 passed (174)
Tests       1 failed | 2475 passed (2476)
```

with, inside the same run:

```
❯ test/backend/vditor-fidelity-bugs.test.ts (14 tests | 14 failed)
❯ test/backend/lute-host.test.ts           (18 tests |  6 failed)
❯ test/backend/webview-overlay.test.ts     ( 4 tests |  3 failed)
❯ test/backend/lute-block-repair.test.ts   (92 tests | 92 skipped)
❯ test/backend/lute-gap-repair.test.ts     (73 tests | 73 skipped)
AssertionError: the given combination of arguments (undefined and string) is invalid
AssertionError: expected undefined to be defined
```

Re-run once the box quietened: **2476 passed (2476)**. Running the three suspect files *alone* while
still under load: **PASS (36) FAIL (0)**.

## The pattern — this is not random flake

Every file that failed or self-skipped **loads the Lute WASM**; nothing else in the suite did.
Confirmed by grep: `lute-host.test.ts`, `webview-overlay.test.ts`, `lute-block-repair.test.ts` (and
`lute-gap-repair.test.ts`) all reference the WASM/vm-context boot. Files that do not touch WASM were
unaffected in the same run.

**Neither `test/vitest.config.ts` nor any of these files sets `testTimeout`**, so vitest's default
**5 s** applies to a step whose cost is dominated by instantiating a multi-megabyte WASM module. On an
idle machine that fits comfortably; at load 24 it does not, and the failures present as
`expected undefined to be defined` (the module never finished loading) rather than as a timeout,
which is what makes them look like real logic bugs.

The bulk-skip shape (92 and 73 tests "skipped") is these suites' own guard reacting to the WASM not
being available — so a heavily-loaded run can silently drop **165 tests** while still reporting green
overall. That is the more dangerous half of this: a false *pass*, not just a false fail.

## Scope

- [ ] Give the WASM-loading backend suites an explicit, generous `testTimeout` (and `hookTimeout`
      for the boot hook) — per-file, or a config-level default for `test/backend/**` if that is
      cleaner. Size it against a loaded machine, not an idle one; the point is to remove a race, so
      err high. A slow test that passes beats a fast test that lies.
- [ ] **Make the skip loud.** A suite that silently skips 92 tests because a dependency failed to load
      must not contribute to a green summary. Either fail the run when the WASM boot fails, or print
      an unmissable warning. Decide which — failing is safer, but check whether any legitimate
      environment (a fresh clone before `node build.mjs`) relies on the skip.
- [ ] Re-measure under deliberate load to confirm the fix (e.g. run the suite while a build and an
      e2e run are in flight) rather than on an idle box, which would prove nothing.

## Out of scope

- The real-VS-Code e2e flake under load — different layer, and 467 already records that contention
  is a throughput/timeout problem there, not a correctness one.
- Speeding up WASM loading itself.

## Note for whoever hits this before it is fixed

If `lute-host` / `webview-overlay` / `vditor-fidelity-bugs` / `lute-*-repair` fail together and
nothing else does, **check the machine load before debugging the code**. Re-run the files in
isolation; if they pass, this is what you hit.
