import path from 'node:path'
import { defineConfig } from '@playwright/test'
import type {
  VSCodeTestOptions,
  VSCodeWorkerOptions,
} from 'vscode-test-playwright'

// "real-vscode" suite — launches an actual VS Code (downloaded to .vscode-test/) with the
// built vMarkd extension loaded, opens a fixture in the vmarkd.editor custom editor, and
// measures/screenshots the REAL webview (VS Code injects its own default CSS + runs the
// real custom-editor pipeline). This closes the harness↔real gap for the "repro only in the
// real editor" bug class. SLOW + heavy (downloads VS Code) — opt-in, NOT in the CI gate;
// run with `npm run test:vscode`. Requires a prior `node build.mjs` (out/ + media/dist/).
//
// Geometry/computed-style assertions by default — golden screenshots ONLY behind the `@visual` tag
// (skipped unless VMARKD_VISUAL=1, see grepInvert below): linux-electron font rendering is
// machine-dependent, so pixel baselines would make the nightly gate red on a runner with different
// fonts. The one diagram surface that DOES need pixels (diagram-visual.spec.ts — the paint-a-copy
// path, where the harness cannot reach) lives behind that tag and is run locally by hand.
const repoRoot = path.resolve(__dirname, '../..')

// Mark every run as the e2e harness. vscode-test-playwright copies process.env into the launched VS
// Code (minus VSCODE_*), so the extension host sees this — the DiagramCache wipes its worker-shared
// disk store per test (freshStart), isolating the render cache. Without it, a diagram cached by one
// spec HITS in a later spec and breaks fresh-render specs (d2-lazy-load, etc.) order-dependently —
// the dominant cause of the suite's "passes solo, fails in the full run" flakiness.
process.env.VMARKD_E2E = '1'

export default defineConfig<VSCodeTestOptions, VSCodeWorkerOptions>({
  testDir: __dirname,
  // VS Code single-instances; never parallelise within a worker.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // Cold VS Code boot + webview render under WSLg/CI is occasionally slow and racy; this is an
  // opt-in PARITY smoke (the harness specs are the real guard), so retry transient boot stalls
  // rather than fail the ad-hoc run.
  retries: 2,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  // Investigative *spike* specs (perf probes, feasibility studies) are not regression tests —
  // exclude them from the default run, which the release-blocking nightly/tag gate executes
  // (audit 185/1c). Run them on demand via `npm run test:spikes` (sets VMARKD_SPIKES=1).
  testIgnore: process.env.VMARKD_SPIKES ? [] : ['**/*spike*'],
  // Pixel goldens are opt-in for the font-drift reason above — `npm run test:vscode:visual`.
  grepInvert: process.env.VMARKD_VISUAL ? undefined : /@visual/,
  reporter: [['list']],
  use: {
    extensionDevelopmentPath: repoRoot,
    // PINNED, and the pin is load-bearing — do not change it back to 'stable' without re-testing.
    // VS Code 1.130.0 breaks `electronApp.close()` in vscode-test-playwright@0.0.1-beta2: the test
    // BODY completes normally, but the `electronApp` fixture teardown never returns (the VS Code
    // process stays alive), and that fixture is declared `{ timeout: 0 }` — so the runner blocks
    // forever and NEVER emits a pass/fail verdict. Every spec in this suite becomes unreportable;
    // it looks like a hang in whatever spec you happen to be running. Verified 2026-07-23: the same
    // spec on 1.130.0 must be killed externally with no verdict, on 1.129.0 it reports `1 passed`
    // in 40s. The nightly job (task 150 item 1b) overrides this via VMARKD_VSCODE_VERSION.
    // Re-test 'stable' when a newer VS Code (or a vscode-test-playwright release) lands.
    vscodeVersion: process.env.VMARKD_VSCODE_VERSION || '1.129.0',
  },
})
