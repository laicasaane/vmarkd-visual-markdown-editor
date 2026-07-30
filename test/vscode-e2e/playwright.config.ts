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

// ── The two tiers ───────────────────────────────────────────────────────────────────────────────
// Cost model (task 448 — corrected 2026-07-30, an earlier version of this comment said "per SPEC"
// and got the optimisation advice backwards): the boot is per `test()`, not per spec file.
// vscode-test-playwright's `electronApp` fixture (node_modules/vscode-test-playwright/dist/index.js)
// is declared `{ timeout: 0 }` with NO `scope: 'worker'`, so Playwright's default test-scope applies
// — it launches and `.close()`s a fresh VS Code per `test()`. Only `_vscodeInstall` /
// `_createTempDir` are `scope: 'worker'` (grep both to verify). Consequence: splitting one test into
// four QUADRUPLES the boot cost; merging four `test()`s that share a fixture into one REMOVES three
// boots (see task 450). Trimming what a test asserts barely helps; how many `test()` blocks a spec
// declares is what the wall clock tracks. The full suite is NOT the ~40 min this comment used to
// claim — that estimate came from treating the 145-ish spec FILES as the unit of cost. It is also
// not a single clean number, and deliberately NOT pinned here: re-run `npx playwright test --list`
// for today's exact test count — it moves with every merge (task 450 collapsed 37 tests into 7
// across 3 files alone) and every spec another agent adds, so a number written on one date is stale
// on the next; add VMARKD_PROBES=1 to see the delta task 449 excludes by default. Don't trust either
// endpoint below without re-measuring — per-test cost swings with machine load (see the FAST line
// just below, measured twice a few days apart at nearly 2×). Derivation: current test count × the
// FAST tier's own measured per-test rate (13–29 s, see below) is the bulk of it, and the full
// suite additionally carries ~16 min of static sleeps concentrated in specs FAST doesn't run
// (diagram parity / mode-switch — task 451) plus PlantUML/D2 engine renders FAST never touches —
// so treat "on the order of an hour to two" as the honest range, not a number to cite verbatim.
// That is a gate to run before you hand work over, NOT after every edit. So there are two named
// sets, both defined here rather than as spec lists in package.json, so the reasoning lives with
// them:
//
//   SMOKE — the PR gate (.github/workflows/pr-webview-smoke.yml). Boot/layout parity, every
//           renderer draws, and the change-stability core: save-to-disk fidelity, undo-to-disk,
//           split editing, scroll preservation, clipboard, upload (task 190). ~2 min.
//   FAST  — SMOKE plus the surfaces that break most often when editor behaviour changes at all:
//           host↔webview document sync, mode switching with observers attached, and the two
//           whitespace-fidelity nets (tasks 370/60/369). This is the routine tier. It has grown:
//           33 tests measured 12.8–15.8 min (23–29 s/test) on 2026-07-27; now 39 tests (it keeps
//           growing) measured 8.5 min (~13 s/test) on 2026-07-30, on a less machine-contended run —
//           both numbers are real, this suite's wall clock is load-sensitive, not just size-sensitive.
//           Budget accordingly — it is no longer an after-every-edit run.
//
// Everything else — diagram engines, themes, parity matrices — only runs in the full suite, because
// it is slow and rarely what a non-diagram change breaks. Whatever tier you pick, also run the
// spec(s) covering the surface you actually touched. (Perf probes are a THIRD population, behind
// `@probe` — task 449 — excluded from every tier including full; `npm --prefix test/vscode-e2e run
// test:probes` opts back in.)
const SMOKE_SPECS = [
  'webview.spec.ts',
  'custom-diagrams-render.spec.ts',
  'undo-dirty-probe.spec.ts',
  'save-fidelity.spec.ts',
  'sv-split.spec.ts',
  'scroll-preserve.spec.ts',
  'copy-clipboard.spec.ts',
  'paste-real.spec.ts',
  'image-upload-wire.spec.ts',
]
const FAST_SPECS = [
  ...SMOKE_SPECS,
  'doc-sync.spec.ts',
  'callouts-mode.spec.ts',
  'inline-code-gap.spec.ts',
  'block-fidelity.spec.ts',
  'git-conflict.spec.ts',
  'clipboard-collapsed.spec.ts',
  // Task 387 — cutting a real selection, in the modes clipboard-collapsed.spec.ts doesn't cover
  // (undo, WYSIWYG) plus the sv regression pin (its own file — see the comment there).
  'cut-selection.spec.ts',
  'cut-selection-sv.spec.ts',
  'ir-inline-code-line.spec.ts',
  // The only net that crosses all three edit modes — it is what caught task 240 shipping with the
  // split (sv) path still dropping reference-definition titles, after IR and WYSIWYG were green.
  'mode-roundtrip.spec.ts',
  // The split-preview copy path (task 386) — a whole clipboard mechanism no other spec touches.
  'clipboard-preview.spec.ts',
  // Focus/caret survival across a tab switch (task 389). Costs ~1.5 min of the tier — earned,
  // because a lost caret is invisible to every other spec here (they place the selection
  // programmatically, which works fine on an unfocused editor) and immediately obvious to the user.
  'caret-tab-return.spec.ts',
]
const tier = process.env.VMARKD_FAST
  ? FAST_SPECS
  : process.env.VMARKD_SMOKE
    ? SMOKE_SPECS
    : undefined

// Mark every run as the e2e harness. vscode-test-playwright copies process.env into the launched VS
// Code (minus VSCODE_*), so the extension host sees this — the DiagramCache wipes its worker-shared
// disk store per test (freshStart), isolating the render cache. Without it, a diagram cached by one
// spec HITS in a later spec and breaks fresh-render specs (d2-lazy-load, etc.) order-dependently —
// the dominant cause of the suite's "passes solo, fails in the full run" flakiness.
process.env.VMARKD_E2E = '1'

// task 449 — `@probe` tags the ~32 tests whose own headers say they assert nothing (pure
// measurements/throwaway probes — see the tagged files for the `@probe` header note). Excluded by
// default, same idea as `@visual` below, opt back in with `VMARKD_PROBES=1` (`npm run test:probes`).
// Composed into ONE regex from an array of active exclusion patterns rather than the old
// `cond ? undefined : /@visual/` ternary shape: that shape does not compose — a second independent
// tag flipped on/off by its OWN env var needs its own OR branch, not a second ternary that would
// silently stop excluding `@probe` whenever `VMARKD_VISUAL=1` was set (and vice versa). Verify all
// four on/off combinations with `npx playwright test --list` (± VMARKD_VISUAL, ± VMARKD_PROBES).
const grepExcludePatterns: string[] = []
if (!process.env.VMARKD_VISUAL) grepExcludePatterns.push('@visual')
if (!process.env.VMARKD_PROBES) grepExcludePatterns.push('@probe')
const grepInvert = grepExcludePatterns.length
  ? new RegExp(grepExcludePatterns.join('|'))
  : undefined

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
  // Tier selection (see SMOKE_SPECS / FAST_SPECS above). Unset ⇒ the full suite, which is what the
  // nightly/tag gate runs — do not make either tier the default here, or that gate silently shrinks.
  testMatch: tier,
  // Pixel goldens are opt-in for the font-drift reason above — `npm run test:vscode:visual`. Probes
  // (task 449) are opt-in for the reason above `grepExcludePatterns`. Both compose into one regex.
  grepInvert,
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
