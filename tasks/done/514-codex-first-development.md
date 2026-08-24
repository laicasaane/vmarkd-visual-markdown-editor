# Task 514 — Codex-first development migration

**Status:** DONE · verified and closed 2026-08-24

## Goal

Make Codex the authoritative development agent for this fork while retaining thin,
low-maintenance compatibility entrypoints for Claude Code and GitHub Copilot.

The repository audit found that the existing host/webview application structure is
sound, so no reorganization of that structure is needed for this migration.

## Approved scope

- Make `AGENTS.md` the single repository-wide authority for agent behavior and
  keep `DEVELOPMENT.md` authoritative for exact build and test mechanics.
- Migrate the reusable repository skills to `.agents/skills/` in Codex-compatible,
  tool-neutral form, correcting stale facts against the current repository.
- Keep `CLAUDE.md`, `.claude/skills/`, `.claude/rules/`, and
  `.github/copilot-instructions.md` as concise compatibility pointers to the
  authoritative guidance.
- Keep release and credential guidance safe: never recommend persisting
  Marketplace credentials in tracked files or copying credentials between stores.
- Correct directly conflicting supporting documentation only where required to
  keep the new guidance truthful.

## Explicit non-goals

- Reorganizing `src/`, `media-src/src/`, or the enforced module graph.
- Changing product behavior or extension packaging.
- Rewriting historical task records, including removing or changing their
  historical references to Claude, Copilot, or Codex.
- Duplicating full instruction or skill bodies across agent-specific directories.
- Adding project-local Codex settings that override a contributor’s model,
  sandbox, authentication, or approval preferences.
- Expanding this migration into unrelated release-enforcement gaps found during
  the audit; those require a separate task and user decision.

## Follow-up decision — NOT implemented

`nightly.yml` is described as release-blocking, but the current `release.yml` and
`publish.yml` workflows do not depend on or check its result. The routine **Release**
workflow's `GITHUB_TOKEN` tag push does not trigger nightly; it calls `publish.yml`
directly. An independently/user-pushed tag can start nightly and publishing, but the
runs are independent. This migration corrects active guidance to describe the nightly
result as a manual release criterion; automated enforcement is explicitly not
implemented here and remains a user decision. No release automation was changed and
no separate implementation task was created.

## Acceptance checklist

- [x] `AGENTS.md` is the authoritative repository-wide instruction chain and
      references the real tracked repository skills.
- [x] The five reusable skills are migrated under `.agents/skills/` with current,
      tool-neutral content: `vmarkd-lute-features`, `vmarkd-renderer-theming`,
      `vmarkd-testing`, `vmarkd-visual-debugging`, and `web-design-guidelines`.
      Source retrieval confirms `serializeForHost` lives in `bridge/edit-sync.ts`,
      `wrapLuteFlatten` wraps only the two WYSIWYG methods, and STL has no live
      theme-flip retheme path. The renderer skill also states the current CSP/WASM
      relationship, and headless visual-debugging commands consistently use
      `xvfb-run`.
- [x] `CLAUDE.md`, `.claude/skills/`, `.claude/rules/`, and
      `.github/copilot-instructions.md` point to authoritative guidance instead
      of maintaining duplicate instruction bodies.
- [x] Active guidance contains no obsolete Claude-only delegation, `foy`, unsafe
      credential-storage advice, fixed real-VS-Code test counts, or stale
      Playwright facts.
- [x] Local publishing guidance requires a clean, checked-out `main` exactly
      synchronized with `origin/main` and warns that `npm run pub` does not
      enforce branch or working-tree safety itself.
- [x] All migrated skill metadata and internal links validate.
- [x] The host/webview application structure remains unchanged.
- [x] Supporting documentation changes stay within the approved scope.

## Verification checklist

- [x] Confirm every path and command named in `AGENTS.md` exists.
- [x] Confirm Claude and Copilot compatibility files point to authoritative
      guidance rather than duplicate it.
- [x] Search active guidance for obsolete Claude-only delegation, `foy`, unsafe
      credential storage, fixed real-VS-Code test counts, and stale Playwright
      facts.
- [x] Validate migrated skill metadata and internal links.
- [x] Compare the corrected `serializeForHost`, `wrapLuteFlatten`, and STL
      retheme guidance directly with their cited current source files.
- [x] Confirm active guidance contains no pinned real-VS-Code suite/tier counts
      and that local publishing guidance states its branch-safety precondition.
- [x] Run `npm run lint:ci` and `npm run quality`, recording pre-existing and
      task-related failures separately.
- [x] Inspect `git diff` and this task tracker so only approved scope is included.

## Verification record

- `npm run lint:ci` passed (one existing non-fatal unused-parameter warning and
  one Biome deprecation notice).
- The first sandboxed `npm run quality` reached every non-network stage, but its
  `npm audit` stage could not resolve `registry.npmjs.org` (`EAI_AGAIN`). Retrying
  the full command with the required network permission found zero vulnerabilities
  in both audited package trees and passed all seven stages. This was an execution
  environment networking limitation, not a pre-existing or migration-caused
  repository failure.
- All five migrated skills passed the quick validator. Targeted retrieval checks
  matched the skills to `media-src/src/bridge/edit-sync.ts`,
  `media-src/src/editing/wysiwyg-code-highlight.ts`,
  `media-src/src/diagram-kit/engine-registry.ts`, and
  `media-src/src/diagrams/diagram-retheme.ts`.
- Stale-guidance, fixed-count, and unsafe-release searches were clean; required
  paths, 16 referenced root npm scripts, and 19 local Markdown links across 22
  changed Markdown files validated.
