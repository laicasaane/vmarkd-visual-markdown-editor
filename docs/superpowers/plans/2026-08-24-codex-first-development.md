# Codex-First Development Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Codex the authoritative development agent for this fork while preserving thin Claude Code and GitHub Copilot compatibility entrypoints.

**Architecture:** Keep `AGENTS.md` as the single repository-wide policy source and `DEVELOPMENT.md` as the command-level source of truth. Move reusable project workflows into Codex-discoverable `.agents/skills/`, retain pointer-only compatibility files under `.claude/` and `.github/`, and do not change the application module layout.

**Tech Stack:** Markdown instruction files, Codex `AGENTS.md`, Codex repository skills (`SKILL.md`), npm/Biome quality tooling, Git.

**Spec:** `docs/superpowers/specs/2026-08-24-codex-first-development-design.md`

## Global Constraints

- Codex is authoritative; Claude Code and GitHub Copilot compatibility files must not duplicate policy bodies.
- `DEVELOPMENT.md` remains authoritative for exact build, test, coverage, CI, and release commands.
- Do not reorganize `src/`, `media-src/src/`, or `scripts/module-manifest.mjs`.
- Do not add project-local model, authentication, sandbox, or approval defaults.
- Do not modify historical Claude/Copilot/Codex references in completed task records.
- Do not recommend storing Marketplace credentials in tracked files or copying credentials between stores.
- Documentation-only changes receive proportionate validation; do not add artificial runtime tests for prose.

---

### Task 1: Establish the migration task record

**Files:**
- Create: `tasks/514-codex-first-development.md`
- Modify: none

**Interfaces:**
- Consumes: the approved design in `docs/superpowers/specs/2026-08-24-codex-first-development-design.md`
- Produces: the authoritative status checklist for this migration

- [ ] **Step 1: Create the active task file**

Create `tasks/514-codex-first-development.md` with the goal, approved scope, explicit non-goals, acceptance checklist, and verification checklist. Record that the repository audit found no need to reorganize the host/webview application structure.

- [ ] **Step 2: Verify task placement and status language**

Run:

```bash
test -f tasks/514-codex-first-development.md
rg -n "Status|AGENTS.md|\.agents/skills|compatib|npm run quality" tasks/514-codex-first-development.md
```

Expected: the file is active under `tasks/`, not `tasks/done/` or `tasks/parked/`, and every migration deliverable is represented.

- [ ] **Step 3: Commit the task record**

```bash
git add tasks/514-codex-first-development.md
git commit -m "docs(514): track Codex-first development migration"
```

### Task 2: Rewrite the authoritative Codex instructions

**Files:**
- Modify: `AGENTS.md`
- Reference: `DEVELOPMENT.md`
- Reference: `scripts/module-manifest.mjs`
- Reference: `scripts/quality.mjs`
- Reference: `test/vscode-e2e/playwright.config.ts`

**Interfaces:**
- Consumes: current repository structure, task lifecycle, testing rules, and quality stages
- Produces: the single authoritative workflow loaded automatically by Codex

- [ ] **Step 1: Replace stale and duplicated guidance with a stable structure**

Rewrite `AGENTS.md` with these sections, in this order:

```markdown
# vMarkd development with Codex

## Start here
## Repository map
## Repository skills
## Task lifecycle
## Implementation workflow
## Testing and verification
## Source and change safety
## Parallel Codex agents
## Completion and handoff
```

The content must explicitly state:

- read `DEVELOPMENT.md` first and use it for exact commands;
- `src/` is the VS Code host and `media-src/src/` is the browser webview;
- `out/`, `media/dist/`, `media/vditor/dist/`, and `media/vmarkd-icons.js` are generated;
- `scripts/module-manifest.mjs` and `test/backend/module-boundaries.test.ts` enforce structure;
- task files, not `tasks/README.md`, are the status authority;
- Vitest, Chromium e2e, and real-VS-Code e2e have distinct responsibilities;
- every webview/renderer behavior requires a written-and-run focused real-VS-Code spec after `node build.mjs` under `xvfb-run`;
- default full real-VS-Code runs exclude `@probe` tests and `*spike*` files, without quoting a fixed test count;
- `npm run quality` currently runs lint, knip, jscpd, dependency-cruiser, audit, unit coverage, and the zero-coverage-module ratchet;
- docs/tooling-only work uses proportionate validation;
- Codex must preserve unrelated changes, avoid generated output, keep secrets out of files/logs, and ask before destructive or scope-expanding actions;
- parallel agents are for independent work, must receive bounded scopes, and the primary agent owns integration and verification;
- the obsolete “delegate to real Codex through a Claude rescue agent” section is removed.

- [ ] **Step 2: Verify paths and volatile-language removal**

Run:

```bash
for path in DEVELOPMENT.md scripts/module-manifest.mjs test/backend/module-boundaries.test.ts media-src/e2e test/vscode-e2e scripts/quality.mjs; do test -e "$path"; done
rg -n "codex:rescue|codex-companion|Agent\(\{|~39 tests|everything except @probe|type-coverage.*not wired" AGENTS.md
```

Expected: every path check succeeds and the final search returns no matches.

- [ ] **Step 3: Commit the authoritative instructions**

```bash
git add AGENTS.md
git commit -m "docs(514): make Codex workflow authoritative"
```

### Task 3: Migrate repository skills to Codex

**Files:**
- Create: `.agents/skills/vmarkd-lute-features/SKILL.md`
- Create: `.agents/skills/vmarkd-renderer-theming/SKILL.md`
- Create: `.agents/skills/vmarkd-testing/SKILL.md`
- Create: `.agents/skills/vmarkd-visual-debugging/SKILL.md`
- Create: `.agents/skills/web-design-guidelines/SKILL.md`
- Create: `.agents/rules/css.md`
- Create: `.agents/rules/ts.md`
- Modify: `AGENTS.md`
- Reference: `.claude/skills/**/SKILL.md`
- Reference: `.claude/rules/*.md`

**Interfaces:**
- Consumes: existing Claude-local workflow content plus current repository facts
- Produces: Codex-discoverable, tool-neutral skills and neutral commenting guidance

- [ ] **Step 1: Copy the five skill bodies and two rules into authoritative locations**

Use `apply_patch` to create the `.agents/` files. Preserve the detailed domain knowledge and skill names. In `AGENTS.md`, list each skill path and its trigger condition so Codex can locate it even when a client does not surface repository skill metadata automatically.

- [ ] **Step 2: Correct verified stale facts while migrating**

Apply these exact corrections:

- `media/src/main.css` → `media-src/src/main.css` in `vmarkd-visual-debugging`;
- remove fixed FAST-tier test counts and point to `npx playwright test --list` plus `test/vscode-e2e/playwright.config.ts`;
- describe local real-VS-Code retries as 1 and CI retries as 2, matching the current config;
- replace the Playwright `1.52.0` prohibition with the current `1.62.1` plus the compatibility patch in `scripts/patch-vscode-test-playwright.mjs`;
- state that D2 has a real Chromium render gate in `media-src/e2e/custom-diagrams.spec.ts`;
- include `audit`, `typecheck:strict`, `typecheck:vscode-e2e`, bundle/startup budgets, and the current quality stages where the testing skill describes gates;
- replace Claude `WebFetch` wording with “use the available web browsing tool” and require the Vercel source to be fetched before UI review;
- remove or rewrite references to unavailable memory syntax and Claude-only tools where they prescribe behavior rather than document history.

- [ ] **Step 3: Validate skill metadata and internal paths**

Run:

```bash
for skill in .agents/skills/*/SKILL.md; do sed -n '1,12p' "$skill"; done
rg -n "media/src/main.css|1\.52\.0|~39 tests|retries: 2 absorbs|WebFetch|D2.*test\.fixme" .agents
rg -n "scripts/patch-vscode-test-playwright\.mjs|media-src/e2e/custom-diagrams\.spec\.ts|typecheck:strict|npm run quality" .agents/skills
```

Expected: every skill has valid `name` and `description` frontmatter, the stale-fact search returns no matches, and current references are present.

- [ ] **Step 4: Commit the Codex skills**

```bash
git add AGENTS.md .agents
git commit -m "docs(514): migrate project skills to Codex"
```

### Task 4: Reduce Claude and Copilot files to compatibility shims

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.claude/rules/css.md`
- Modify: `.claude/rules/ts.md`
- Modify: `.claude/skills/vmarkd-lute-features/SKILL.md`
- Modify: `.claude/skills/vmarkd-renderer-theming/SKILL.md`
- Modify: `.claude/skills/vmarkd-testing/SKILL.md`
- Modify: `.claude/skills/vmarkd-visual-debugging/SKILL.md`
- Modify: `.claude/skills/web-design-guidelines/SKILL.md`
- Modify: `.github/copilot-instructions.md`
- Modify: `.vscodeignore`

**Interfaces:**
- Consumes: authoritative `AGENTS.md` and `.agents/` content from Tasks 2–3
- Produces: retained Claude/Copilot compatibility without duplicated policy

- [ ] **Step 1: Replace compatibility files with explicit pointers**

Keep `CLAUDE.md` as the root forwarding entrypoint. Replace each `.claude/skills/*/SKILL.md` body with its existing frontmatter plus a short instruction to read and follow the corresponding `.agents/skills/<name>/SKILL.md` completely. Replace each `.claude/rules/*.md` body with its existing path filter plus a pointer to the corresponding `.agents/rules/*.md`.

Replace `.github/copilot-instructions.md` with concise instructions to read `AGENTS.md`, consult `DEVELOPMENT.md` for exact commands, and treat release credentials as external secrets. Remove all version-bump, local `.env`, PAT-mirroring, and duplicated publishing workflow text.

- [ ] **Step 2: Keep agent-only content out of VSIX packages**

Update `.vscodeignore` comments so `.agents`, `.claude`, `AGENTS.md`, `CLAUDE.md`, and `skills-lock.json` are clearly described as development-agent content. Preserve all ignore entries.

- [ ] **Step 3: Verify compatibility files are pointer-only**

Run:

```bash
wc -l CLAUDE.md .github/copilot-instructions.md .claude/rules/*.md .claude/skills/*/SKILL.md
rg -n "\.agents/(skills|rules)|AGENTS\.md|DEVELOPMENT\.md" CLAUDE.md .claude .github/copilot-instructions.md
rg -n "VSCE_PAT=.*|Persist Credentials|mirror.*secret|codex:rescue|codex-companion|1\.52\.0|~39 tests" CLAUDE.md .claude .github/copilot-instructions.md
```

Expected: compatibility files are short, point to authoritative locations, and the stale/unsafe search returns no matches.

- [ ] **Step 4: Commit compatibility shims**

```bash
git add CLAUDE.md .claude .github/copilot-instructions.md .vscodeignore
git commit -m "docs(514): retain thin agent compatibility shims"
```

### Task 5: Correct directly conflicting active documentation

**Files:**
- Preserve: `skills-lock.json`
- Modify: `DEVELOPMENT.md`
- Modify: `docs/republish.md`
- Modify: `tasks/514-codex-first-development.md`

**Interfaces:**
- Consumes: the audited current package scripts and workflows
- Produces: no active guidance that contradicts the Codex workflow

- [ ] **Step 1: Document the external skill-lock boundary**

Preserve `skills-lock.json`: it records externally installed Caveman/Vercel skill sources and the user explicitly requested Caveman compatibility. In `AGENTS.md`, state that repository development does not depend on those external skills being installed; `.agents/skills/` contains the fork's tracked project workflows. Keep the `skills-lock.json` `.vscodeignore` entry because external skill metadata is development-only.

- [ ] **Step 2: Correct active command documentation proven stale by the audit**

In `DEVELOPMENT.md`, synchronize the CI and quick-reference sections with `.github/workflows/ci.yml`, `scripts/quality.mjs`, and `scripts/release-marketplace.sh`:

- include low-level audits, knip, bundle/startup budgets, both webview typecheck gates, coverage ratchet, and Chromium e2e;
- remove the claim that `npm run pub` performs a local version bump/build/package/publish;
- state that `npm run pub` tags the version already in `package.json` and pushes for CI-driven publishing;
- avoid fixed FAST-tier counts in reusable guidance.

Replace `docs/republish.md` with a current CI-driven release procedure or a short pointer to `DEVELOPMENT.md#releasing`; remove `foy`, `// turbo-all`, direct PAT handling, and obsolete local publishing steps.

Do not change release workflows or claim nightly enforcement that the workflows do not implement. Add the discovered “nightly described as release-blocking but not enforced” gap to task 514 as explicitly not implemented, so the user can decide its follow-up.

- [ ] **Step 3: Search all active guidance for contradictions**

Run:

```bash
rg -n "foy|turbo-all|version bump -> build -> package -> publish|needs VSCE_PAT in \.env|~39 tests|1\.52\.0|codex:rescue|codex-companion" AGENTS.md DEVELOPMENT.md docs/republish.md .agents .claude .github/copilot-instructions.md
```

Expected: no matches, except a clearly historical explanation if one is intentionally retained and labeled.

- [ ] **Step 4: Commit documentation consistency fixes**

```bash
git add AGENTS.md DEVELOPMENT.md docs/republish.md tasks/514-codex-first-development.md .vscodeignore
git commit -m "docs(514): align active development guidance"
```

### Task 6: Verify and close the migration

**Files:**
- Modify: `tasks/514-codex-first-development.md`
- Modify: `tasks/README.md` only after every acceptance item is complete
- Move: `tasks/514-codex-first-development.md` to `tasks/done/514-codex-first-development.md` only when fully complete

**Interfaces:**
- Consumes: all preceding migration outputs
- Produces: verified Codex-first repository guidance and honest final task status

- [ ] **Step 1: Run documentation and structure checks**

Run:

```bash
git diff --check cf8da02
for path in DEVELOPMENT.md scripts/module-manifest.mjs test/backend/module-boundaries.test.ts media-src/e2e test/vscode-e2e scripts/quality.mjs .agents/skills/vmarkd-testing/SKILL.md .agents/skills/vmarkd-visual-debugging/SKILL.md; do test -e "$path"; done
rg -n "codex:rescue|codex-companion|VSCE_PAT=.*|Persist Credentials|media/src/main.css|1\.52\.0|~39 tests|D2.*test\.fixme" AGENTS.md DEVELOPMENT.md docs/republish.md .agents .claude .github/copilot-instructions.md
```

Expected: whitespace/path checks pass and the stale/unsafe search returns no matches.

- [ ] **Step 2: Run repository validation**

Run:

```bash
npm run lint:ci
npm run quality
```

Expected: both commands pass. If a stage fails, record the exact command and failure in task 514; distinguish pre-existing failures from migration-caused failures before changing scope.

- [ ] **Step 3: Review the complete diff and task status**

Run:

```bash
git status --short
git diff --stat cf8da02
git diff cf8da02 -- AGENTS.md DEVELOPMENT.md docs/republish.md .agents .claude .github/copilot-instructions.md .vscodeignore tasks/514-codex-first-development.md
```

Expected: only approved documentation, skill, compatibility, and task-tracking changes appear.

- [ ] **Step 4: Complete task tracking**

If every acceptance item and validation gate passes, mark the task complete, move it to `tasks/done/`, and update `tasks/README.md`. If anything remains, keep it active under `tasks/`, tick only finished items, and state the blocker or omitted scope explicitly.

- [ ] **Step 5: Commit final verification state**

```bash
git add tasks/README.md tasks/514-codex-first-development.md tasks/done/514-codex-first-development.md
git commit -m "docs(514): complete Codex-first migration"
```

Stage only paths that exist in the chosen complete or incomplete status; do not create empty placeholders.
