# 448 — Correct the real-VS-Code e2e cost model in the config + AGENTS.md

**Status:** DONE (2026-07-30)
**Parent:** [447 — suite cost analysis](447-vscode-e2e-suite-cost-analysis.md)

## Why

Two comments state the wrong cost model and actively misdirect optimisation:

1. `test/vscode-e2e/playwright.config.ts:22-39` — *"every spec boots its own VS Code, so the cost is
   per SPEC, not per assertion — trimming slow assertions barely helps, dropping specs does."*
   **Wrong.** `vscode-test-playwright`'s `electronApp` fixture (`dist/index.js`, declared
   `{ timeout: 0 }` with **no** `scope: 'worker'`) launches and `close()`s VS Code **per `test()`**.
   Only `_vscodeInstall` / `_createTempDir` are worker-scoped. Consequence: splitting one test into
   four quadruples the boot cost; merging four into one removes three boots. The comment says the
   opposite, which is why nobody has merged the 23-test `clipboard-elements.spec.ts` (task 450).
2. `AGENTS.md` — *"real VS Code, EVERYTHING (164 tests, ~40 min)"*. Measured 2026-07-30: **270
   tests in 145 files** (`playwright test --list`), and at the FAST tier's own recorded rate
   (33 tests / 12.8–15.8 min ⇒ 23–29 s per test) the full suite is **~90–115 min**.

## Steps

- [x] Rewrote the tier comment in `test/vscode-e2e/playwright.config.ts` — cost is **per `test()`**,
      one VS Code launch each; cites the fixture (`vscode-test-playwright/dist/index.js`, the
      `electronApp` fixture: `{ timeout: 0 }`, no `scope: 'worker'`) so the next reader can verify
      it with one grep. Kept the tier rationale, dropped the "trimming assertions barely helps"
      advice, verified via `grep -n "electronApp\|scope:" test/vscode-e2e/node_modules/vscode-test-playwright/dist/index.js`
      (confirmed line 193 `}, { timeout: 0 }]` — no `scope`).
- [x] Updated the numbers in `AGENTS.md` (`test:vscode` line) and in `DEVELOPMENT.md`. **Did not**
      use the flat "≈270 tests, ~1.5–2 h" the task suggested — see "what was measured" below for
      why; wrote a derivation instead of a bare figure.
- [x] Added the cheapest-test / harness-ratio line to both — **with different numbers than
      suggested**, see below.
- [x] Recorded the re-measure recipe in `DEVELOPMENT.md` (`npx playwright test --list`, `--reporter=json`,
      `results[].duration` / `results[].workerIndex`).
- [x] Also fixed the identical stale claim (`"a VS Code boot per spec"`, `18 tests, ~3 min`) in
      `.claude/skills/vmarkd-visual-debugging/SKILL.md` — not in the task's file list, but it repeats
      the exact wrong cost model and is a file agents load as guidance, so leaving it stale would
      have defeated the point of this task.

## What was measured (2026-07-30, this session)

- **Fixture scope claim: reproduced.** `electronApp` in `vscode-test-playwright@0.0.1-beta2`'s
  `dist/index.js` is declared `{ timeout: 0 }` with no `scope: 'worker'` — Playwright's default
  test-scope applies, so it launches/closes per `test()`. Confirmed by grep, not by inference.
- **Test/file count: close but not identical to the task's numbers**, because untracked spec files
  keep landing on this branch. `npx playwright test --list` (in `test/vscode-e2e`) at the start of
  this task: **273 tests in 146 files** (task cited 270/145 from the same morning). All docs now say
  "~270" / "re-run `--list` for today's exact count" rather than a number that will go stale by the
  next commit.
- **The `3.2 s / 0.65 s / 20–40×` figures from parent task 447 did NOT reproduce.** Measured twice,
  same commands: `webview.spec.ts` (cheapest real-VS-Code test) at **5.0–5.2 s**; the chromium
  harness (`media-src/e2e/echarts.spec.ts`, 9 tests) at **8.8–12.5 s total (~1 s/test)**. That's
  roughly a **5×** ratio for the cheapest single test on this run, not 20–40×. Docs were written with
  "~5 s / ~1 s / an order of magnitude, more for heavier assertions" instead of copying 447's numbers
  forward — this machine's load clearly varies run to run (see next point), and citing an
  unreproduced number would just create a second stale constant.
- **FAST tier: ran it in full** (`VMARKD_FAST=1 xvfb-run -a npm --prefix test/vscode-e2e test`,
  needed as ground truth for the full-suite derivation). Now **39 tests** (grew from the 33 the
  config comment cited from 2026-07-27), wall clock **8m32s (~13 s/test)** — faster per-test than
  the 2026-07-27 measurement (23–29 s/test), most likely a less machine-contended run (other agents
  were working elsewhere in the repo throughout this session). One test flaked once and passed on
  retry: `cut-selection.spec.ts:346` — a different line than task 419's `:298`, in the same file,
  same fixed-`settle` family; recorded here as corroborating evidence for task 419, not acted on in
  this task.
- **Full-suite number: did not run it** (out of scope per the team-lead brief — "do NOT run the full
  suite unasked"). Docs now state a **derivation** instead of a single figure: ~270 tests × the
  FAST-measured per-test rate (13–29 s, a ~2× swing already observed) ⇒ ~60–130 min on its own, plus
  the full suite carries ~16 min of static sleeps concentrated outside FAST (task 451's targets)
  and the PlantUML/D2 engine renders FAST never touches — written up as "on the order of an hour to
  two", explicitly flagged as unverified/re-measure-don't-trust in all three files.
- **Concurrent-write conflict during this task**: `test/vscode-e2e/` — the directory I was told is
  mine exclusively — had new spec files appearing while I worked (`caret-empty-typing.spec.ts`,
  `list-wysiwyg-space-probe.spec.ts`, `local-link-open-probe.spec.ts`, `plantuml-phase-timing.spec.ts`
  + a fixture), none created by me, one with an mtime matching the second I checked it. Flagged to
  the team lead; did not touch or lint-fix those files. This did not block 448 (docs-only, no spec
  edits) but will need resolving before 449 tags the probe-tier file list.

## Verification

- [x] `npm run typecheck` (root `tsc -p media-src/tsconfig.typecheck.json`) — clean.
- [x] `npx tsc --noEmit -p test/vscode-e2e` — "No errors found".
- [x] `./node_modules/.bin/biome check test/vscode-e2e/playwright.config.ts AGENTS.md DEVELOPMENT.md
      .claude/skills/vmarkd-visual-debugging/SKILL.md` — clean (only the `.ts` file is actually
      linted by biome; the `.md` files have no biome-checkable content).
- [ ] **`npm run lint:ci` (whole tree) is currently RED — not from this task's changes.** 5 errors /
      2 warnings, all in spec files under `test/vscode-e2e/` that appeared during this session and
      that I did not write (`caret-first-click-probe.spec.ts`, `list-wysiwyg-space-probe.spec.ts`,
      `local-link-open-probe.spec.ts`, `plantuml-phase-timing.spec.ts` — see the concurrent-write
      note above). Not ticking this box until that's resolved; it is not a regression from 448.
