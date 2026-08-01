# 452 — Why does the real-VS-Code suite refuse to run on more than one worker?

**Status:** TODO — investigation first, code change only if the cause allows
**Parent:** [447 — suite cost analysis](447-vscode-e2e-suite-cost-analysis.md)
**Potential:** **2–3×** on whatever wall clock remains after 449–451. Biggest single lever left.

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

## Hypotheses to test, cheapest first

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
