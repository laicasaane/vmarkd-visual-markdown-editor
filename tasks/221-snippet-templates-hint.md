# Task 221 — Snippets / templates via the hint menu

**Status:** planned · **Impact:** ⚪ low · **Origin:** task 192 §5

## Problem

VS Code snippets cannot fire inside a webview and nothing replaces them — no quick way to
insert a callout skeleton, an N×M table, a diagram fence, a footnote pair. The proven
vehicle already exists: Vditor's `hint.extend` (the `[[` wiki hint, `main.ts:346-386`).

## Scope

- [ ] New hint trigger (propose `;;` — `/` collides with prose; confirm with user) listing
      built-in templates: callout (each type), table 2×2/3×3, fenced code with language
      prompt, every diagram-fence skeleton (from `engine-registry.ts` — one source of
      truth), footnote pair, front-matter block, `[toc]` (after task 225).
- [ ] Insertion via the same Spin-based path the emoji/wiki hints use (one undo step; the
      191 hint-menu contracts apply); caret lands at the template's first editable slot
      (single-position v1 — no multi-tabstop engine).
- [ ] User templates: `vmarkd.snippets` setting (array of `{trigger, label, body}`) merged
      into the list; body supports `{{date}}`/`{{time}}` placeholders (share task 209's
      expander).

## Menu UX bar (added 2026-07-03, BlockNote/Notion parity — acceptance criteria, not new scope)

The stock Vditor hint is a flat substring list; a current-feeling menu needs three layers:
- [ ] **Sections**: items grouped under labels (Basic blocks / Media / Diagrams /
      Advanced) — item schema gains a `group` attr, renderer adds headers.
- [ ] **Aliases**: fuzzy filtering matches synonyms (`img`→image, `todo`→task list).
- [ ] **Recently-used first**: workspace-state MRU merged into the sort.

## Out of scope

- Multi-tabstop/TM-snippet syntax, per-language expansion inside code blocks, sharing the
  VS Code snippet format.

## Verification

- L1: template registry + placeholder expansion units (and engine-registry-driven fence
  list stays in sync — assert against the registry).
- L2: extend the hint-menus spec (191 P1-10 shares the file): type trigger → menu → click →
  markdown round-trips; user-defined template appears.
- L3 real-VS-Code: one leg — trigger + insert callout, save, disk correct.
