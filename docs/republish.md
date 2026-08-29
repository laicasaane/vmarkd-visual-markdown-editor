# Packaging and manual publication

Follow the canonical procedure in
[DEVELOPMENT.md — Releasing](../DEVELOPMENT.md#releasing).

- To produce the manual-upload artifact locally, set the intended version in `package.json` and
  `package-lock.json`, update the changelog, then run:

  ```bash
  npm run package:vsix
  # artifacts/vmde-<version>.vsix
  ```

- `npm run pub` is an alias of that same local command. Neither form tags, pushes, authenticates, or
  uploads.
- Install and exercise the generated VSIX before publication. The Project Owner then uploads the
  inspected artifact through the Marketplace publisher-management page.
- For a routine GitHub release, update and push the changelog first, then run the **Release** workflow
  with the desired semantic-version bump. It creates the version commit/tag and calls **Package
  Release VSIX**, which builds the same artifact and attaches it to the GitHub Release.
- To rebuild an existing tag's GitHub Release asset, run **Package Release VSIX** manually and enter
  that tag. The asset step creates the release or replaces the existing asset; it performs no
  registry upload.

Marketplace credentials remain solely with the Project Owner and never belong in repository files,
Actions secrets, or command examples.
