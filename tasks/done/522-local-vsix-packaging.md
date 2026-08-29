# 522 — Local manual VSIX packaging

**Status:** done (2026-08-29)

## Goal

Provide one deterministic local command that builds `artifacts/vmde-<version>.vsix` for the Project
Owner to upload manually, without tagging, pushing, authenticating, or publishing from the command.
Remove the VSCE many-JavaScript-files warning by bundling the extension host and excluding files that
are unnecessary at runtime.

## Contract

- `npm run package:vsix` creates `artifacts/vmde-<package version>.vsix` and performs no external
  publication action.
- `npm run pub` is a safe alias for that local packaging command.
- `vscode:prepublish` produces a minified CommonJS host bundle at `dist/extension.js`; TypeScript is
  checked separately and `vscode` remains external because VS Code provides it at runtime.
- The VSIX includes the one host bundle and required webview/runtime assets, but excludes host
  intermediate modules, source, tests, agent/task material, and development-only configuration.
- The GitHub packaging workflow may create a GitHub Release asset, but it does not publish to the VS
  Marketplace or Open VSX. The Project Owner uploads the inspected VSIX manually.

## Verification

- [x] Packaging contract test observed RED before implementation and GREEN afterward.
- [x] Focused unit tests pass; the two strictness repairs exposed during verification have focused
      coverage with their changed lines absent from the uncovered-line report.
- [x] `node build.mjs --production` passes and produces the host bundle.
- [x] `npm run package:vsix` creates the versioned artifact without the VSCE bundling warning.
- [x] Archive inspection confirms the embedded manifest, one packaged host JavaScript file, and no
      development-only files.
- [x] Focused real-VS-Code activation passes against the bundled manifest entry point.
- [x] Applicable type, bundle/startup budget, quality-stage, whitespace, and residual checks have
      decision-grade outcomes recorded below.
- [x] Task is moved to `tasks/done/`, indexed, and committed locally without
      `LOCAL_AGENT_TASK.md`; nothing is pushed.

## Evidence

- TDD RED: `test/backend/packaging-workflow.test.ts` initially failed all three contract cases for
  the old `out/app/extension.js` entry, incomplete `.vscodeignore`, and registry-upload workflow.
  Follow-up RED cases covered `--no-dependencies`, direct `LOCAL_AGENT_TASK.md` exclusion, and the
  two unused packaged asset groups. Final focused result: 39/39 manifest + packaging assertions.
- `npm run package:vsix` ran the official `vscode:prepublish` hook and produced
  `artifacts/vmde-1.4.0.vsix`. VSCE reported 274 files / 10.03 MB, down from 507 files; independent
  archive inspection counted 53 JavaScript files, exactly one host file
  (`extension/dist/extension.js`), every selectable highlight theme, and no `LOCAL_AGENT_TASK.md`,
  `out/`, `src/`, task/script material, Base16 themes, or build metadata. The reported warning was
  absent. Embedded identity is `laicasaane.vmde` 1.4.0 with `main: dist/extension.js`.
- Bundle/startup budgets passed at 502/504 KB eager webview, 275/275 eager modules, and 29.4/34 KB
  largest module. Normal, strict-subset, and real-VS-Code type checks passed after correcting the
  existing Task 289 state mock's generic API shape and two strict nullability sites; focused unit
  coverage passed 11/11 with 90.87%/96% line coverage for section-hoist/section-range.
- Focused Chromium `section-hoist.spec.ts` passed 2/2. Focused real VS Code
  `section-hoist.spec.ts webview.spec.ts` passed 2/2, proving bundled activation plus whole-document
  hoist/save behavior. Initial managed runs failed only at sandbox boundaries (`listen EPERM` and
  Electron `sandbox_host_linux.cc:41`); unchanged approved unsandboxed reruns passed.
- `npm run quality` was run once. Brand, lint (787 files), jscpd, and dependency-cruiser stages
  passed. Knip first found the new esbuild entry invisible and passed after its explicit entry was
  registered. The sandboxed audit failed DNS and the full coverage run failed one child spawn with
  `EPERM`; narrow approved recoveries passed: root/webview audits found 0 vulnerabilities, the
  exact-vendor OSV audit found no applicable advisories (the documented Lute/PlantUML-stdlib
  unscannables remain), full coverage passed 225 files / 3,139 tests, and the zero-module ratchet
  stayed at its 15-module baseline. The aggregate was not rerun under the approved no-duplicate
  verification policy.
- Workflow YAML parsing, the 1,889-path brand residual check, `git diff --check`, and independent
  repository-skill path review passed. Automated Marketplace/Open VSX upload commands and token
  variables are absent. The Project Owner retains the only external action: manually upload the
  inspected VSIX. No push or registry action was performed.
