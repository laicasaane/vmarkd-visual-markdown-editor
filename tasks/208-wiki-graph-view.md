# Task 208 — Wiki local graph view

**Status:** planned · **Impact:** ⚪ low · **Origin:** task 192 §3

## Problem

No local-graph or vault-graph visualization — an ironic gap given the plugin bundles
echarts (graph series) already. Depends on the reverse index from task 201.

## Scope

- [ ] Phase 1 = **local graph** of the active note: a lightweight webview panel (or a
      section in the editor webview) rendering nodes = active note + direct in/out links
      (data from WikiCache forward + task-201 reverse index), edges directed; click a node
      → open that note.
- [ ] Render with the already-bundled echarts graph series (force layout) — no new
      dependency; theme via the existing echarts pairing.
- [ ] Depth setting (1–2), missing-page nodes styled like missing chips.

## Out of scope

- Whole-vault graph (perf/ux rabbit hole), clustering, tag nodes (revisit after 205),
  persistence of layout.

## Verification

- L1 backend: graph-data builder unit (depth, dedup, missing targets).
- L3 real-VS-Code (mandatory — webview feature): panel renders N expected nodes for the
  fixture vault; node click opens the note. (L2 optional if the panel is embedded in the
  editor webview — then a harness spec for render + click routing.)
