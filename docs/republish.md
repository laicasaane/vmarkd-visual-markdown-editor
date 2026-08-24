# Republishing

Releases are CI-driven. Follow the canonical procedure in
[DEVELOPMENT.md — Releasing](../DEVELOPMENT.md#releasing).

- For a routine new version, update and push the changelog first, then run the
  **Release** workflow with the desired semantic-version bump.
- To publish an existing tag after a run in which no registry publish succeeded,
  configure the first registry secret, then run the **Publish** workflow and enter
  that tag. Its GitHub Release asset step is safe to rerun, but registry publishing
  is not idempotent: a duplicate version can fail before a later registry step runs.
  Do not use a full workflow rerun to recover from partial registry success without
  first deciding how to handle that duplicate-version ordering.
- For the supported local-tag route, set and commit the version in `package.json`
  first, then run `npm run pub`. That command tags the existing version and pushes;
  CI performs the build, packaging, GitHub Release, and registry publication.

Marketplace and Open VSX credentials belong in repository Actions secrets, never
in tracked files or command examples.
