# 447 — Real-VS-Code e2e suite cost: where the time actually goes, and what to move down a layer

**Status:** ✅ DONE (2026-08-28) — the cost program is implemented, measured, and reconciled.
**Question asked:** which `test/vscode-e2e` specs can be moved to a lighter test layer to unclog
the pipeline?

## Closure answer

Very few specs could move safely. The original keep-rule held: tests of VS Code's custom-editor
pipeline, injected CSS, CSP/resource URIs, host `TextDocument`, clipboard, focus, or caret behavior
belong in the real editor. Most savings instead came from excluding measurements, reducing VS Code
boots, and replacing only those fixed waits that had an observable completion signal.

The 2026-07-30 figures below are retained only as a historical baseline: **270 tests in 145 files**
and a derived **90–115 minute** full-suite estimate. They are not current facts. The suite continued
to change while the program landed, the original layer-ratio measurement did not reproduce, and no
like-for-like final wall-clock measurement was recorded. Current counts must come from
`npx playwright test --list`; current runtime must come from an actual run.

Task 512's final integration evidence is sufficient to close this parent without another expensive
run. Its complete real-VS-Code run exercised **243 tests**: **237 passed, 2 expected skips, and 4
configured-retry recoveries**. Each recovered surface was then diagnosed and fixed, followed by
**30/30 no-retry passes across five cycles**; the undo/redo recovery also passed **3/3 no-retry** in
the preceding stability batch. No shipped product code changed after that complete run.

## Original proposal reconciled with what shipped

| Lever | Original proposal | Shipped outcome |
|---|---|---|
| Cost model | Correct the claim that cost is per spec | [448](448-e2e-cost-model-docs-correction.md) proved one VS Code boot per `test()` and replaced volatile counts with a re-measure recipe. The original 20–40× layer ratio did not reproduce; the measured comparison was closer to 5× for the cheapest case on that run. |
| R1: non-gating measurements | Exclude 29 tests with `@probe` | [449](449-e2e-probe-tier.md) found the current set had drifted to **32 tests in 18 files**, excluded it from default discovery, added an opt-in probe tier, and added a convention guard so regression nets with probe-like names remain included. |
| R2: repeated boots within files | Collapse the top candidates with `expect.soft()` | [450](450-e2e-collapse-per-parameter-boots.md) audited all 27 listed candidates and reduced the set from **122 to 61 boots**. Four listed files kept separate starts because shared-state/reset experiments failed or the task explicitly excluded them. |
| R2 extension: boots across files | Not in the original checklist | [511](511-e2e-cross-file-shared-boot.md) removed **20 more boots** by merging safe PlantUML, D2, and `diagram-*` render families. Stateful, cache-sensitive, timing-sensitive, clipboard/focus, list, and ECharts cases remain separate by documented rule. |
| R3: fixed waits | Convert the largest sleeps to conditions | [451](451-e2e-replace-fixed-sleeps.md) converted the original candidate set where safe and retained negative-assertion, geometry-quiescence, and lost-mode-click guards. [512](512-e2e-residual-settle-sleeps.md) then completed a parser-backed whole-suite audit: the final checkpoint removed **33 calls / 65.7 static seconds**, leaving **264 executable calls / 435.323 seconds** in the default inventory with **0 missing long-wait dispositions**. The remainder is classified behavior, not an unreviewed savings estimate. |
| R4: parallel workers | Try 2–3 workers | [452](452-e2e-sharding-investigation.md) proved parallelism works and measured **1.59×** on SMOKE with 3 workers, not 2–3×. It also reproduced focus and X-clipboard corruption because workers share one X display. Owner decision: keep `workers: 1`; local retries were reduced from 2 to 1 while CI keeps 2. |
| Layer migrations | Move/delete five likely harness-able specs and spike diagram mounting | [453](453-e2e-layer-migrations.md) retired `inline-pad`, `mermaid-markers`, and `preview-width`, then additionally migrated and retired `diagram-width`. `list-ops` and `mode-roundtrip` gained cheap harness coverage but kept their real-VS-Code nets because no project fix could be reverted to prove replacement coverage. `diagram-sizing` stayed real-VS-Code-only because Preview DOM/CSS parity and mindmap resize wiring were not proved in the harness. |

The original `~30–50 min` recoverable estimate and predicted `45–60 min` final runtime are therefore
closed as planning estimates, not reported outcomes. Probe exclusion and boot removals are measured;
fixed-wait reductions are measured under their stated inventories; parallel throughput is measured;
but the program did not capture a comparable before/after full-suite wall clock. It would be
misleading to synthesize one from overlapping changes and a moving test population.

## Keep-rule, confirmed

A spec may move down only when VS Code supplies nothing beyond opening a document. It stays in
`test/vscode-e2e` when it depends on any of these:

- injected VS Code CSS, `--vscode-*` values, or real theme state;
- CSP, `asWebviewUri`, Workers, lazy `loadScript`, or the custom-editor resource pipeline;
- host documents, filesystem/save/dirty/undo behavior, commands, or settings;
- the real clipboard bridge or native copy/paste/cut;
- caret, focus, OS-window focus, or editor lifecycle behavior.

Task 453 confirmed that this rule leaves a deliberately short migration list. Tasks 450, 511, and
512 also showed why some superficially similar tests cannot share a boot or replace a wait: cold
cache state, global settings, renderer instance counts, document mutation, focus, negative windows,
and multi-engine geometry are part of what those tests assert.

## Residual risks and explicit exclusions

- **Parallel execution remains unsafe** without either one X display per worker or a serial lane for
  clipboard/focus specs. The measured 1.59× gain did not justify that machinery; do not enable
  multiple workers without reopening task 452's decision.
- **State-coupled boots remain intentional.** Reset-boundary experiments failed for several
  mode/document cases, and cross-file audits excluded cache-, settings-, timing-, focus-, and
  mutation-sensitive families. Further merging needs new isolation evidence, not raw file counts.
- **Fixed waits remain intentional where absence-over-time, native sequencing, delayed duplicate
  effects, cache PUT without acknowledgement, or geometry quiescence is the contract.** Task 512's
  `--verify-dispositions` result is the authority; a nonzero residual timer total is not itself a
  defect.
- **No final like-for-like runtime exists.** The suite and machine load changed throughout the
  program. Re-measure only when a current scheduling decision needs the number.
- **Task 512's complete run had four retry recoveries**, all followed by focused no-retry evidence.
  That is sufficient closure evidence, but it should not be rewritten as a pristine first-attempt
  full run.

## Closure verification (2026-08-28)

- `npx playwright test --list` from `test/vscode-e2e` — **243 tests in 161 files**, matching task
  512's final full-run population. This is a fresh discovery count, not a runtime measurement.
- `npx playwright test --list | node ../../scripts/audit-vscode-e2e-waits.mjs
  --verify-dispositions` — **161 discovered files, 90 with waits, 264 executable calls,
  435.323 static seconds, 0 missing dispositions**.
- Repository-relative link check across tasks 447–453, 491, 511, and 512 — all links resolve after
  archiving the completed files.
- `git diff --check` — clean.

No runtime test was added or repeated for this documentation-only closure. The complete task-512
run and its no-retry recovery reruns are the behavior evidence; the fresh checks above validate the
current inventory and documentation consistency.

## Final checklist

- [x] Cost comments corrected: per `test()`, not per spec; volatile counts replaced with a recipe.
- [x] Probe tier shipped: 32 then-current tests in 18 files excluded; regression-net exceptions guarded.
- [x] Within-file boot candidates dispositioned: 122 → 61 boots, with failed reset boundaries retained.
- [x] Cross-file safe families merged: 20 additional boots removed; unsafe families audited out.
- [x] Eligible fixed waits converted; every retained long wait classified in source; 0 missing dispositions.
- [x] Three-worker experiment recorded via worker/process evidence; parallel default declined on reproduced X-display races.
- [x] Harness migrations and diagram-mount spike dispositioned; unproved replacements kept in real VS Code.
- [x] Full-suite closure evidence accepted from task 512; no redundant full run started.
- [x] Parent reconciled against shipped decisions, stale estimates retired, residual risks recorded.
