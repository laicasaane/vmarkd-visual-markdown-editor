# Republishing

Releases are CI-driven. Follow the canonical procedure in
[DEVELOPMENT.md — Releasing](../DEVELOPMENT.md#releasing).

- For a routine new version, update and push the changelog first, then run the
  **Release** workflow with the desired semantic-version bump.
- To republish an existing tag after configuring a registry secret, run the
  **Publish** workflow and enter that tag. The GitHub Release step is safe to rerun.
- For the supported local-tag route, set and commit the version in `package.json`
  first, then run `npm run pub`. That command tags the existing version and pushes;
  CI performs the build, packaging, GitHub Release, and registry publication.

Marketplace and Open VSX credentials belong in repository Actions secrets, never
in tracked files or command examples.
