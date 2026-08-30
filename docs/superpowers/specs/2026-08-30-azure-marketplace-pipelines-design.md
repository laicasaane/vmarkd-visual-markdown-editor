# Azure Marketplace pipelines design

## Goal

Add an Azure DevOps Services publishing path for the Azure Repos mirror without replacing or
changing the existing GitHub Actions workflows. Azure Pipelines owns preview and production
Marketplace publication only; GitHub-to-Azure mirroring remains external to this repository.

The tracked Azure pipeline directory contains exactly two entrypoints:

- `.azure/pipelines/preview.yml`
- `.azure/pipelines/release.yml`

Both pipelines package a VSIX once, retain that file as an Azure Pipeline Artifact, and publish the
same bytes to the Visual Studio Marketplace. Marketplace authentication is supplied only to the
publish step through the secret Azure pipeline variable `VSCE_PAT`.

## Marketplace version contract

The Marketplace does not accept SemVer prerelease suffixes such as `1.5.0-preview.3`. Preview status
is stored in VSIX metadata by passing `--pre-release` to both packaging and publishing. Follow the
Marketplace-recommended numeric channel split:

- production versions use an even minor number, for example `1.4.2`;
- preview versions use the following odd minor number, for example `1.5.123`;
- the next production line advances to the next even minor number, for example `1.6.0`.

The checked-in root package version is always the production baseline `X.Y.Z`, with even `Y`. A
preview run derives `X.(Y+1).P`, where `P` is the monotonically increasing Azure
`Build.BuildId`. The derived preview version exists only in the agent workspace and is never
committed or tagged. This keeps each Marketplace version numeric and unique without a second
persistent version source.

The production tag has no `v` prefix and must match `X.Y.Z` exactly. Production publication rejects
an odd minor number or disagreement between the tag, `package.json`, and both root-version fields in
`package-lock.json`.

References:

- [VS Code prerelease extension rules](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#pre-release-extensions)
- [VS Code Azure Pipelines CI guidance](https://code.visualstudio.com/api/working-with-extensions/continuous-integration#azure-pipelines)

## Preview pipeline

`.azure/pipelines/preview.yml` triggers only on pushes to `main`.

It performs the following sequence on an Ubuntu hosted agent with Node 22:

1. Check out the Azure Repos source.
2. Install the root and `media-src` workspaces with `npm ci`.
3. Run the existing release checks: `npm run audit`, `npm run audit:d2-go`, and `npm test`.
4. Validate the checked-in production baseline and derive `X.(Y+1).$(Build.BuildId)`.
5. Apply that version to `package.json` and `package-lock.json` in the disposable workspace.
6. Package one explicitly named VSIX with `--pre-release`, retaining the existing Marketplace image
   and package-content guards.
7. Verify the packaged manifest contains the derived numeric version and prerelease marker.
8. Publish the VSIX as an Azure Pipeline Artifact.
9. Publish that exact file with `vsce publish --packagePath ... --pre-release`, mapping `VSCE_PAT`
   into only this step.

A validation, audit, test, packaging, artifact, or Marketplace error fails the pipeline. Publishing
does not use a duplicate-suppression flag: a repeated version is an error and must remain visible.

## Production pipeline

`.azure/pipelines/release.yml` disables branch CI and includes tag triggers. Azure tag filters are
broader than the desired production syntax, so the first validation step rejects anything except an
exact numeric `X.Y.Z` tag.

It performs the following sequence:

1. Check out complete history and tags.
2. Validate the tag syntax, even minor number, and equality with `package.json` and
   `package-lock.json`.
3. Fetch/resolve `main` and prove that the tagged commit is reachable from `main`.
4. Install the root and `media-src` workspaces.
5. Run `npm run audit`, `npm run audit:d2-go`, and `npm test`.
6. Package one production VSIX through the existing guarded packaging command.
7. Verify the packaged manifest version equals the production tag and has no prerelease marker.
8. Publish the VSIX as an Azure Pipeline Artifact.
9. Publish that exact file with `vsce publish --packagePath ...`, mapping `VSCE_PAT` into only this
   step.

The pipeline never changes repository state. Tag creation and Azure mirroring happen before the
pipeline and are outside its authority.

## Shared validation and packaging seams

Add a small importable Node module under `scripts/` for the version rules. It exposes pure functions
for parsing numeric versions, ordering versions, deriving preview versions, validating production
tags, and checking the lockfile root versions. A thin CLI mode emits Azure logging commands or plain
values required by the YAML steps. Unit tests cover the pure contract.

Extend `scripts/package-vsix.mjs` with one recognized `--pre-release` flag. The flag is forwarded to
VSCE while all existing `--no-dependencies`, HTTPS image-base, and Marketplace Markdown validation
behavior remains intact. Production packaging remains the default. The helper continues to accept an
explicit `--out` path so packaging and publishing share one resolved file.

No pipeline templates are added: `.azure/pipelines/` must contain only the two approved files.

## Local release task

Add one VS Code task named `Release: prepare production version`. It prompts for an exact version
string and calls a repository script. The script never pushes.

Before mutation it verifies:

- the input is numeric `X.Y.Z`, greater than the checked-in version, and has an even minor number;
- the current branch is `dev`;
- local `main` is an ancestor of `dev`, so synchronization can be a fast-forward rather than a
  merge;
- tracked staged and unstaged changes are absent;
- the target local tag does not exist.

Untracked files do not block the task, so protected local operator input such as
`LOCAL_AGENT_TASK.md` remains untouched. After validation the script:

1. uses npm to update `package.json` and `package-lock.json` without creating a tag;
2. revalidates both manifests;
3. stages exactly `package.json` and `package-lock.json`;
4. commits them on `dev` as `release: X.Y.Z`;
5. while remaining on `dev`, atomically moves local `main` to the release commit with
   `git update-ref`, supplying the previously validated `main` commit as the expected old value;
6. verifies the synchronized commit, manifest versions, and tracked-tree state;
7. creates the annotated local tag `X.Y.Z` at that commit;
8. remains on `dev`, with local `dev` and `main` at the same release commit.

Branch ancestry is checked before the version edit, so known divergence fails without changing the
repository. The compare-and-swap ref update also fails rather than overwriting `main` if another
process moves it after validation. Avoiding a checkout of `main` prevents that branch's different
ignore rules from exposing or obstructing local untracked files. Other failures before mutation also
leave the repository unchanged. The script does not automatically reset, amend, delete, or otherwise
hide a partial Git state after a later Git failure; it reports the exact recovery point instead. The
user pushes the synchronized branches and tag to GitHub separately. GitHub-to-Azure branch/tag
propagation is intentionally not implemented here, but the Azure production pipeline can only run
once the corresponding tag exists in Azure Repos.

## Local preview packaging task

Add one VS Code task named `Preview: package local VSIX`. It simulates the Azure preview packaging
path without publishing or changing the primary working tree. A two-choice prompt controls its input:

- `Committed HEAD` is the default and packages the current checked-out commit.
- `Include local edits` is opt-in and packages a captured snapshot of the current worktree.

Both modes use a temporary detached Git worktree. The default deliberately excludes uncommitted
edits, matching the pushed-commit input Azure will build. The task is branch-agnostic and captures
the current `HEAD`; it does not switch or update any branch. Opt-in mode applies a binary-safe patch
containing staged and unstaged tracked changes, then copies non-ignored untracked files into the
temporary worktree. It explicitly excludes
`LOCAL_AGENT_TASK.md`, artifacts, dependency directories, helper-owned temporary paths, and every
Git-ignored path. The helper captures this input once before packaging, so edits made after capture
cannot race into the VSIX.

Before starting, the helper verifies that the captured `HEAD` resolves and that the installed root
and `media-src` dependencies required by the packaging path are available for reuse. It derives the
preview line from the selected snapshot's numeric even-minor production baseline: `X.Y.Z` becomes
`X.(Y+1).P`. It scans ignored local artifacts matching that exact preview line and sets `P` to the
highest existing numeric patch plus one, starting at `1` when no matching artifact exists. Other
versions and malformed filenames do not affect the counter.

The task then:

1. records the primary worktree's Git-visible state;
2. creates a uniquely named temporary directory and detached worktree at the captured `HEAD`;
3. optionally applies the captured local-edit snapshot;
4. links the existing root and `media-src` dependency directories into the temporary worktree;
5. updates the temporary worktree's `package.json` and `package-lock.json` to the derived numeric
   preview version without committing or tagging;
6. packages one explicitly named VSIX there with VSCE prerelease metadata and the existing package
   guards;
7. verifies the packaged manifest version and prerelease marker;
8. copies the completed `vmde-X.(Y+1).P-preview.vsix` into the primary repository's ignored
   `artifacts/` directory;
9. removes the temporary worktree and directory in a `finally` cleanup path;
10. verifies that the primary worktree's Git-visible state is unchanged.

The completed ignored VSIX is the sole intended primary-worktree filesystem addition. Packaging
never stashes, stages, cleans, commits, tags, pushes, publishes, or edits primary manifests, source,
or generated build output. A failed package is never copied back. Cleanup reports an exact residual
temporary path if the operating system prevents removal; it does not delete any path that the helper
did not create and record.

## Documentation and external setup

Update `DEVELOPMENT.md` to keep the existing GitHub workflow documentation and add a separate Azure
Marketplace publishing section. Document these Azure DevOps Services setup actions:

1. Create one pipeline for each YAML entrypoint.
2. Add secret variable `VSCE_PAT` with Marketplace Manage scope and restrict it to the publishing
   pipelines.
3. Confirm the Azure Repos mirror creates the production tag as well as the `main` commit.
4. Set suitable pipeline-run retention because deleting a run deletes its Pipeline Artifacts.

The requested PAT path is supported at implementation time, but current VS Code documentation says
global Azure DevOps PAT publishing retires on December 1, 2026. Record migration to Entra workload
identity and `vsce publish --azure-credential` as a required owner follow-up; do not silently broaden
this implementation into Azure identity provisioning.

## Verification

Use test-driven development for the version and release-preparation helpers. Verification includes:

- focused Vitest coverage for valid/invalid numeric versions, ordering, even/odd channel rules,
  Azure preview derivation, local artifact-counter derivation, tag equality, and lockfile
  mismatches;
- focused tests of both VS Code task contracts, committed/default versus local-edit snapshot
  selection, protected/untracked exclusions, detached-worktree cleanup boundaries, and
  package-script argument forwarding;
- local parsing of both Azure YAML files with the repository's installed YAML parser;
- Azure-contract searches proving exactly two pipeline files, expected triggers, scoped secret use,
  package-once/publish-same-path behavior, and unchanged GitHub workflows;
- a production and prerelease packaging dry run with archive inspection, including proof that both
  local preview modes leave the primary Git-visible state unchanged, without uploading;
- `npm run quality` once on the final candidate.

No live Marketplace publication, Git push, mirror change, Azure pipeline creation, secret creation,
or Azure permission mutation is part of local verification.
