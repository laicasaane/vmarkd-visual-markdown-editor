# Task 540 — Prepare and finalize the VMDE 1.4.0 release

**Status:** planned — final queue item · **Impact:** 🔴 release-critical ·
**Origin:** Project Owner release-stabilization request, 2026-09-01 ·
**Depends on:** Task 541

## Goal

Consume Task 541's frozen, fully verified VMDE 1.4.0 release candidate, package and smoke-test its
exact shipped inputs, fast-forward the local `main` branch to the accepted release commit, and create
the annotated local production tag.

This task is an operational release task. It does not add editor features and does not create a
second design or implementation task.

## Explicit authorization and external boundary

The Project Owner explicitly authorizes this task to:

- update non-code release documentation, task status, and evidence bookkeeping;
- create focused local commits on `dev` for those non-code changes;
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
- Task 541 records the exact fully tested executable candidate. Later non-code task/status/evidence
  and release-document bookkeeping is allowed with proportionate format, link, content, Marketplace,
  and package validation. No executable source, test, dependency, manifest, lockfile, workflow, or
  runtime/build/package configuration delta is allowed without reopening Task 541's affected gates.
- Local `main` must be an ancestor of `dev` before finalization. Advance it only as a fast-forward;
  never create a merge commit or resolve divergence automatically.
- `LOCAL_AGENT_TASK.md` remains untracked, unstaged, unchanged by release commits, and absent from
  the VSIX.
- Generated build output remains ignored. The retained VSIX under `artifacts/` is ignored and is not
  committed.
- Task 541 must provide current complete-suite evidence. An unresolved, skipped, unavailable, or
  retry-only release-critical result blocks the branch/tag transaction.
- Probes and spike files are evidence tools, not regression suites. They are excluded from the
  default complete suite unless a Task 455 finding explicitly promotes one into release acceptance.
- If an executable source, test, dependency, manifest, lockfile, workflow, or runtime/build/package
  configuration must change after Task 541 handoff, return to Task 541, fix it there, and rerun every
  invalidated complete gate before packaging, moving refs, or tagging. Non-code bookkeeping does not
  trigger a complete runtime-suite rerun by itself.

## Task 541 handoff contract

Task 541 owns release-content reconciliation, the complete suite, automatic failure repair, and the
executable candidate freeze. It hands this task:

- `verifiedCandidate`, the commit whose executable/build/test inputs passed the complete suite;
- `releaseCandidate`, the later commit after allowed non-code bookkeeping;
- the complete command/outcome/retry/fix evidence matrix; and
- proof that the delta between those commits has no executable, test, dependency, manifest,
  lockfile, workflow, or runtime/build/package configuration effect.

Task 540 may continue updating task/status/evidence, `CHANGELOG.md`, `README.md`, and other non-code
release documentation when final bookkeeping exposes drift. Validate those changes proportionately,
including Marketplace Markdown and package-content checks where applicable. Do not rewrite
historical task evidence or ADR decisions merely to make them read as current documentation.

## Execution sequence

### 1. Establish the release boundary

- [ ] Reread `AGENTS.md`, `DEVELOPMENT.md`, this task, Tasks 522/525/526, and the current
      `LOCAL_AGENT_TASK.md` before acting.
- [ ] Confirm Task 541 is closed and correctly indexed. Read its final evidence, focused fix commits,
      `verifiedCandidate`, `releaseCandidate`, and any residuals before doing release work.
- [ ] Verify the Task 541 handoff delta is non-code bookkeeping. If it changes an executable source,
      test, dependency, manifest, lockfile, workflow, or runtime/build/package configuration, stop
      and reopen Task 541 instead of accepting stale broad evidence.
- [ ] Record the current branch, `HEAD`, local `main`, existing `1.4.0`/`v1.4.0` tags, tracked
      status, staged paths, and remotes without changing them.
- [ ] Require branch `dev`, a clean tracked tree, a local `main` branch that is an ancestor of
      `dev`, no local numeric `1.4.0` tag, and no in-progress real-VS-Code run. An untracked
      `LOCAL_AGENT_TASK.md` is expected and must not be cleaned or staged.
- [ ] Confirm the packaging/install environment has the required dependencies, browser/VS Code
      support, disk, memory, and display access. Resolve environmental blockers before proceeding.

### 2. Final non-code bookkeeping audit

- [ ] Review `CHANGELOG.md`, `README.md`, related documentation, task status/evidence, and links
      against Task 541's actual final results. Correct non-code bookkeeping drift and run
      proportionate format, link, Marketplace Markdown, and packaging-input validation.
- [ ] Verify the root manifest/lock/root-package entry still agree on exact version 1.4.0 and the
      private `media-src` manifest/lock still agree with each other. Do not change a manifest,
      lockfile, workflow, or runtime/build/package configuration in this task; reopen Task 541 if one
      needs correction.
- [ ] Review and commit allowed non-code bookkeeping without generated files, artifacts, unrelated
      user changes, or `LOCAL_AGENT_TASK.md`. Record the final `releaseCandidate = HEAD`.

### 3. Package and test the exact artifact

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
- [ ] If packaging, inspection, or installed-artifact smoke fails, diagnose it immediately. Fix
      non-code bookkeeping here with proportionate validation. For any executable, test, dependency,
      manifest, lockfile, workflow, or runtime/build/package configuration fix, reopen Task 541 and
      rerun its invalidated complete gates before packaging again.

### 4. Fast-forward local `main` and create the tag

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

### 5. Close the operational task without changing the release tag

Task 540 cannot record its own completed ref transaction inside the commit it tags. After the local
`main`/tag verification succeeds:

- [ ] On `dev`, move this record to `tasks/done/`, mark its completed evidence honestly, and update
      `tasks/README.md` in a non-code post-release bookkeeping commit.
- [ ] Do not advance local `main`, move/recreate tag `1.4.0`, rebuild the VSIX, or claim that the
      non-code closure commit is part of the release. The tagged release commit retains Task 541's
      verified executable inputs and Task 540's installed-artifact smoke evidence.
- [ ] Verify the closure commit has no executable, test, dependency, manifest, lockfile, workflow, or
      runtime/build/package configuration change and excludes `LOCAL_AGENT_TASK.md`. Report the
      non-code commits by which `dev` is ahead of local `main` and the release tag; the Project Owner
      decides whether and where to push that bookkeeping.

## Acceptance criteria

- [ ] Task 541 is genuinely closed with every release prerequisite and Task 455-promoted defect
      resolved and tracked.
- [ ] `CHANGELOG.md`, `README.md`, related docs, task records, and release-facing configuration match
      the shipped 1.4.0 candidate without stale identifiers, settings, commands, links, or claims.
- [ ] Task 541 provides current green release-applicable quality, build, type, budget, Chromium,
      coverage, real-VS-Code, visual, workflow, and security/vendor evidence for the executable
      candidate; later non-code bookkeeping has proportionate validation.
- [ ] The retained `artifacts/vmde-1.4.0.vsix` is built once from that candidate, independently
      inspected, and smoke-tested after installation in real VS Code.
- [ ] Local `main` and annotated numeric tag `1.4.0` resolve to the accepted release commit, whose
      executable/build/package inputs match Task 541's verified candidate.
- [ ] No push, publication, remote mutation, credential use, or GitHub `v1.4.0` tag/release occurs.
- [ ] Task 540's post-release closure is a separate non-code `dev` commit and does not move the
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
- Re-running non-asserting probes or historical spikes that were not promoted into Task 541
  acceptance.
