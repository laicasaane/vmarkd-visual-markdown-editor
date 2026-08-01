# Task 233 — Kanban board view over task lists (design-first)

**Status:** planned — DESIGN-FIRST · **Impact:** 🔴 high (PM headline feature) · **Origin:** task 192 §9

## Problem

PMs track work in markdown task lists but have no board. Bundled mermaid 11.15 has a
`kanban` DIAGRAM (static, code-defined) — that is not a working board. Obsidian's Kanban
plugin (a top-3 plugin) proves the demand: a board VIEW over a plain markdown file,
drag-to-move, still readable as a list everywhere else.

## Scope

- [ ] **Design phase first:** file format decision — lean the Obsidian Kanban convention
      (`## Column` headings + `- [ ]` items under each) for free interop with existing
      vaults; opt-in per doc via front-matter (`kanban: true`) or a toolbar toggle. Decide
      board-as-mode (a 4th editor surface) vs board-as-panel. Bring mockups to the user
      before code (memory: show partial results for eval).
- [ ] Board view: columns = H2 sections, cards = task items (rendered markdown inline —
      chips from tasks 228/234 appear on cards for free); drag card → column = the item
      moves under the target heading as ONE model edit (single undo step; the task-222
      section/item-move engine is the shared primitive — build it once); checkbox toggle
      on the card; add-card/add-column affordances write plain markdown.
- [ ] Everything persists as ordinary markdown — no sidecar/proprietary state (column
      order = heading order; card order = list order).

## Out of scope

- Cross-file boards / board fed by dataview queries (task 105, later), swimlanes, WIP
  limits, card colors.

## Verification

- L1: card/column model parse + move-transform units (the item-move engine's edge cases).
- L2: board renders from a fixture; drag (mouse.down/move/up) moves the item →
  `getValue()` exact, one edit post, one undo restores; toggle on card flips `[x]`.
- L3 real-VS-Code (mandatory): board over the real pipeline; drag + Ctrl+S → disk bytes;
  mode/view switch round-trip byte-stable.
