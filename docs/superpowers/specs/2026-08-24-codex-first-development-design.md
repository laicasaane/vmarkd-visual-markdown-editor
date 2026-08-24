# Codex-First Development Design

**Date:** 2026-08-24
**Status:** Approved

## Goal

Make Codex the authoritative development agent for this fork while retaining thin, low-maintenance compatibility entrypoints for Claude Code and GitHub Copilot.

## Current State

The repository already has a sound application structure: a CommonJS VS Code extension host under `src/`, an ESM browser webview under `media-src/src/`, explicit module boundaries in `scripts/module-manifest.mjs`, and separate Vitest, Chromium, and real-VS-Code test layers. No application-source reorganization is required for Codex.

Agent guidance is fragmented. `AGENTS.md` contains useful testing rules but ends with a Claude-specific method for invoking a separate Codex CLI. `CLAUDE.md` forwards to `AGENTS.md`; `.github/copilot-instructions.md` contains stale and unsafe release guidance; and five valuable repository skills live only under `.claude/skills/`. Several of those skills contain outdated paths, dependency versions, retry counts, test-tier sizes, or coverage facts.

## Chosen Architecture

### Authoritative instruction chain

`AGENTS.md` is the single repository-wide authority for agent behavior. It will:

- direct Codex to read `DEVELOPMENT.md` before implementation;
- map the two compilation units and their generated outputs;
- define task-file lifecycle and scope discipline;
- explain which test layer applies to each kind of change;
- require coverage inspection, focused verification, and `npm run quality` at task completion;
- describe safe handling of generated, vendored, secret, and user-owned files;
- explain when parallel Codex subagents are useful and require the primary agent to integrate and verify their findings;
- reference repository-local skills by their real tracked paths; and
- avoid volatile test counts or duplicated release procedures.

`DEVELOPMENT.md` remains authoritative for exact commands and detailed build/test mechanics. `AGENTS.md` summarizes the workflow and links to it instead of maintaining a second copy of facts that change frequently.

### Repository-local skills

The reusable project skills will live under `.agents/skills/<skill-name>/SKILL.md`, using Codex-compatible skill layout and tool-neutral wording:

- `vmarkd-lute-features`
- `vmarkd-renderer-theming`
- `vmarkd-testing`
- `vmarkd-visual-debugging`
- `web-design-guidelines`

Their technical content will be preserved, but stale statements will be corrected against the current source tree, package manifests, Playwright configurations, and CI workflows. Instructions that name Claude-only tools will be rewritten in terms of capabilities available to Codex.

### Compatibility layer

Compatibility files remain deliberately small:

- `CLAUDE.md` continues to forward Claude Code to `AGENTS.md`.
- `.claude/skills/` and `.claude/rules/` remain as compatibility pointers to the authoritative `.agents/` content rather than independent copies.
- `.github/copilot-instructions.md` becomes a concise pointer to `AGENTS.md` and `DEVELOPMENT.md`; it will not duplicate credential or release procedures.

This keeps other agents usable without allowing their instruction copies to drift from Codex guidance.

### Release and credential guidance

Agent instructions must never recommend persisting Marketplace credentials in tracked files or copying credentials between stores. Release behavior is defined by the checked-in workflows and release scripts, with detailed human-facing instructions kept in `DEVELOPMENT.md` or a dedicated release document. Stale Copilot-only release text is removed from the compatibility file.

This migration will flag, but not silently expand into, unrelated release-enforcement gaps discovered during the audit. Any such implementation requires its own task and user decision.

## Workflow for Codex

For each implementation task, Codex should:

1. Read `DEVELOPMENT.md`, the active task file, and applicable repository skills.
2. Inspect current source, tests, configuration, and relevant history before proposing structural changes.
3. Preserve unrelated working-tree changes and avoid editing generated output.
4. Use subagents for independent, read-heavy research or isolated plan tasks when requested or materially useful; keep concurrent writes narrowly partitioned.
5. Implement the smallest coherent change, adding tests at the layers required by the behavior.
6. Build before real-VS-Code testing and use `xvfb-run` for browser/electron tests.
7. Inspect coverage for changed behavior, run applicable focused gates, then run `npm run quality` at task completion.
8. Update the authoritative task file honestly, including incomplete acceptance items or failing gates; update `tasks/README.md` only when fully complete.
9. Report changed files, verification evidence, and any remaining risks without claiming success beyond the evidence.

Documentation-only work uses proportionate validation: path/link checks, consistency searches, formatting/lint when applicable, and repository quality checks. It does not add artificial runtime tests for prose.

## Files and Boundaries

Planned authoritative changes:

- `AGENTS.md`
- `.agents/skills/**`
- neutral rule guidance under `.agents/`

Planned compatibility changes:

- `CLAUDE.md` only if its forwarding syntax needs clarification
- `.claude/skills/**`
- `.claude/rules/**`
- `.github/copilot-instructions.md`
- `.vscodeignore` when needed to keep agent-only files out of the VSIX

Supporting documentation may be corrected where the audit found directly conflicting development instructions, but product code, build topology, and release automation are outside this migration unless required to keep the new guidance truthful.

## Verification

Before completion:

- confirm every path and command named in `AGENTS.md` exists;
- confirm Claude and Copilot compatibility files point to authoritative guidance rather than duplicate it;
- search active guidance for obsolete Claude-only delegation, `foy`, unsafe credential storage, fixed real-VS-Code test counts, and stale Playwright facts;
- validate all migrated skill metadata and internal links;
- run `npm run lint:ci` and `npm run quality`, reporting any pre-existing or task-related failures separately; and
- inspect `git diff` and the task tracker so only approved scope is included.

## Non-Goals

- Reorganizing `src/`, `media-src/src/`, or the enforced module graph.
- Changing product behavior or extension packaging.
- Removing historical references to Claude, Copilot, or Codex from completed task records.
- Duplicating full instruction or skill bodies across agent-specific directories.
- Adding project-local Codex settings that override a contributor's model, sandbox, authentication, or approval preferences.
