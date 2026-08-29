# Task 234 — Task metadata: due date · priority · assignee chips

**Status:** planned · **Impact:** 🟡 med (PM; feeds 105/233) · **Origin:** task 192 §9

## Problem

Verified by Lute probe: `- [ ] task @anna 📅 2026-07-10` renders the metadata as plain
text inside the task item — nothing parses it. PMs need at minimum due dates and owners on
checklist items, and every aggregation feature (dataview 105, kanban 233 cards) needs this
structure to exist.

## Scope

- [ ] Token vocabulary — adopt the **Obsidian Tasks emoji signifiers** for interop:
      `📅 YYYY-MM-DD` due, `⏳` scheduled, `✅ YYYY-MM-DD` done-on, priority `⏫/🔼/🔽`;
      plus our own `@name` assignee. Setting-gated (`vmde.tasks.metadata`, default off —
      emoji in prose must never restyle for non-users).
- [ ] Webview: render tokens inside `- [ ]` items as chips (data-render spans, plain-text
      round-trip — the wiki-chip discipline); overdue due-date gets a warn style
      (theme-aware). Tokens parse ONLY inside task list items.
- [ ] Host: include parsed metadata in the (task 205/207-adjacent) index so 105 and 233
      can query it — define the record shape now even if consumers land later.
- [ ] Editing: chips must stay editable-adjacent (caret can land inside and edit the raw
      token; re-tokenize on caret-leave — the callout/selectionchange pattern).

## Phase 2 (added 2026-07-03, marketplace audit)

- [ ] **Done-date stamping** (PKief markdown-checkbox parity, ~77K installs): setting
      `vmde.tasks.stampDoneDate` — on `[ ]`→`[x]` append `✅ YYYY-MM-DD` (remove on
      untick), through the normal edit pipeline from ALL toggle paths: checkbox click, the
      native ⇧⌘J hotkey, and task 220's preview toggle. The write-side of the token
      vocabulary phase 1 pins; Obsidian-Tasks interop for free.
- [ ] **Recurring tasks** (Todo MD parity, ~78K installs): parse the Obsidian-Tasks
      `🔁 every day|week|month…` token; completing a recurring item rewrites its `📅` to
      the next occurrence (or inserts the completed copy below, Obsidian-style — decide) as
      ONE model edit; feeds due-sorting in 272's tree and 105's DQL.

## Out of scope

- Reminders/notifications, a date-picker UI (typing v1; picker maybe with 233), global
  "tasks due this week" view (that's 105's DQL / 272's tree).

## Verification

- L1: tokenizer unit (only-in-task-items, date validity, multiple tokens, mid-word `@`
  false positives).
- L2: chips render, round-trip byte-stable, overdue styling, edit-token-then-leave
  re-renders; non-task lines unaffected.
- L3 real-VS-Code (mandatory): fixture renders chips; toggle + edit + save fidelity.
