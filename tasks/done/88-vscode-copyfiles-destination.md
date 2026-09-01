# Task: Support VS Code's `markdown.copyFiles.destination` for the image save path

> **Status:** ✅ COMPLETED (2026-09-01)
> **Source:** VS Code built-in Markdown — [Inserting images and links to files](https://code.visualstudio.com/docs/languages/markdown#_inserting-images-and-links-to-files)
> **Value / Risk:** 🟢 settings interop — users who already configured the built-in Markdown editor get the same image destination in VMDE with zero extra config / low (read-only consumption of a stable, documented setting)

## Problem
When an image is pasted/dropped into the built-in Markdown editor, VS Code copies it to the
location configured by **`markdown.copyFiles.destination`** — a glob→path map with its own
variable set (`${documentDirName}`, `${documentBaseName}`, `${documentWorkspaceFolder}`,
`${fileName}`, …) and optional snippet-style transforms.

VMDE's upload path ignores that setting entirely: `MarkdownEditorProvider.getAssetsFolder`
(`src/extension.ts:1525`) only reads our own `vmde.image.saveFolder` with a different,
smaller token set (`${projectRoot}`, `${file}`, `${fileBasenameNoExtension}`, `${dir}`).
A user who set up `markdown.copyFiles.destination` for the native editor gets images saved
to a *different* folder the moment they paste inside VMDE — silent config divergence.

## Goal
Pasting/dropping an image into VMDE lands in the same folder the built-in Markdown editor
would use, honoring `markdown.copyFiles.destination` (glob matching + its variables), without
breaking existing `vmde.image.saveFolder` configs.

## Design notes
- **Precedence** (proposal): explicit `vmde.image.saveFolder` (non-default) →
  `markdown.copyFiles.destination` (first matching glob) → default `assets`. Document it in
  the `saveFolder` setting description.
- **No public API** resolves the setting — VS Code's logic lives in its bundled
  `markdown-language-features` extension. We re-implement: read the map via
  `workspace.getConfiguration('markdown', uri).get('copyFiles.destination')`, match the
  document path against the glob keys, expand variables.
- **Glob matching**: zero-deps posture (see task 45) — either a small hand-rolled matcher for
  the common subset (`**`, `*`, `?`) or vendor a micro-matcher with license shipping (mirror
  the Mermaid/Lute vendoring pattern). Decide in step 1.
- **Variables**: support at least `${documentDirName}`, `${documentRelativeDirName}`,
  `${documentFileName}`, `${documentBaseName}`, `${documentExtName}`,
  `${documentWorkspaceFolder}`, `${fileName}`, `${fileExtName}`. Snippet transforms
  (`${documentBaseName/(.*)/${1:/lowercase}/}`) are optional — log + skip if too costly.
- A destination value ending in `/` is a directory; otherwise the last segment can rename
  the file (`${fileName}` interpolation) — `getAssetsFolder` currently returns a folder only,
  so the rename case needs a small upload-path extension or explicit non-support (documented).

## Steps
1. **Spike** the matcher decision (hand-rolled vs vendored micro-glob) against real
   `copyFiles.destination` examples from the docs.
2. Implement resolution in/next to `getAssetsFolder` (`src/extension.ts:1525`): glob match →
  variable expansion → absolute folder; keep the existing `saveFolder` path untouched.
3. Wire precedence + update the `vmde.image.saveFolder` description in `package.json`
   (mention the interop and precedence).
4. Unit tests (vitest, `test/backend/`): glob matching, each variable, precedence,
   multi-root workspace (`scope: resource` — per-folder overrides), no-match fallback.
5. CHANGELOG entry (fork-vs-original style: "honors VS Code's
   `markdown.copyFiles.destination`").

## Verify
With `"markdown.copyFiles.destination": { "/docs/**/*": "images/${documentBaseName}/" }` and
no `vmde.image.saveFolder` override, pasting an image into `docs/guide.md` inside VMDE
saves it under `docs/images/guide/` and inserts the matching relative link — identical to
what the built-in Markdown editor does. With an explicit `vmde.image.saveFolder`, the old
behavior wins.

## See also
- `src/extension.ts:1525` — `getAssetsFolder` (current `saveFolder` token expansion).
- `media-src/src/main.ts` upload handler — inserts `![](relpath)` after host saves the file.
- Task 32 (link/image path autocomplete), task 74 (WebP conversion on upload) — same path.
- VS Code docs: https://code.visualstudio.com/docs/languages/markdown#_inserting-images-and-links-to-files

## Completion evidence

- The matcher/variable decision was checked against both the current official documentation and
  the bundled VS Code 1.129.0 `markdown-language-features` implementation used by the real test
  runner. VMDE keeps its zero-runtime-dependency posture with a focused matcher for the documented
  `**`, `*`, `?`, brace, and character-class forms; leading workspace globs, implicit `**/`, first
  match ordering, dot paths, malformed-glob fail-closed behavior, and multi-root expansion are
  covered directly.
- The destination resolver mirrors the current built-in behavior: trim/empty handling, leading
  workspace-root paths, trailing-directory `${fileName}` appending, document-relative resolution,
  all documented document/file variables, current `${unixTime}` / `${isoTime}`, escaped dollars,
  and simple slash-escaped regex transforms. The resolver returns a complete target so destination
  templates can rename files as well as choose folders.
- Precedence is explicit and backward-compatible: any non-default `vmde.image.saveFolder` keeps the
  legacy token path; otherwise the first resource-scoped `markdown.copyFiles.destination` match
  wins; no match falls back to `assets`. The settings description and 1.4.0 changelog state this
  contract. Upload names are still reduced to a safe basename before interpolation, directory
  creation is deduplicated per target set, trust/virtual-workspace gates remain unchanged, and the
  inserted href is computed from the actual renamed target.
- RED evidence began with the missing resolver module. The final focused unit/module/manifest set
  passes 141/141 across globs, variables, transforms, multi-root/resource scope, precedence,
  no-match fallback, rename output, unsafe names, write bytes, configuration declarations, and the
  existing upload controls. Repository coverage reports `copy-files-destination.ts` at 96.80%
  statements / 91.66% branches / 100% functions / 98.76% lines.
- The permanent real-VS-Code journey sets the actual built-in setting, pastes a real PNG File,
  writes it under `docs/images/guide/`, inserts the exact `images/guide/<final-name>` image href,
  saves the source, and restores both global settings in `finally`. Its first run's product path
  completed but the test's restoration argument could not serialize `undefined`; JSON-encoding the
  prior values fixed that harness defect. The corrected journey passes 1/1 with no retries, while
  the unchanged default-assets image control passed 1/1 in the initial combined run.
- Build, all typechecks, module boundaries, whole-tree lint, the 601 KB / 601 KB bundle budget, and
  the 289-module / 29.5 KB startup budgets pass. The first aggregate run exposed only that the
  config-key ratchet treated the newly consumed built-in key as an undeclared VMDE key; its external
  Markdown allowlist now covers both `preview.fontFamily` and `copyFiles.destination`. The final
  `npm run quality` run passes brand checks, lint, duplication, dependency rules, audits, 254
  coverage files / 3,701 tests, and the 13-module ratchet at 77.01% statements / 69.39% branches /
  80.00% functions / 79.07% lines. Its sole residual remains the pre-existing Knip report for
  unlisted `yazl` in `test/backend/package-local-preview-core.test.ts`, owned by Task 541.
