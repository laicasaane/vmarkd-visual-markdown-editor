# Task 540 — Prepare and finalize the VMDE 1.4.0 release

**Status:** planned — final queue item · **Impact:** 🔴 release-critical ·
**Origin:** Project Owner release-stabilization request, 2026-09-01 ·
**Depends on:** Tasks 534, 455's release-critical probe subset, 181, 88, 265, 266, 267, and every
release-impacting defect promoted by Task 455

## Goal

Turn the completed stabilization queue into one auditable VMDE 1.4.0 release candidate, verify the
complete release-applicable test surface on its exact commit, update every user-facing and
release-relevant document/configuration, package and smoke-test the exact VSIX, fast-forward the
local `main` branch to that tested commit, and create the annotated local production tag.

This task is an operational release task. It does not add editor features and does not create a
second design or implementation task.

## Explicit authorization and external boundary

The Project Owner explicitly authorizes this task to:

- update release documentation and related tracked configuration;
- create focused local commits on `dev` for those changes;
- fast-forward the local `main` ref to the exact tested release commit; and
- create an annotated local numeric tag named `1.4.0` on that commit.

This authorization is local only. Do not push `dev`, `main`, or tags; publish a VSIX; create a
GitHub Release; upload to Marketplace/Open VSX; modify remotes; configure Azure/GitHub; or use
credentials. The Project Owner owns those external actions.

The numeric `1.4.0` tag is the tag required by the existing Azure production contract. GitHub's
separate workflow uses `v1.4.0`; do not create that second tag or trigger that workflow without a
separate Project Owner instruction.

## Release invariants

- The release version is exactly `1.4.0`. `package.json`, `package-lock.json`, and the lockfile root
  package entry must agree. `media-src` remains its private `0.0.0` build unit unless a separately
  approved change alters that contract; its manifest and lockfile must agree with each other.
- The release commit is one immutable commit tested, packaged, installed, and tagged without later
  source/configuration changes.
- Local `main` must be an ancestor of `dev` before finalization. Advance it only as a fast-forward;
  never create a merge commit or resolve divergence automatically.
- `LOCAL_AGENT_TASK.md` remains untracked, unstaged, unchanged by release commits, and absent from
  the VSIX.
- Generated build output remains ignored. The retained VSIX under `artifacts/` is ignored and is not
  committed.
- Every required gate must pass. A retry may diagnose a failure, but an unresolved, skipped, or
  retry-only release-critical failure blocks the branch/tag transaction.
- Probes and spike files are evidence tools, not regression suites. They are excluded from the
  default complete suite unless a Task 455 finding explicitly promotes one into release acceptance.
- Do not change tracked files after the final candidate verification. If a tracked source,
  configuration, user-facing document, or test changes, rerun the gates affected by that change and
  regenerate/reinspect the VSIX before moving refs or tagging.

## Files and surfaces

Required review/update surfaces:

- `CHANGELOG.md` — make 1.4.0 the accurate top release, use the actual release date, describe the
  shipped behavior and accepted residuals, and remove stale unreleased/future claims.
- `README.md` — reconcile the feature list, screenshots, settings/commands, keyboard guidance,
  installation/default-editor guidance, limitations, and links with the final extension.
- `package.json` and `package-lock.json` — verify exact 1.4.0 identity/version and synchronized
  release metadata.
- `media-src/package.json` and `media-src/package-lock.json` — verify their private-workspace version
  contract and dependency synchronization; do not change them to 1.4.0 merely for symmetry.
- `tasks/README.md` plus the queue task records — confirm every prerequisite is genuinely closed and
  every residual is recorded by its owner.

Conditionally update only when current evidence shows drift:

- `DEVELOPMENT.md`, `.vscode/tasks.json`, `.vscodeignore`, `.github/workflows/`,
  `.azure/pipelines/`, `docs/`, and other release-facing configuration;
- command, setting, keybinding, renderer, theme, and extension identity documentation derived from
  `package.json` and current registries; and
- Marketplace image/link references checked by the existing packaging guard.

Do not rewrite historical task evidence or ADR decisions merely to make them read as current
documentation. Add a superseding note only when the final release contract genuinely changed.

## Execution sequence

### 1. Establish the release boundary

- [ ] Reread `AGENTS.md`, `DEVELOPMENT.md`, this task, Tasks 522/525/526, and the current
      `LOCAL_AGENT_TASK.md` before acting.
- [ ] Confirm Tasks 534, 181, 88, 265, 266, and 267 are closed in their live records and correctly
      indexed. Confirm Task 455 records findings for every release-critical probe assigned by the
      local queue and that every promoted release-impacting defect is closed. If any of that work is
      incomplete, stop this task and finish it first.
- [ ] Record the current branch, `HEAD`, local `main`, existing `1.4.0`/`v1.4.0` tags, tracked
      status, staged paths, and remotes without changing them.
- [ ] Require branch `dev`, a clean tracked tree, a local `main` branch that is an ancestor of
      `dev`, no local numeric `1.4.0` tag, and no in-progress real-VS-Code run. An untracked
      `LOCAL_AGENT_TASK.md` is expected and must not be cleaned or staged.
- [ ] Confirm the final release evidence can be produced in the available environment. Missing
      browsers, VS Code builds, display support, dependencies, disk, or memory block finalization;
      resolve the environment before proceeding instead of recording a release-time omission.

### 2. Reconcile release content

- [ ] Audit `CHANGELOG.md` against completed task records and commits since the previous released
      baseline. Keep entries user-facing, remove duplicate/internal implementation detail, and state
      accepted limitations honestly.
- [ ] Audit `README.md` against the live manifest and shipped UI. Verify feature/renderer lists,
      commands, settings, keyboard shortcuts, screenshots, installation/default-editor instructions,
      security/privacy claims, and every local link.
- [ ] Search the required and conditional surfaces for stale versions, old identifiers, removed
      settings/commands, dead task links, missing new behavior, obsolete release instructions, and
      configuration contradictions. Change only release-relevant drift.
- [ ] Verify package/repository/publisher URLs and Marketplace image policy through the existing
      single-sourced configuration; do not embed a second image base or release identity.
- [ ] Review the complete tracked diff, run documentation/link/configuration checks appropriate to
      the changed paths, and create focused local commit(s). Do not include generated files,
      artifacts, unrelated user changes, or `LOCAL_AGENT_TASK.md`.

### 3. Run the complete final test suite

Use the current commands and tier definitions from `DEVELOPMENT.md`; it is the command authority and
test counts must not be copied into this task. Run on one unchanged release candidate with only one
real-VS-Code invocation at a time and `workers: 1`.

- [ ] Run the complete quality gate once on the final candidate, including lint, duplication,
      dependency boundaries, security audits, unit coverage, and the zero-coverage-module ratchet.
- [ ] Run the production build, host/webview type checks (including strict checks), bundle-size and
      startup-cost budgets, brand/identifier checks, and release/version contract checks not already
      included by the quality gate.
- [ ] Run the complete Chromium regression suite and generate/inspect its coverage report. Changed
      shipped modules must not create unexplained coverage holes.
- [ ] Run the complete default real-VS-Code suite—not smoke or FAST as a substitute—after the final
      build. Keep probes/spikes excluded and record the exact VS Code version and final result.
- [ ] Run the maintained golden screenshot and real-VS-Code diagram visual gates in the repository's
      supported visual environment. Inspect diffs; do not update baselines merely to turn a failure
      green.
- [ ] Run the slower release-only security/vendor gates, including the pinned D2 Go call-graph audit,
      and verify the current release/nightly workflow contracts.
- [ ] Diagnose every failure at the smallest layer, fix product or test defects in focused commits,
      and rerun every invalidated final gate. Do not move `main` or create the tag while any required
      gate is red, unavailable, or unresolved.

### 4. Package and test the exact artifact

- [ ] Package once from the verified committed candidate with the repository's local production VSIX
      command. Do not use the preview path, rebuild in a different checkout, or publish.
- [ ] Inspect the actual archive: identity/version, manifest entry point, production/prerelease
      metadata, Marketplace Markdown/image URLs, host bundle count, required runtime assets, and
      exclusion of sources, tests, tasks, secrets, local files, and generated development metadata.
- [ ] Record the VSIX path, byte size, SHA-256, file count, JavaScript count, and archive-inspection
      result.
- [ ] Install that exact retained VSIX into a clean real VS Code profile and run a focused smoke of
      activation, Markdown open/edit/save/reopen, mode switching, core rendering, command/settings
      registration, and extension version. Do not rebuild between archive inspection and install.
- [ ] If packaging, inspection, or installed-artifact smoke fails, fix the candidate and repeat the
      invalidated final gates plus packaging. Never tag an artifact that differs from the tested
      candidate.

### 5. Fast-forward local `main` and create the tag

The manifest is already versioned as 1.4.0. Do not run the production-version preparation task,
which is designed to create a strictly greater version commit. Reuse its guarded ref invariants for
this already-versioned candidate.

- [ ] Capture `releaseCommit = dev`, `oldMain = main`, and the clean tracked status immediately after
      artifact acceptance. Verify `HEAD == dev == releaseCommit`, `oldMain` is still an ancestor of
      `releaseCommit`, and tag `1.4.0` is still absent.
- [ ] Compare-and-swap fast-forward `refs/heads/main` from the recorded `oldMain` to
      `releaseCommit` while remaining on `dev`. If `main` moved or diverged, stop without a merge,
      reset, force update, or automatic conflict resolution.
- [ ] Create annotated tag `1.4.0` at `releaseCommit` with message `release: 1.4.0`. Do not create a
      lightweight tag, move an existing tag, or create `v1.4.0`.
- [ ] Verify local `main` and the peeled `1.4.0` tag both resolve to `releaseCommit`; verify the tag
      object is annotated, the tracked tree is clean, `LOCAL_AGENT_TASK.md` remains untracked and
      unstaged, and no remote ref changed.
- [ ] Do not push or publish. Retain the inspected VSIX and hand the exact local commit/tag/ref state
      to the Project Owner.

### 6. Close the operational task without changing the release tag

Task 540 cannot record its own completed ref transaction inside the commit it tags. After the local
`main`/tag verification succeeds:

- [ ] On `dev`, move this record to `tasks/done/`, mark its completed evidence honestly, and update
      `tasks/README.md` in one docs-only post-release closure commit.
- [ ] Do not advance local `main`, move/recreate tag `1.4.0`, rebuild the VSIX, or claim that the
      docs-only closure commit is part of the release. The tagged release commit remains the exact
      candidate that passed the complete suite and installed-artifact smoke.
- [ ] Verify the closure commit contains only Task 540/task-index status changes and excludes
      `LOCAL_AGENT_TASK.md`. Report that `dev` is one docs-only closure commit ahead of local `main`
      and the release tag; the Project Owner decides whether and where to push that bookkeeping
      commit.

## Acceptance criteria

- [ ] Every release prerequisite and Task 455-promoted defect is genuinely closed.
- [ ] `CHANGELOG.md`, `README.md`, related docs, task records, and release-facing configuration match
      the shipped 1.4.0 candidate without stale identifiers, settings, commands, links, or claims.
- [ ] The complete release-applicable quality, build, type, budget, Chromium, coverage,
      real-VS-Code, visual, workflow, and security/vendor gates pass on the final candidate.
- [ ] The retained `artifacts/vmde-1.4.0.vsix` is built once from that candidate, independently
      inspected, and smoke-tested after installation in real VS Code.
- [ ] Local `main` and annotated numeric tag `1.4.0` resolve to the exact verified release commit.
- [ ] No push, publication, remote mutation, credential use, or GitHub `v1.4.0` tag/release occurs.
- [ ] Task 540's post-release closure is a separate docs-only `dev` commit and does not move the
      tested/tagged release commit.
- [ ] Final handoff reports commit hashes, local refs/tags, commands and outcomes, retries, artifact
      path/hash/inventory, accepted residuals, skipped non-test probes, and owner-only next actions.

## Failure and recovery rules

- Before the local ref transaction, any failing required gate leaves this task open and creates no
  release tag.
- If `main` compare-and-swap fails, inspect the new ref state and stop. Never force-update, reset,
  merge divergent histories, or delete another actor's work.
- If tag creation fails after `main` advanced, leave `main` at the verified release commit, record
  the exact state, and retry only after proving the requested tag is absent and the target commit is
  unchanged.
- If verification after tag creation finds the tag incorrect, do not push it. Report the local state
  and obtain Project Owner direction before deleting or moving a tag.
- A failing installed VSIX, security gate, or complete-suite test invalidates release readiness even
  when source-level focused tests passed.

## Out of scope

- New editor functionality, elective backlog work, dependency upgrades without a release blocker,
  and refactors unrelated to a failing release gate.
- Publishing to Visual Studio Marketplace/Open VSX, creating GitHub/Azure releases or pipelines,
  setting credentials, changing remotes, or pushing any branch/tag.
- Creating `v1.4.0`, signing artifacts, changing marketplace ownership, or configuring the external
  GitHub-to-Azure mirror.
- Re-running non-asserting probes or historical spikes that were not promoted into Task 540
  acceptance.
