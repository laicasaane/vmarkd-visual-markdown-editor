# 526 — Azure Marketplace preview and production pipelines

> **Source:** Project Owner request, 2026-08-30
> **Value / Risk:** high release automation value / high external-publishing risk

## Goal

Implement the approved design in
`docs/superpowers/specs/2026-08-30-azure-marketplace-pipelines-design.md`: retain all GitHub Actions,
add exactly two Azure DevOps Services pipeline files for Marketplace preview and production
publication, and add one local VS Code task that prepares a production version commit and tag without
pushing.

## Scope

- [ ] Add `.azure/pipelines/preview.yml`, triggered only by pushes to `main`.
- [ ] Derive a numeric odd-minor preview version from the checked-in even-minor production baseline
      and Azure `Build.BuildId`.
- [ ] Audit, test, package once with prerelease metadata, publish the VSIX as a Pipeline Artifact,
      and publish the exact same file to Marketplace with secret `VSCE_PAT`.
- [ ] Add `.azure/pipelines/release.yml`, triggered only by Azure production tags.
- [ ] Require exact numeric tag/package/lock equality, even-minor production versioning, and tag
      reachability from `main` before production publication.
- [ ] Audit, test, package once, publish the VSIX as a Pipeline Artifact, and publish the exact same
      file to Marketplace with secret `VSCE_PAT`.
- [ ] Extend guarded VSIX packaging with explicit prerelease support.
- [ ] Add a tested version-contract helper shared by local scripts and pipeline steps.
- [ ] Add one VS Code task that prompts for an exact greater production version, commits the two npm
      manifests on `dev`, atomically fast-forwards the local `main` ref without switching branches,
      creates an annotated local tag, and remains on synchronized `dev` without pushing.
- [ ] Document Azure pipeline setup, `VSCE_PAT`, artifact retention, mirror/tag prerequisite, and the
      December 1, 2026 PAT-retirement follow-up.
- [ ] Keep `.github/workflows/` behavior and content unchanged.

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
- Do not push, publish during local verification, configure Azure/GitHub state, or implement the
  external mirror.
- Preserve `LOCAL_AGENT_TASK.md` untracked and untouched.

## Verification

- [ ] Record a failing focused test before implementing the version/task/package contracts.
- [ ] Focused Vitest and changed-line coverage pass.
- [ ] Both Azure YAML documents parse locally.
- [ ] Static contract checks prove triggers, version guards, secret scoping, exactly two pipeline
      files, package-once behavior, and unchanged GitHub workflows.
- [ ] Production and prerelease VSIX dry runs pass archive inspection without publishing.
- [ ] `npm run quality` passes once on the final candidate, or any unrelated/pre-existing failure is
      diagnosed and recorded honestly.
- [ ] Diff and staged-path review exclude generated artifacts, `LOCAL_AGENT_TASK.md`, and unrelated
      changes.

## External owner actions

- Create the two Azure pipeline definitions from the tracked YAML entrypoints.
- Create/restrict secret `VSCE_PAT` with Marketplace Manage scope.
- Ensure the external GitHub-to-Azure mechanism propagates the release tag.
- Push the locally prepared commit/tag when ready.
- Replace PAT publishing with Entra workload identity before the documented retirement deadline.
