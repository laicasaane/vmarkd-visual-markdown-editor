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
- For the supported local-tag route, set and commit the version in `package.json`,
  update the changelog, and push those changes to `main` first. Then check out
  `main`, synchronize it exactly with `origin/main`, and verify the working tree is
  clean before running `npm run pub`:

  ```bash
  git switch main
  git pull --ff-only origin main
  git status --short --branch   # no changes and no ahead/behind marker
  npm run pub
  ```

  `scripts/release-marketplace.sh` does not enforce the branch or clean-tree
  preconditions. Its pull runs on whichever branch is checked out, and it tags the
  current `HEAD`, so running it from a feature branch can publish the wrong commit.
  The command only tags and pushes; CI performs the build, packaging, GitHub Release,
  and registry publication.

Marketplace and Open VSX credentials belong in repository Actions secrets, never
in tracked files or command examples.
