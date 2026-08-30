# 525 — Marketplace image publish guard

**Status:** done (2026-08-30)

## Goal

Make the single local `npm run pub` workflow explicitly enforce the Visual Studio Marketplace rules
for images in `README.md` and `CHANGELOG.md`: packaged image URLs resolve through HTTPS, and SVGs are
accepted only from VS Code's approved badge providers.

## Contract

- Keep repository-friendly relative raster image references in source Markdown.
- Derive the HTTPS raw-image base from the existing `package.json.repository.url` configuration and
  pass it explicitly to VSCE during packaging.
- Reject absolute non-HTTPS image URLs, relative/local SVG images, inline SVG tags, SVG data URLs,
  and HTTPS SVGs from unapproved providers before VSCE runs.
- Accept HTTPS raster images and SVG badges from the provider list approved by VS Code, including
  GitHub Actions workflow badges only in their approved URL shape.
- Validate both Markdown image syntax and HTML `<img src>` in `README.md` and `CHANGELOG.md`.
- Preserve Task 522's local-only packaging behavior: no tags, pushes, credentials, or uploads.

## Verification

- [x] Unit contract observed RED before implementation and GREEN afterward.
- [x] Focused changed-line coverage exercises validation success and failure branches.
- [x] `npm run pub` packages the final VSIX without warnings.
- [x] Packaged README/CHANGELOG image references are HTTPS and contain no unapproved SVG.
- [x] Proportionate tooling gates and `npm run quality` have honest final-candidate outcomes.
- [x] Task is closed and committed locally without staging `LOCAL_AGENT_TASK.md`; nothing is pushed.

## Evidence

- TDD RED first established the missing validator boundary, then 10/11 behavior cases failed against
  the minimal scaffold. The GREEN validator covers relative PNG resolution, Markdown and HTML HTTP
  rejection, local/data/inline/unapproved SVG rejection, approved provider and GitHub workflow badge
  acceptance, and the current README/CHANGELOG. Project Owner review then required removal of the
  embedded base; a second RED proved an alternate manifest repository still resolved through the
  old constant before `package.json.repository.url` became the single source. Final focused result:
  13/13 tests.
- Focused V8 coverage for `scripts/marketplace-images.mjs` passed with 100% functions, 87.5%
  branches, and 80.95% lines. The validator CLI separately passed against the live documents with
  two references.
- `npm run pub` ran the validator, production prepublish build, and VSCE package through the one
  user-facing command. It produced `artifacts/vmde-1.4.0.vsix` (274 files, 10.03 MB) with no bundling
  warning. Independent archive inspection found the embedded README's two image URLs rewritten to
  `https://github.com/laicasaane/vmde/raw/HEAD/media/{vmde,settings}.png`; the embedded changelog had
  zero images. Re-validating both embedded documents passed.
- Bundle/startup budgets passed at 506/508 KB eager webview, 275/275 eager modules, and 29.4/34 KB
  largest module. Browser and real-VS-Code suites were not run because this task changes only local
  packaging tooling and Marketplace Markdown validation, not shipped editor/runtime behavior.
- `npm run quality` was run once. Brand, lint (788 files), knip, jscpd, and dependency-cruiser
  passed. The sandboxed audit failed DNS and the full coverage run's existing Markmap security child
  process failed with `EPERM`; narrow approved recoveries passed: root/webview audits found zero
  vulnerabilities, exact-vendor OSV found no applicable advisories (the documented Lute and
  PlantUML-stdlib unscannables remain), full coverage passed 226 files / 3,203 tests, and the
  zero-module ratchet remained at its 15-module baseline. The aggregate was not duplicated.
- No credentials, tag, push, release, Marketplace upload, or other external action was performed.
