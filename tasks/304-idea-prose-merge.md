# Task 304 — Prose Merge: WYSIWYG git-conflict resolution [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative-audit proposal
(192 §13); NOT scheduled. Natural ESCALATION of bug-task 241 (which only detects markers
and steps aside) — decide them together.

## What it is & the effect

Open a markdown file mid-merge and instead of `<<<<<<<` marker soup destroying the layout,
each conflicted region renders as two clean, fully RENDERED cards — "yours" and "theirs",
tables and diagrams included — with pick-left / pick-right / keep-both buttons. Merging
two people's edits to a spec becomes comparing two rendered tables and clicking the right
one; the file is resolved surgically underneath.

## Why novel

3-way merge tools exist for code; NOTHING renders merge conflicts as formatted prose for
decision-making — Obsidian/Typora corrupt-render the soup (as do we, per 241's probe).
Squarely an IDE-native superpower: git merge state + custom editor + own renderer.

## Feasibility on our assets

Conflict-marker parsing = trivial host-side scan; each side renders through the existing
pipeline; resolution writes are exactly what minimal-diff-writeback/writeback-controller
do today; merge-in-progress state comes from the vscode.git API already wired. Main care:
read-only-per-region while conflicts exist.

## Honest value

When it fires it's a lifesaver and a loyalty-maker; infrequent for solo users, routine for
teams co-editing docs. High "I can't go back" factor. 241's cheap banner ships first
regardless — this is the deluxe path.

## Decision

- [ ] **ADOPT** (as 241 phase 2)
- [ ] **PARK** — reason: _______ (241's banner is then the permanent answer)
