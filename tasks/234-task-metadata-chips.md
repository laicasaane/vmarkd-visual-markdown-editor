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
      plus our own `@name` assignee. Setting-gated (`vmarkd.tasks.metadata`, default off —
      emoji in prose must never restyle for non-users).
- [ ] Webview: render tokens inside `- [ ]` items as chips (data-render spans, plain-text
      round-trip — the wiki-chip discipline); overdue due-date gets a warn style
      (theme-aware). Tokens parse ONLY inside task list items.
- [ ] Host: include parsed metadata in the (task 205/207-adjacent) index so 105 and 233
      can query it — define the record shape now even if consumers land later.
- [ ] Editing: chips must stay editable-adjacent (caret can land inside and edit the raw
      token; re-tokenize on caret-leave — the callout/selectionchange pattern).

## Out of scope

- Recurrence rules (`🔁`), reminders/notifications, a date-picker UI (typing v1; picker
  maybe with 233), global "tasks due this week" view (that's 105's DQL).

## Verification

- L1: tokenizer unit (only-in-task-items, date validity, multiple tokens, mid-word `@`
  false positives).
- L2: chips render, round-trip byte-stable, overdue styling, edit-token-then-leave
  re-renders; non-task lines unaffected.
- L3 real-VS-Code (mandatory): fixture renders chips; toggle + edit + save fidelity.
