# 452 — Why does the real-VS-Code suite refuse to run on more than one worker?

**Status:** ✅ CLOSED 2026-08-12 — **the premise in this title is wrong: the suite DOES run on more
than one worker today.** Parallelism was reproduced end-to-end (3 concurrent VS Code processes,
distinct `workerIndex`, cache isolation intact) but is worth only **1.6×** on the SMOKE tier, and
one real blocker was found: specs depending on real keyboard **focus / the X clipboard** race each
other, because `xvfb-run -a` gives every worker ONE shared X display. **Owner decision: do not
parallelise** — `workers: 1` stays, now for a measured reason instead of an untested scaffold
default. What landed: the `retries` split (CI 2 / local 1) and a corrected `playwright.config.ts`
comment. Follow-ups spun off: [511](511-e2e-cross-file-shared-boot.md),
[512](done/512-e2e-residual-settle-sleeps.md).
**Parent:** [447 — suite cost analysis](447-vscode-e2e-suite-cost-analysis.md)
**Potential:** measured **1.6×** at `--workers=3` on a contended machine (not the estimated 2–3×;
per-test cost inflates ~1.7× under contention, so wall-clock gain is sub-linear).

## What is known (measured 2026-07-30)

- `test/vscode-e2e/playwright.config.ts` sets `workers: 1` with the comment *"VS Code
  single-instances; never parallelise within a worker"*. `git log -S"workers" -- test/vscode-e2e/playwright.config.ts`
  returns **one** commit — `35cdf99`, the initial scaffold. **It is an untested default, not scar
  tissue from a failed attempt.**
- The fixtures already isolate per worker: `_vscodeInstall` installs into
  `.vscode-test/worker-${parallelIndex}`, `_createTempDir` is worker-scoped, so `--user-data-dir`
  (⇒ `globalStorageUri` ⇒ the diagram-render cache the config warns about) is per worker.
  `baseDir` (the workspace) is per test. So the documented collision risk looks already handled.
- **The anomaly:** `--workers=3`, with and without `--fully-parallel`, over 4 spec files / 7 tests:
  the JSON report shows `config.workers: 3` (Playwright **did** receive the flag — not the CLI, not
  the local `rtk` wrapper) yet **every** result carries `workerIndex: 0`, `.vscode-test/worker-1`
  and `worker-2` were never touched, and the wall clock was flat (44.2 s → 42.3 s → 49.1 s).
  No spec declares `test.describe.configure({ mode: 'serial' })`.

## 2026-08-12 measurement — parallelism WORKS; the blocker is the shared X display

Re-ran the experiment as a layered discriminator. Machine: 12 cores / 15 GB, **contended by other
sessions throughout** (`uptime` load average 6 → 23 across the runs — other agents were running
`npm run quality` / `typecheck`), so every number below is a **pessimistic** floor, not a clean
measurement.

**Step A — is the config/CLI layer at fault?** Three throwaway specs importing plain
`@playwright/test` (no VS Code fixtures), `--workers=3`: results landed on `workerIndex` 0, 1 and 2,
wall 7.5 s for 3× 3 s sleeps. Playwright, this config, the CLI and the local `rtk` wrapper are all
fine. (Reporter output must be read from `--reporter=json` written to a file — the terminal reporter
gets summarised by the shell wrapper and hides exactly this evidence.)

**Step B — real specs.** `webview` + `diagram-bg` + `trailing`, `--workers=3`: `workerIndex` 0/1/2,
`pgrep` showed **3 concurrent VS Code processes**, 41.3 s → 30.1 s. So the 2026-07-30 "all results
carry workerIndex 0" anomaly is **not reproducible today**. Note the directory evidence used back
then was unsound anyway: `_vscodeInstall` unzips into `.vscode-test/worker-${parallelIndex}` (that
part is real) but its `cachePath` — which is what `--user-data-dir` hangs off — is a scratch temp
dir, so an untouched `worker-1/` directory would not have proved anything either way.

**SMOKE tier, 10 tests, same build, same session:**

| workers | wall | sum of test durations | verdict |
|---|---|---|---|
| 1 | **140.5 s** | 129 s | 10/10 pass |
| 3 | **88.2 s** | 221 s | 10/10 pass, jobs spread 3/3/4 |
| 2 | 155.5 s | 269 s | 10/10 only **after 3 retries** — see below |

⇒ **1.59× at 3 workers.** Per-test cost inflates ~1.7× under contention, which is why the gain is
sub-linear and why more workers will not keep scaling on this box. The `workers: 2` row is *not* a
measurement of 2-worker throughput — the machine hit load 23 from other sessions during it; it is
kept because it is where the failure mode below first surfaced.

### The real blocker: focus + clipboard are X-display globals

`xvfb-run -a` starts **one** X server for the whole run, so every parallel VS Code shares one
display, one focus stack and one CLIPBOARD/PRIMARY selection. Reproduced with retries OFF:
5 clipboard-touching specs (`copy-clipboard`, `clipboard-preview`, `paste-real`, `paste-table`,
`paste-ansi`) at `--workers=3` → **2 of 7 tests failed**, with symptoms that cannot be explained by
slowness: an empty clipboard read (`Expected substring "Anchor line BRAVO", Received ""`) and a lost
selection (`the selection survived until the copy keystroke`). The earlier SMOKE run additionally
had a paste assert on content consistent with the clipboard being overwritten mid-test by a
concurrent worker (not traced to a specific other spec — the two symptoms above carry the argument
on their own). Keystrokes themselves are NOT the shared resource — Playwright drives them per
window over CDP; what is display-global is the CLIPBOARD/PRIMARY selection and the focus stack (a
window taking focus blurs another, which drops a webview selection). The same specs pass serially.
**16 spec files** touch the clipboard (`grep -l "clipboard" test/vscode-e2e/*.spec.ts`).

Two possible fixes, neither implemented (needs a decision):

1. **A display per worker** — worker-scoped fixture that spawns `Xvfb :$((99 + parallelIndex))`
   (`/usr/bin/Xvfb` is present) and sets `process.env.DISPLAY` before `electronApp` launches. Works
   because the fixture runs inside the worker's own Node process and `electronApp` copies
   `process.env` at launch time. Removes focus theft too, not just clipboard collisions.
2. **A serial lane** — keep one worker for the 16 clipboard/focus specs, parallelise the rest.
   Simpler, but caps the win on exactly the tier (SMOKE/FAST) where clipboard specs are dense.

### Decision (2026-08-12, owner): do NOT parallelise

1.6× was not judged worth either fix's machinery, so `workers: 1` stays — but it is now a
**measured** choice, and `playwright.config.ts` says so instead of asserting an untested reason.
Both fix shapes above stay recorded here so the next person can re-open this with a number in hand
rather than repeating the experiment. What DID land from this investigation:
`retries: process.env.CI ? 2 : 1` (below), plus two follow-up tasks —
[511](511-e2e-cross-file-shared-boot.md) (cross-file boot merging, the next-biggest lever) and
[512](done/512-e2e-residual-settle-sleeps.md) (the residual settle sleeps 451 left).

### Not done, kept for a future re-open

- [ ] Pick fix 1 or 2 for the clipboard/focus specs — parallelism is **not safe to enable without
      one of them**.
- [x] Cache isolation verified concurrently: `diagram-cache` + `d2-lazy-load` + `abc-flip-cache-hit`
      at `--workers=3 --retries=0` → **5/5 passed, 50.7 s**, jobs on workers 0/1/2. The per-worker
      `--user-data-dir` (⇒ `globalStorageUri` ⇒ the render cache) holds, as the reasoning above
      predicted. This was the trio whose whole point is a cold/warm cache.
- [ ] Re-measure on an idle machine, then run the full suite twice before trusting it (2–4 h; ask
      the user first, per the standing don't-start-slow-suites rule).
- [ ] Only then: `workers: process.env.CI ? 2 : 3`.
- [x] The "never parallelise" comment in `playwright.config.ts` is corrected — it stated a reason
      that had never been tested and is now known to be wrong.

## Landed here: `retries` split

`retries: 2` → `retries: process.env.CI ? 2 : 1`. A retry is a whole VS Code boot (448), so a red
local run cost 3× the wall clock of the feedback loop being waited on. CI keeps 2 (a flake there
costs a pipeline re-run). Free on green runs, which is why it went unnoticed.

## Hypotheses to test, cheapest first (2026-07-30 — superseded by the section above)

1. **A worker-scoped fixture serialises worker startup** — prime suspect: `_vscodeInstall` is
   `{ timeout: 0, scope: 'worker' }` and calls `downloadAndUnzipVSCode`. Test: pre-seed
   `worker-1`/`worker-2` (already done on this machine — `cp -r worker-0 worker-N`, ~2 GB each) and
   re-run; if it still lands on `w0`, the install is not the gate.
2. **Playwright 1.52 + `fullyParallel: false` + file filters** — test with a `--grep` selection
   instead of explicit file arguments, and with `fullyParallel: true` set *in the config* rather
   than on the CLI.
3. **The `xvfb-run -a` single X server** — test with `xvfb-run --auto-servernum` semantics vs a
   manually started `Xvfb :99` shared by all workers.
4. **`vscode-test-playwright@0.0.1-beta2` specifics** — read `dist/index.js` for anything keyed on
   `parallelIndex`; the package is a beta and this is exactly the kind of thing it may not support.

## If it turns out to work

- [ ] `workers: process.env.CI ? 2 : 3` (not `'50%'` — each VS Code is heavy; this machine has
      12 cores / 15 GB and one boot is ~1 GB+).
- [ ] Document the **one-time cost**: each worker unzips its own VS Code, **~2 GB per worker dir**
      under `test/vscode-e2e/.vscode-test/`. Pre-seed by copying `worker-0` to skip the download.
- [ ] Re-verify cache isolation explicitly: run `diagram-cache.spec.ts` + `d2-lazy-load.spec.ts` +
      `abc-flip-cache-hit.spec.ts` concurrently — these are the specs whose *whole point* is a cold
      or warm render cache, i.e. the ones a shared `globalStorage` would corrupt.
- [ ] Run the full suite twice on the new setting before trusting it; record before → after here.

## If it turns out NOT to work

Record the mechanism in this file and in `playwright.config.ts` — the current comment asserts a
reason that has never been tested, and the next person will otherwise repeat this experiment.

## Related, unaffected by the above

`retries: 2` makes every genuinely failing test cost **three** boots. Free on a green run, but it
inflates exactly the red runs where feedback speed matters. Consider `retries: 1` for the full/local
runs and keeping `2` only for the CI smoke gate.
