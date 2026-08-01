# Task 337 — Prompt library: templates with `{{variables}}` [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Real-usage audit
(192 §14); NOT scheduled.

## What it is & the effect

A folder of `.md` prompts with `{{variables}}`; commands: "Copy prompt with variables
filled" (quick-input per variable, result on the clipboard) and a picker over the library
(title + description from front-matter). People hoard prompts in Notion/gists today
because editors don't help; after: your prompt collection lives in git, in your editor,
with rendering, search and one-keystroke instantiation.

## Why novel

Prompt-manager SaaS tools exist; a file-based, offline, in-editor prompt library is
unshipped. The variable expander ALREADY EXISTS in our backlog (209's `{{date}}` family +
221's user templates) — this is those primitives pointed at a new genre.

## Feasibility on our assets

Reuses 209/221's shared token expander (build once, third consumer); picker = quick-pick
over a configured folder (wiki page-list pattern); copy = the 53 clipboard wire. Optional
later: "send to Copilot chat" via the vscode.lm/chat APIs (269's consent rules apply).

## Honest value

Cheap composition of already-planned parts; sticky for the AI-adjacent crowd. Honest
caveat: value depends on 209/221 landing first — otherwise it drags their scope in.

## Decision

- [ ] **ADOPT** (sequenced after 209/221)
- [ ] **PARK** — reason: _______
