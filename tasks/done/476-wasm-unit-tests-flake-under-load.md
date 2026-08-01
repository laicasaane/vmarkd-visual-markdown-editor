# Task 476 — WASM-backed backend unit tests flake under machine load (default 5 s timeout)

**Status:** ✅ DONE — fixed and re-measured under real load · **Impact:** 🟡 medium — a *green* suite
that goes red for no code reason wastes exactly the debugging attention this repo has been careful to
spend well · **Origin:** observed by the team lead 2026-07-31 while running gates during heavy
parallel agent work. **Fixed:** 2026-08-01. **Related:**
[451](451-replace-fixed-sleeps-with-polls.md) (same family: time-based assumptions that hold on an
idle box and break on a busy one), [467](467-concurrent-e2e-shares-user-data-dir.md) (contention is
real, corruption was not).

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

- [x] Give the WASM-loading backend suites an explicit, generous `testTimeout` and `hookTimeout`.
      Done **per-file** via `vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })` at the top
      of each of the 6 affected files, not a `test/backend/**`-wide config default — the rest of the
      backend suite is pure logic that should stay fast-failing; only the WASM boot needs the
      raised ceiling. 30 s is ~120× the idle ~250 ms load cost, chosen to comfortably clear the
      load-24 flake with real headroom ("a slow test that passes beats a fast test that lies").
      Files: `test/backend/lute-host.test.ts`, `webview-overlay.test.ts`,
      `vditor-fidelity-bugs.test.ts`, `lute-block-repair.test.ts`, `lute-gap-repair.test.ts`,
      `wiki-renderer-walk.test.ts`.
- [x] **Make the skip loud, and split the two conditions.** New shared helper
      `test/backend/lute-artifact.ts`:
      - `isLuteArtifactBuilt(root)` / `luteArtifactPath(root)` — `existsSync` against
        `media/vditor/dist/js/lute/lute.min.js` (confirmed gitignored build output via
        `git check-ignore`; the committed pin at `media-src/vendor/lute/lute.min.js`, read by
        `wiki-renderer-walk.test.ts`, is a *different* file and always present, so that suite gets
        the timeout bump but no skip guard).
      - **Missing artifact → skip loudly.** `warnLuteArtifactMissing()` writes with
        `process.stderr.write` (**not** `console.warn` — verified empirically that Vitest 4's
        default reporter drops console output from a file whose tests all pass/skip; only
        `--reporter=verbose` shows it, so a plain `npm test` run would have hidden it entirely).
        The affected describe block is then skipped via `describe.skipIf(!LUTE_BUILT)` (lute-host,
        webview-overlay, vditor-fidelity-bugs — each already had one wrapping describe) or, for the
        two flat-file suites with ~90/~70 tests at module scope and no single wrapping describe
        (lute-block-repair, lute-gap-repair), by shadowing the `describe`/`it` imports with
        `LUTE_BUILT ? real : real.skip` so every test in the file skips without reformatting it —
        their top-level `beforeAll` also early-returns on `!LUTE_BUILT` so `fs.readFileSync` never
        throws a raw ENOENT.
      - **Artifact present but boot fails/hangs → fail loud.** Two new test-only probes exported
        from `src/lute/lute-host.ts`, `isLuteWarm()` / `didLuteFailToLoad()`, let a `beforeAll`
        **poll** for real readiness (`waitForLuteWarm()` in the shared helper, 50 ms interval, same
        30 s ceiling) instead of racing a **fixed 1000 ms sleep** — the actual root cause of the
        false failures in `lute-host.test.ts` / `webview-overlay.test.ts` /
        `vditor-fidelity-bugs.test.ts` (all three used `prewarmLute` + `await new Promise(r =>
        setTimeout(r, 1000))`, which is exactly the task-451 anti-pattern: a fixed wait racing an
        async load). `waitForLuteWarm` throws a named error ("real boot failure… not the
        fresh-clone skip") on an actual load failure or on timeout, so a genuine regression now
        fails the hook instead of silently degrading into a `renderForMode(...) === undefined` that
        downstream assertions misreported as `expected undefined to be defined`.
- [x] Re-measured under deliberate load (see below) — clean pass, full test count, no silent skip.

## Re-measurement

Ran the full `npm test` equivalent (`npx vitest run --config test/vitest.config.ts`) three times:

1. **Idle-ish baseline** (load avg ~4.3, before any change and after): **183 files / 2561 tests
   passed**, both times — confirms the fix changes no test count on a quiet box.
2. **Artifact deliberately absent** — isolated via throwaway probe files using a fake root (not by
   moving the shared repo's real build output: I tried that once, and a teammate's concurrent
   `node build.mjs` silently regenerated it out from under the test run within about a minute — safe
   for my own result since I re-checked after, but if anyone else's run in that ~1–2 min window
   around 00:10–00:12 on 2026-08-01 saw a spurious skip, this is why). Confirmed:
   - `isLuteArtifactBuilt` reports `false` for the fake root; `warnLuteArtifactMissing` writes the
     named path + `node build.mjs` instructions straight to stderr, visible under the **default**
     reporter (not just `--reporter=verbose` — this matters because Vitest 4's default reporter
     silently drops `console.warn` output from a file whose tests all pass/skip, which is why
     `process.stderr.write` is used instead of `console.warn`).
   - `waitForLuteWarm` **throws** (not silently resolves) once `didLuteFailToLoad()` is true — the
     `lute-host` / `webview-overlay` / `vditor-fidelity-bugs` failure path.
   - The **shadow-alias composition** used by `lute-block-repair.test.ts` /
     `lute-gap-repair.test.ts` (module-scope `describe`/`it` reassigned to `.skip`, feeding a nested
     `describe` + `it.each`, plus a `beforeAll` that early-returns) was separately replicated with
     `LUTE_BUILT` forced `false`: exit 0, all 4 probe tests reported `skipped` (not silently absent,
     not hook-failed), file-level summary `1 skipped (1)`. This is the composition the two flat-file
     suites actually use — verified directly, not inferred from the helper alone.
3. **Deliberate load** — 24 `yes > /dev/null` CPU burners for ~12 cores, sustained
   **load average 23.3 → 33.1** through a ~50 s run (comfortably straddling and exceeding the
   originally-measured load-24 flake):
   ```
   Test Files  183 passed (183)
        Tests  2561 passed (2561)
   ```
   Exact same counts as idle — **zero false failures, zero silent skips**. (A first load run that
   additionally had `node build.mjs` in flight hit one unrelated failure in
   `module-boundaries.test.ts` — a file-tree/manifest check racing the build's file writes,
   task 460 territory, nothing to do with Lute/WASM; it passed cleanly both before and immediately
   after in isolation, confirming it was that run's self-inflicted collision, not a task-476 issue.)

**Honest limit of this fix, re: the original 92/73-skipped shape.** The 3 fixed-sleep suites'
failure mode is fully explained and fixed: they raced a **fixed 1000 ms sleep** against an async
load, confirmed by reading the code, and `waitForLuteWarm` replaces the race with a poll. The
mechanism behind `lute-block-repair` / `lute-gap-repair` silently dropping 92/73 tests is **not**
fully explained, only mitigated. Their `beforeAll` is a single synchronous call
(`vm.runInContext`) — by Vitest's own execution model a purely synchronous hook cannot be
interrupted by `hookTimeout` (the timer can't fire until the blocking call returns the event loop),
so the `hookTimeout` bump added here is defence-in-depth, not a proven fix for whatever actually
produced the bulk-skip at load 24. The original measurement was taken under mixed CPU+I/O+memory
pressure (concurrent builds and e2e runs); this task's load re-measurement (item 3) used pure CPU
burners and did not reproduce any drop at load 33, which is reassuring but not conclusive — a
memory-pressure-triggered worker eviction, for instance, would not be caught by either the
`hookTimeout` or the CPU-only re-measurement. The **loud, verified skip-vs-fail split** (item above,
including the composition check) is the substantive, positively-verified part of the fix for these
two files; treat the timeout bump on them as a safety margin, not a root-cause fix.

`npm run typecheck`: clean. `npm run lint:ci` on the changed files only (`npx biome check
src/lute/lute-host.ts test/backend/lute-artifact.ts test/backend/lute-host.test.ts
test/backend/webview-overlay.test.ts test/backend/vditor-fidelity-bugs.test.ts
test/backend/lute-block-repair.test.ts test/backend/lute-gap-repair.test.ts
test/backend/wiki-renderer-walk.test.ts`): clean, 0 errors. (Whole-tree `lint:ci` shows 4 pre-existing
errors in `media-src/e2e/content-theme.spec.ts`, `outline.spec.ts`, and
`media-src/src/editing/nav-geometry.test.ts` — all teammates' concurrently in-progress files per
`git status`, untouched by this task.)

## Out of scope

- The real-VS-Code e2e flake under load — different layer, and 467 already records that contention
  is a throughput/timeout problem there, not a correctness one.
- Speeding up WASM loading itself.

## Note (historical — the flake this describes is fixed)

If `lute-host` / `webview-overlay` / `vditor-fidelity-bugs` / `lute-*-repair` ever fail together
again and nothing else does, that's a REGRESSION of this fix, not a fresh instance of the original
bug — the generous per-file timeouts + `waitForLuteWarm` poll (see Scope above) should already
absorb machine load. Check `test/backend/lute-artifact.ts` and the `vi.setConfig` calls first.
