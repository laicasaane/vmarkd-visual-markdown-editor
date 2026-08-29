# Task 519 — Complete `vmde` rebrand and identifier migration

> **Status:** ✅ DONE — implemented and verified 2026-08-29; closed in the final atomic commit.
> **Impact:** 🔴 breaking extension-identity and public-contract migration.
> **Depends on:** task 518 must be closed first so this repository-wide rename does not overlap its
> atomic dependency/vendor working tree.
> **Atomicity:** manifest, runtime, webview, tests, documentation, release automation, tracker
> closure, and the final implementation commit complete together; do not ship or hand off a
> partially renamed tree.

**Goal:** Replace the former product identifier with `vmde` everywhere it is an active extension,
configuration, runtime, DOM/CSS, test, tooling, package, or release contract.

**Architecture:** Make a clean break with one canonical namespace. Centralize the extension's core
identity constants, mechanically update every consumer, and enforce the result with an automated
residual scan plus manifest and real-VS-Code acceptance tests. Do not register, read, migrate, or
document deprecated aliases as supported behavior.

**Tech stack:** VS Code extension manifest, TypeScript/CommonJS host, ESM browser webview, CSS,
Node tooling, Vitest, Playwright Chromium, `vscode-test-playwright`, GitHub Actions, VSCE, Open VSX.

**Spec:** The Project Owner selected `vmde` on 2026-08-28 and explicitly rejected retention of
deprecated `vmarkd` identifiers. `DEVELOPMENT.md` remains command authority. VS Code defines the
extension identity as `${publisher}.${name}`, so the manifest target is `laicasaane.vmde`:
<https://code.visualstudio.com/api/references/extension-manifest>.

## 1. Breaking contract.

The completed task must implement these exact canonical values:

| Contract | Canonical value |
|---|---|
| Package name | `vmde` |
| VS Code / Marketplace / Open VSX extension ID | `laicasaane.vmde` |
| Settings root | `vmde` |
| Example setting | `vmde.editor.defaultMode` |
| Command prefix | `vmde.` |
| Custom editor view type | `vmde.editor` |
| Outline view ID | `vmde.outline` |
| Context-key prefix | `vmde.` |
| Extension state-key prefix | `vmde.` |
| Webview CSS class / custom-property / data-attribute prefix | `vmde` / `--vmde-` / `data-vmde-` |
| Webview global prefix | `__vmde` |
| Environment-variable prefix | `VMDE_` |
| D2 enhanced-layout setting value | `vmde` |
| Real-VS-Code harness package | `vmde-vscode-e2e` |
| VSIX basename | `vmde-<version>.vsix` |
| GitHub repository target | `laicasaane/vmde` |

This is intentionally breaking:

- Do not contribute deprecated settings or legacy custom editors.
- Do not register old command, view, or context-key aliases.
- Do not dual-read old configuration or extension state.
- Do not translate the old D2 layout value.
- Do not ship a bridge extension or automatic settings mutation.
- Existing user/workspace settings, keybindings, editor associations, synced extension state, and
  commands using the former IDs stop applying. State this plainly in the release notes.
- The new extension ID has a separate Marketplace identity and extension-local storage. Do not
  claim that it upgrades or migrates the old installation automatically.

Historical evidence is not a compatibility surface. Leave immutable history under `tasks/done/`
and `docs/superpowers/` intact. Historical `CHANGELOG.md` entries may retain accurate old release
facts beneath a new top-level breaking-change notice. The task file itself and the release notice
may name former identifiers solely to explain the break. No such token may remain in active
manifest, runtime, test, workflow, current guidance, or open-task contracts.

## 2. Global constraints.

- Preserve the Project Owner's existing uncommitted `package.json` change to `"name": "vmde"`;
  treat it as the first intended line of this task, not as unrelated drift to overwrite.
- Do not begin implementation until task 518 is closed and its atomic commit is complete.
- Read `.agents/rules/ts.md` and `.agents/rules/css.md` before changing matching files.
- Do not edit generated output in `out/`, `media/dist/`, `media/vditor/dist/`, or
  `media/vditor-icons.js`; update source/build inputs and regenerate only for local verification.
- Preserve user-visible behavior, layout, styling, Markdown bytes, and command semantics. This task
  changes identity and naming, not editor behavior.
- Keep `LOCAL_AGENT_TASK.md` untracked, unstaged, uncommitted, and unchanged.
- Do not push, rename a remote, publish an extension, create a release, or modify Marketplace,
  Open VSX, or GitHub state. Those owner-authority actions are explicit handoff items in section 7.
- Use one cumulative working tree and one final focused implementation commit. Partial identifier
  migrations are not independently usable or reviewable.

## 3. Implementation and verification checklist.

### 3.1. Establish identity authorities and a failing residual gate.

**Files:**

- Create: `src/shared/product-identity.ts`
- Delete after consumer migration: `src/shared/editor-view-type.ts`
- Create: `scripts/check-brand-identifiers.mjs`
- Create: `test/backend/product-identity.test.ts`
- Modify: `package.json`
- Modify: `scripts/quality.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/pr-webview-smoke.yml`

**Interfaces:**

- `src/shared/product-identity.ts` exports exact string constants
  `ExtensionId = 'laicasaane.vmde'`, `ConfigurationRoot = 'vmde'`,
  `MarkdownEditorViewType = 'vmde.editor'`, and `OutlineViewId = 'vmde.outline'`.
- `npm run check:brand-identifiers` invokes `scripts/check-brand-identifiers.mjs` and exits nonzero
  for former-brand tokens in active files.

- [x] Add `product-identity.test.ts` assertions for all four constants and prove the existing tree
      fails because `product-identity.ts` and the canonical values do not yet exist.
- [x] Add `check-brand-identifiers.mjs`. Scan tracked active code and configuration rather than
      generated output. Forbid former-brand spellings and case variants in `package.json`, lockfiles,
      `src/`, `media-src/src/`, build scripts, `scripts/`, `.github/`, `test/`, `README.md`,
      `DEVELOPMENT.md`, `AGENTS.md`, `.agents/`, and open/parked task contracts. Exclude
      `tasks/done/`, `docs/superpowers/`, this task, and the explicitly marked historical portion of
      `CHANGELOG.md`.
- [x] Make every allow-list entry path- and reason-specific. Reject a broad substring or directory
      exception that could hide a new runtime alias.
- [x] Add `check:brand-identifiers` to `package.json`, `scripts/quality.mjs`, CI, and the PR webview
      smoke workflow so the clean namespace cannot regress after this task.
- [x] Run the new unit test and brand check RED. Record the representative failures in section 6;
      do not weaken the check to make the baseline green.

### 3.2. Rename the package, manifest, host, and persisted contracts.

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/shared/product-identity.ts`
- Modify: `src/shared/format-hotkeys.ts`
- Modify: `src/platform/editor-config.ts`
- Modify: `src/platform/state-keys.ts`
- Modify: `src/platform/tab-targeting.ts`
- Modify: `src/app/commands.ts`
- Modify: `src/app/extension.ts`
- Modify: `src/app/markdown-editor-provider.ts`
- Modify: `src/app/status-bar.ts`
- Modify: `src/markdown/outline-tree.ts`
- Modify: `src/session/editor-session.ts`
- Modify: `src/session/asset-link-actions.ts`
- Modify: `src/wiki/wiki.ts`
- Modify: `src/wiki/wiki-session.ts`
- Modify: every remaining tracked host file returned by the brand check
- Modify: affected `test/backend/*.test.ts`

**Interfaces:**

- All manifest settings become `vmde.*`; their suffixes, defaults, scopes, enum values, ordering,
  descriptions, and Markdown setting links otherwise stay unchanged.
- Every contributed and registered extension command uses `vmde.*` with identical behavior.
- The custom editor, outline view, context keys, Settings filter, and extension lookup use the
  constants from `product-identity.ts` where a shared authority is possible.
- Global state keys become `vmde.options` and `vmde.outlineWidth`; `setKeysForSync` contains only
  those new keys.

- [x] Update the root lockfile through npm metadata generation so both root `name` fields equal
      `vmde`; do not hand-edit dependency versions.
- [x] Rename every manifest activation event, command, menu reference, keybinding, custom editor,
      view, `when` clause, context key, setting key, setting cross-link, keyword, and extension ID.
- [x] Replace host configuration reads and `affectsConfiguration` checks with the `vmde` root.
- [x] Rename host symbols whose active names carry the former brand, including configuration helper
      and target-selection names; update imports and comments without changing behavior.
- [x] Replace state and cache names, including the temporary diagram-cache directory. Do not read,
      copy, or delete the previous namespace.
- [x] Update unit mocks and assertions to prove new settings, commands, view type, context keys,
      extension ID, and synced state keys. Add negative assertions showing former IDs are absent from
      the manifest and command registrations.
- [x] Run focused manifest, configuration, command, extension, tab-targeting, status-bar, wiki, and
      asset-link tests GREEN.

### 3.3. Rename the webview, renderer, and build-time namespace.

**Files:**

- Modify: `media-src/src/**/*.ts`
- Modify: `media-src/src/**/*.css`
- Modify: `media-src/esbuild-shared.mjs`
- Modify: `media-src/build.mjs`
- Modify: `build.mjs`
- Modify: `media/markdown-themes/*.css`
- Modify: relevant vendored-source patch tests in `test/backend/`
- Rename: `media/vmarkd.png` to `media/vmde.png`

**Interfaces:**

- Internal and test-visible browser globals use `window.__vmde*` consistently in source and every
  anchored Vditor patch.
- Extension-owned classes, IDs, data attributes, dataset properties, CSS variables, temporary
  markers, generated symbol names, and diagnostics use the `vmde` namespace.
- Build-time define names and environment gates use `VMDE_*`.
- The D2 setting remains the same three-choice behavior, but its enhanced/default value is `vmde`
  instead of the former branded value; `dagre` and `elk` remain unchanged.

- [x] Rename CSS selectors and the TypeScript that creates or queries them in the same patch. Keep
      declaration values and selector specificity unchanged.
- [x] Rename every custom property in Vditor palette rewriting, content themes, runtime CSS, and
      documentation together. Confirm named themes and `auto` still resolve identical colors.
- [x] Rename all `data-*` markers and corresponding `dataset` property accesses atomically.
- [x] Rename webview globals and every source-patch anchor/replacement in
      `media-src/esbuild-shared.mjs`; update `vditor-source-patches.test.ts` so every patch still
      fails loudly on anchor drift.
- [x] Rename build defines, test seams, cache keys, diagnostic prefixes, temporary identifiers, and
      environment variables without leaving a mixed namespace.
- [x] Change the D2 layout enum/default, resolver, renderer branching, harnesses, and documentation
      to the exact `vmde` value. Do not accept the former value.
- [x] Rename extension-owned TypeScript types and functions, including `VmarkdConfigOptions`, while
      preserving protocol field names and serialized message shapes that are not branded.
- [x] Rename the README image source file and all references using a real file move; do not duplicate
      the image under two names.
- [x] Run the source-patch, theming, D2, DOM-decoration, webview-overlay, and bundle-budget tests
      GREEN before proceeding.

### 3.4. Update every test harness and add real-VS-Code identity acceptance.

**Files:**

- Modify: `test/vscode-e2e/package.json`
- Modify: `test/vscode-e2e/package-lock.json`
- Modify: `test/vscode-e2e/playwright.config.ts`
- Modify: `test/vscode-e2e/webview-helpers.ts`
- Create: `test/vscode-e2e/identifier-contract.spec.ts`
- Modify: all affected `test/vscode-e2e/*.spec.ts` and fixtures
- Modify: affected `media-src/e2e/*.spec.ts` and harnesses
- Modify: affected `test/backend/*.test.ts`
- Modify: affected workflow environment variables and cache keys under `.github/workflows/`

**Interfaces:**

- `webview-helpers.ts` exports the canonical extension ID and editor view type for real-VS-Code
  specs so new tests do not repeat identity literals.
- `identifier-contract.spec.ts` proves the installed development extension is `laicasaane.vmde`,
  opens Markdown through `vmde.editor`, applies `vmde.editor.defaultMode`, and observes only new
  commands/context contributions.

- [x] Rename the harness package and lockfile to `vmde-vscode-e2e` through npm metadata generation.
- [x] Replace direct extension-ID, editor-type, command, setting, environment, DOM selector, global,
      and fixture literals throughout all test layers. Prefer the shared helper for extension ID and
      view type instead of recreating a repository-wide literal problem.
- [x] Write `identifier-contract.spec.ts` with one VS Code boot and multiple legs: activate
      `laicasaane.vmde`; assert the old extension lookup is absent; set
      `vmde.editor.defaultMode = 'sv'`; open through `vmde.editor`; assert the SV surface; execute a
      representative `vmde.*` command; and prove representative old command IDs are absent from
      `vscode.commands.getCommands(true)`.
- [x] Add manifest/unit assertions that no old settings, commands, custom editors, views, context
      keys, package names, or extension IDs remain.
- [x] Run `node build.mjs`, the complete Chromium suite, and the focused identity spec. Chromium is
      required because DOM/CSS/global names changed; it does not replace the real webview test.
- [x] Run the real-VS-Code FAST tier during iteration and the full real-VS-Code suite before closure.
      Record retries and flakes honestly.

### 3.5. Rename current documentation, repository skills, tooling, and release surfaces.

**Files:**

- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `DEVELOPMENT.md`
- Modify: `AGENTS.md`
- Rename and modify: `.agents/skills/vmarkd-*` to `.agents/skills/vmde-*`
- Modify: `.agents/rules/*.md` where matched by the brand check
- Modify: `skills-lock.json`
- Modify: `scripts/*.mjs` and `scripts/*.sh` returned by the brand check
- Modify: `.github/workflows/*.yml`
- Modify: `media-src/src/chrome/toolbar.ts`
- Modify: open `tasks/*.md` and `tasks/parked/*.md` that specify active identifiers
- Modify at final closure only: `tasks/README.md`

**Interfaces:**

- Current install instructions use `laicasaane.vmde`.
- Current repository links use `https://github.com/laicasaane/vmde`.
- Local package instructions and publish automation emit `vmde-<version>.vsix`.
- Repository skill names, directories, links, and examples use `vmde-*` consistently.

- [x] Add a top `CHANGELOG.md` breaking-change entry listing the new extension ID, settings root,
      editor ID, command prefix, lack of compatibility aliases, loss of old extension-local state,
      and manual installation/configuration impact. Do not rewrite accurate historical entries.
- [x] Update current README install, settings, acknowledgements, issue, image, and repository links.
- [x] Update `DEVELOPMENT.md` commands, environment variables, IDs, CSS variables, D2 value,
      package filename, release guidance, and repository map.
- [x] Rename repository-local skill directories and their frontmatter/catalog links. Verify every
      relative link after the move and update `skills-lock.json` compatibility metadata.
- [x] Update active and parked task contracts so future work targets `vmde`; do not alter completed
      task evidence merely to erase history.
- [x] Update workflow cache keys, environment names, artifact names, and publish commands. Package a
      local VSIX under `tmp/` and inspect its embedded manifest for `laicasaane.vmde` inputs.
- [x] Run the brand check GREEN with only the documented historical/explanatory exceptions.

### 3.6. Final verification, closure, and commit.

- [x] Run metadata and focused contract checks:

```bash
npm run check:brand-identifiers
npx vitest run --config test/vitest.config.ts test/backend/product-identity.test.ts test/backend/manifest.test.ts test/backend/config-keys.test.ts test/backend/extension.test.ts test/backend/commands-and-handlers.test.ts test/backend/format-hotkeys.test.ts test/backend/status-bar.test.ts test/backend/vditor-source-patches.test.ts
git diff --check
```

- [x] Run the complete static, build, coverage, and quality gates:

```bash
npm run lint:ci
node build.mjs
npm run check:bundle-size
npm run check:startup-cost
npm run typecheck
npm run typecheck:strict
npm run typecheck:vscode-e2e
npm run test:coverage
npm run check:coverage-modules
npm run quality
```

- [x] Run browser and real-VS-Code acceptance in sequence; never run two real-VS-Code invocations
      concurrently:

```bash
xvfb-run -a npm --prefix media-src run test:e2e
env -u ELECTRON_RUN_AS_NODE xvfb-run -a npm --prefix test/vscode-e2e test -- identifier-contract.spec.ts
env -u ELECTRON_RUN_AS_NODE xvfb-run -a npm run test:vscode:fast
env -u ELECTRON_RUN_AS_NODE xvfb-run -a npm run test:vscode
```

- [x] Package and inspect a local artifact without publishing it:

```bash
npx @vscode/vsce package --out tmp/vmde-test.vsix
unzip -p tmp/vmde-test.vsix extension/package.json | jq '{name,publisher,activationEvents}'
```

Expected embedded identity: `name` is `vmde`, `publisher` is `laicasaane`, and activation events use
only `vmde` contribution IDs.

- [x] Inspect `git diff --stat`, `git diff`, and `git status --short`. Exclude generated output,
      unrelated changes, and `LOCAL_AGENT_TASK.md`. Confirm no old runtime alias or migration path
      entered the patch.
- [x] Fill section 6 with exact commands, outcomes, retries, residuals, and owner-action status.
- [x] Move this file to `tasks/done/`, add the completed task to `tasks/README.md`, repair relative
      links after the move, and rerun the brand/link/whitespace checks.
- [x] Stage only the atomic rebrand and closure files. Confirm `LOCAL_AGENT_TASK.md` is absent from
      the staged path manifest, then create one local commit:

```bash
git commit -m "feat: complete vmde rebrand"
```

Do not push; report the local commit hash for the Project Owner.

## 4. Acceptance criteria.

- `package.json.name` and both root lockfile name fields are `vmde`.
- The extension loads as `laicasaane.vmde`, and the packaged VSIX has that identity.
- Every active setting uses `vmde.*`; `vmde.editor.defaultMode` works in real VS Code.
- Every extension-owned command, view type, view ID, context key, state key, D2 branded value,
  environment variable, DOM/CSS marker, browser global, package name, and artifact name uses `vmde`.
- No deprecated setting, command, custom editor, view, state, enum, or runtime fallback is retained.
- No generated artifact or unrelated user change is committed.
- Unit coverage, Chromium, focused identity, FAST, full real-VS-Code, packaging, brand scan, and
  routine quality gates pass with exact evidence recorded.
- Current docs and repository-local skills teach only the canonical namespace. Historical facts are
  preserved only in explicitly excluded history and the breaking-change explanation.
- Owner-only Marketplace/Open VSX/GitHub steps are reported as external handoff items, not falsely
  claimed complete by local code changes.

## 5. Out of scope.

- Preserving old installations, settings, keybindings, editor associations, state, command IDs, or
  D2 values.
- Publishing, unpublishing, redirecting, or deleting Marketplace/Open VSX listings.
- Renaming the Git remote or GitHub repository directly from the implementation agent.
- Rewriting completed task history or archived Superpowers specifications.
- Behavioral refactors, feature changes, dependency upgrades, or generated/vendor-byte edits not
  required by the identifier rename.

## 6. Execution evidence.

### RED baseline

- `npx vitest run --config test/vitest.config.ts test/backend/product-identity.test.ts` failed before
  implementation because `src/shared/product-identity.ts` did not exist.
- The first decision-grade `npm run check:brand-identifiers` failed with 3,493 active-tree
  violations across runtime, manifest, tests, current guidance, workflows, and open task contracts.
  The scanner was corrected before migration so `svMarkdown` was not a false positive and so text
  files containing an intentional NUL byte were still scanned.

### Focused GREEN evidence

- The required focused host/manifest command passed; after the review-driven identity-authority
  cleanup the expanded focused set passed 11 files / 404 tests. Wiki and asset-link coverage also
  passed separately at 7 files / 102 tests.
- Webview-focused unit coverage passed for theming, D2, DOM decoration, overlays, toolbar, callouts,
  and anchored Vditor source patches. One RED D2 mask-ID assertion exposed a NUL-containing source
  file skipped by the first mechanical pass; `d2-render.test.ts` then passed 102/102 and the callout
  focused set passed 50/50.
- `npm run typecheck`, `npm run typecheck:strict`, `npm run typecheck:vscode-e2e`, and
  `node scripts/module-manifest.mjs` passed. The final review-driven host constant composition was
  rebuilt and rechecked with focused Vitest, typecheck, e2e typecheck, lint, brand, and whitespace
  gates.
- `node build.mjs` passed on the final source tree. `npm run check:bundle-size` passed all five
  budgets and `npm run check:startup-cost` passed at 273/273 eager modules and 29.4/34 KB for the
  largest eager module.
- Focused Chromium identity/namespace surfaces passed 114/114. The first command accidentally mixed
  the Chromium and real-VS-Code Playwright installations because it ran discovery from the root;
  rerunning from `media-src/` fixed the command boundary. The sandbox then blocked the local server
  with `listen EPERM`; the identical unsandboxed command passed.
- The focused real-VS-Code identity contract passed 1/1 in 7.6 seconds. Its first sandboxed launch
  and configured retry were both blocked by Electron `sandbox_host_linux.cc` EPERM; the unchanged
  unsandboxed run passed.

### Final gates and evidence boundary

- The single permitted `npm run quality` run passed brand, knip, jscpd, dependency-cruiser, root /
  webview / vendor audits, 220 unit files / 3,081 tests with coverage, and the zero-coverage-module
  ratchet. Its aggregate exit was 1 only because the mechanical rename needed Biome formatting.
  `npm run format` fixed 232 files and the only failed stage, `npm run lint:ci`, then passed. The
  already-passing quality stages were not redundantly rerun. Later test-harness-only cleanup did not
  change covered product source; e2e typecheck and lint were rerun on that final tree.
- `npm run audit:vscode-e2e` initially hit sandbox DNS `EAI_AGAIN`; the identical network-enabled
  rerun reported 0 vulnerabilities.
- The one complete Chromium run passed 492 tests with 5 intentional skips in 2.2 minutes.
- The one full real-VS-Code run exited 0 in 47.4 minutes: 249 passed, 2 intentional skips, and 4
  retry-recovered cases. Diagnosis found leaked global test settings behind the D2 stylesheet and
  Preview-spacing retries, and a too-early fixture-content read behind the soft-break retry. Those
  harness boundaries were fixed. The affected set then passed 5/5 in one 2.0-minute invocation with
  `--retries=0`, including the independently transient undo/redo case. Per the approved budget, the
  broad suite was not rerun for a pristine log.
- FAST and SMOKE were not run separately: the final full real-VS-Code tier is their approved
  superset. `test:coverage`, coverage-module ratchet, audits, knip, jscpd, and dependency-cruiser were
  not repeated outside the quality run merely to duplicate evidence.
- The final staged-tree `npm run check:brand-identifiers` passed across 1,874 candidate paths. Its only
  exclusions are immutable `tasks/done/`, immutable `docs/superpowers/`, and explicitly delimited
  explanatory/historical blocks in `CHANGELOG.md`. Current Unreleased notes, ADRs, repository
  skills, and all other active docs remain scanned.
- The final local package used an ignored temporary VSCE ignore file because the protected untracked
  operator task must not be added to tracked ignore rules. The first package inspection caught that
  local file inside the VSIX; the corrected final artifact contains 506 files, excludes the operator
  task and former-brand paths, and embeds `name: vmde`, `publisher: laicasaane`, and only `vmde`
  activation events. Nothing was published.
- Final `git diff --check` passed. Generated build output remained unstaged. The unrelated `LICENSE`
  change and untracked `LOCAL_AGENT_TASK.md` are excluded from the atomic commit.

### Residuals and owner actions

- The migration intentionally does not read or translate deprecated settings, commands, state,
  editor associations, or D2 values. Users must install the new extension identity and reapply the
  configuration they want.
- GitHub repository rename/creation, Marketplace and Open VSX listings, old-listing policy, external
  secrets/badges/protection updates, pushing, and release publication remain Project Owner actions
  exactly as listed in section 7.
- Final commit: `feat: complete vmde rebrand`; its hash is reported in the handoff because a commit
  cannot contain its own hash.

## 7. Project Owner release handoff.

After the local task is complete, the Project Owner must coordinate externally visible actions:

1. Rename or create the GitHub repository at `laicasaane/vmde` and confirm redirects/policies.
2. Create and verify the `laicasaane.vmde` listing in VS Marketplace and Open VSX.
3. Decide whether to leave, deprecate, unpublish, or otherwise communicate the old listing. Do not
   ship a compatibility bridge from this repository.
4. Update repository secrets, branch protection, badges, external links, and release automation
   settings that cannot be changed by a local commit.
5. Push the implementation commit and run the full release process only after a green nightly gate.

These actions are not complete merely because local URLs and identifiers have changed.
