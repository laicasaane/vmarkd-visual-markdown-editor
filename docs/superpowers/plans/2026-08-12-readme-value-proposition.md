# README Value Proposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the vMarkd README around a clear, persona-spanning product value proposition without overstating the extension's capabilities.

**Architecture:** Keep `README.md` as the single user-facing product overview and `tasks/226-readme-renderer-docs.md` as the authoritative record of documentation progress. Derive technical claims from `package.json` and the diagram engine registry.

**Tech Stack:** GitHub-flavored Markdown, VS Code extension manifest, TypeScript engine registry.

## Global Constraints

- The README remains in English.
- The shared promise is "write like a document; keep Markdown as the source of truth."
- Do not imply that vMarkd includes AI generation.
- Document exactly the 18 renderer languages registered in `media-src/src/diagram-kit/engine-registry.ts`.
- Preserve the existing screenshots, acknowledgements, and MIT license.

---

### Task 1: Rewrite and verify the product README

**Files:**

- Modify: `README.md`
- Modify: `tasks/226-readme-renderer-docs.md`

**Interfaces:**

- Consumes: product settings and commands from `package.json`; renderer languages from `media-src/src/diagram-kit/engine-registry.ts`.
- Produces: marketplace-facing product narrative and an accurate task-status record.

- [ ] **Step 1: Replace the feature-first opening with the approved narrative**

  Add the hook, source-of-truth promise, three audience scenarios, concise comparison,
  grouped capabilities, renderer coverage, quick start, requirements, security, project
  links, acknowledgements, and license described in the design spec.

- [ ] **Step 2: Record documentation progress**

  Mark task 226 partial, check the README sections completed by this change, and leave
  the registry sync test plus companion code/test items explicitly open.

- [ ] **Step 3: Verify content against product sources**

  Run a script that extracts `lang:` entries from the engine registry and checks that
  each appears as a backticked fence name in `README.md`. Check local Markdown links and
  images with a small read-only script.

- [ ] **Step 4: Run the repository end-of-task quality gate**

  Run `npm run quality`. If it reports failures outside the changed documentation,
  preserve them and report the exact failing stages rather than widening scope.

- [ ] **Step 5: Review the diff**

  Run `git diff --check` and inspect `git diff -- README.md tasks/226-readme-renderer-docs.md`
  for unsupported claims, accidental deletion of attribution, and formatting problems.
