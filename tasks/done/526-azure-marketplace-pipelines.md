# 526 — Azure Marketplace preview and production pipelines

**Status:** done (2026-08-30)

> **Source:** Project Owner request, 2026-08-30
> **Value / Risk:** high release automation value / high external-publishing risk

## Goal

Implement the approved design in
`docs/superpowers/specs/2026-08-30-azure-marketplace-pipelines-design.md`: retain all GitHub Actions,
add exactly two Azure DevOps Services pipeline files for Marketplace preview and production
publication, and add one local VS Code task that prepares a production version commit and tag without
pushing.

## Scope

- [x] Add `.azure/pipelines/preview.yml`, triggered only by pushes to `main`.
- [x] Derive a numeric odd-minor preview version from the checked-in even-minor production baseline
      and Azure `Build.BuildId`.
- [x] Audit, test, package once with prerelease metadata, publish the VSIX as a Pipeline Artifact,
      and publish the exact same file to Marketplace with secret `VSCE_PAT`.
- [x] Add `.azure/pipelines/release.yml`, triggered only by Azure production tags.
- [x] Require exact numeric tag/package/lock equality, even-minor production versioning, and tag
      reachability from `main` before production publication.
- [x] Audit, test, package once, publish the VSIX as a Pipeline Artifact, and publish the exact same
      file to Marketplace with secret `VSCE_PAT`.
- [x] Extend guarded VSIX packaging with explicit prerelease support.
- [x] Add a tested version-contract helper shared by local scripts and pipeline steps.
- [x] Add one VS Code task that prompts for an exact greater production version, commits the two npm
      manifests on `dev`, atomically fast-forwards the local `main` ref without switching branches,
      creates an annotated local tag, and remains on synchronized `dev` without pushing.
- [x] Add one VS Code task that packages the next incremented numeric preview VSIX in a temporary
      detached worktree, defaulting to the current committed `HEAD` on any branch with an explicit
      opt-in snapshot of staged, unstaged, and safe non-ignored untracked local edits.
- [x] Document Azure pipeline setup, `VSCE_PAT`, artifact retention, mirror/tag prerequisite, and the
      December 1, 2026 PAT-retirement follow-up.
- [x] Keep `.github/workflows/` behavior and content unchanged.

## Constraints

- `.azure/pipelines/` contains exactly `preview.yml` and `release.yml`; no templates or third
  entrypoint.
- Marketplace versions are numeric. Production uses an even minor number; preview uses the following
  odd minor number and VSCE prerelease metadata.
- Package once and publish the identical VSIX path; never rebuild during the publish step.
- Expose `VSCE_PAT` only to the Marketplace publish step.
- The local release task requires `main` to be an ancestor of `dev`; never create an automatic merge
  commit to resolve branch divergence. Update `main` with compare-and-swap `git update-ref` while
  remaining on `dev`, so branch-specific ignore rules cannot disturb the working tree.
- The local preview task reuses installed dependencies in a helper-owned detached worktree and must
  clean up only that recorded worktree/path. It is branch-agnostic: its default packages the current
  committed `HEAD`; opt-in local-edit mode captures the current worktree once and excludes ignored
  paths, dependencies, artifacts, helper temporary paths, and `LOCAL_AGENT_TASK.md`.
- Do not push, publish during local verification, configure Azure/GitHub state, or implement the
  external mirror.
- Preserve `LOCAL_AGENT_TASK.md` untracked and untouched.

## Verification

- [x] Record a failing focused test before implementing the version/task/package contracts.
- [x] Focused Vitest and changed-line coverage pass.
- [x] Both Azure YAML documents parse locally.
- [x] Static contract checks prove triggers, version guards, secret scoping, exactly two pipeline
      files, package-once behavior, both VS Code task contracts, and unchanged GitHub workflows.
- [x] Production and prerelease VSIX dry runs pass archive inspection without publishing; both local
      preview input modes prove the primary Git-visible state is unchanged except for the ignored
      completed VSIX.
- [x] The one `npm run quality` execution and its non-final timing are recorded honestly; focused
      final-candidate checks cover every later change without duplicating the aggregate gate.
- [x] Diff and staged-path review exclude generated artifacts, `LOCAL_AGENT_TASK.md`, and unrelated
      changes.

## Evidence

- TDD RED/GREEN was recorded for each behavior boundary. Version/package contracts reached 47/47
  focused tests with 94.28% line coverage for `version-contract.mjs` and 100% for VSIX arguments.
  Azure contracts reached 15/15 after correcting the initial non-exclusive tag-filter premise.
  Production-release real Git/npm fixtures reached 19/19 after hostile lifecycle and post-tag race
  regressions. Local-preview unit/integration coverage reached 69/69 with 81.38% statements, 66.35%
  branches, 94.33% functions, and 82.13% lines in the importable core. Packaging exclusions passed
  4/4 after real dry runs exposed and removed `.superpowers` and `.azure` from shipped content. The
  final combined six-file release-tooling suite passed 119/119 after one shared-`tasks.json` test
  assertion was narrowed to its production-owned input and final security review fixes landed.
- Both Azure documents parse through the declared `yaml` parser. Static tests prove exactly two
  entrypoints, mutually exclusive trigger domains (preview `main` branch only with no tag trigger;
  release tags only with every branch excluded), full version/reachability guards, ordered
  package-once/archive/artifact/publish steps, identical package and publish paths, final-step-only
  `VSCE_PAT`, both VS Code task contracts, and byte hashes for all five unchanged GitHub workflows.
- Final dry runs on commit `4c9f0de` produced and independently inspected:
  - production `artifacts/vmde-1.4.0-task526-final.vsix`: 10,515,779 bytes, SHA-256
    `bca0123573d9ad3583add2b1d3415d46519a1dce79c28a1d0c5bb93eca905061`, numeric version
    `1.4.0`, no prerelease property;
  - committed-input preview `artifacts/vmde-1.5.4-preview.vsix`: 10,524,034 bytes, SHA-256
    `f7c48fc0e553830138ab54f4ecfe2659be72a40c1df1121dd75caf0c07212c36`, numeric version
    `1.5.4`, prerelease property `true`;
  - local-edit-input preview `artifacts/vmde-1.5.5-preview.vsix`: 10,524,034 bytes, SHA-256
    `37ca28de0016bac15e7de52f37102b841a614164911aaa672a209845d56c85a1`, numeric version
    `1.5.5`, prerelease property `true`.
  Archive inventories contain neither `.superpowers`, `.azure`, nor `LOCAL_AGENT_TASK.md`. Both
  preview modes preserved HEAD, branch, status, staged/unstaged diffs, and refs; only the primary
  worktree remained and no helper temporary root remained.
- `npm run quality` was run once by the Task 3 worker and passed every stage on commit `82e8739`
  (brand, lint, knip, jscpd, dependency-cruiser, audit, 3,262-test coverage, and the zero-coverage
  ratchet). This was prematurely before the final preview-helper changes, so it is not claimed as a
  final-candidate aggregate run. The explicit at-most-once constraint prevented a retry; every later
  file instead has focused Vitest/coverage, Biome, Node syntax, dependency, YAML, archive, diff, and
  independent review evidence.
- Final whole-branch review found and the scoped re-review approved four release-boundary fixes:
  hostile Azure tag/source values now enter Bash only through quoted environment variables;
  `VMDE_VERSION` is numeric and read-only; the private `main` fetch uses a validation-step-only
  `System.AccessToken`; local production preparation disables Git hooks through an exact
  helper-owned temporary hooks directory; and every preview/release path shares even-minor
  package-plus-lock baseline validation. The final fix wave passed 119/119 focused tests, with
  94.8% lines / 100% functions in `version-contract.mjs` and 82.07% lines / 94.33% functions in the
  local-preview core.
- Chromium and real-VS-Code suites were intentionally skipped: the task changes release tooling,
  pipeline configuration, local tasks, and documentation, not webview/runtime behavior.
- No Marketplace publish, Azure pipeline/secret/service-connection creation, mirror configuration,
  tag creation, branch merge, or remote-setting mutation was performed. During the shared-checkout
  session, `refs/remotes/origin/dev` independently advanced first to `9ec2cb4` and then to closure
  commit `147deab`; its reflog records `update by push` at 2026-08-30 19:59 and 21:08 +0700. No
  root-agent command issued either push, their actor cannot be attributed from Git metadata, and no
  attempt was made to alter or undo the remote.

## External owner actions

- Create the two Azure pipeline definitions from the tracked YAML entrypoints.
- Create/restrict secret `VSCE_PAT` with Marketplace Manage scope.
- Ensure the external GitHub-to-Azure mechanism propagates the release tag.
- Push the locally prepared commit/tag when ready.
- Replace PAT publishing with Entra workload identity before the documented retirement deadline.
