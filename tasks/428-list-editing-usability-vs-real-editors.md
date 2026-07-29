# 428 — List editing usability: match real word processors (Enter behaviour, indent, renumbering)

**Status: 📋 PROBE-FIRST.** Requested 2026-07-28 — a broad usability ask, not a single bug.

## Request

> "zrob task na oprawienie usability pracy z listami by byla tak dobra jak praca z listami w
> prawdziwych edytorach tekstu szczególnie jeśli chodzi o dodawanie nowych linii po enter,
> renumerowanie itp"
> — bring list-editing usability up to the level of real word processors (Word / Google Docs /
> Notion / Typora), especially adding new lines after Enter, renumbering, etc.

## Already covered elsewhere — do not duplicate

Renumbering already has two dedicated, planned tasks; this task's scope explicitly EXCLUDES that
territory:
- [Task 255](255-list-renumber-command.md) — an explicit "fix numbering" command (manual trigger).
- [Task 284](284-list-auto-renumber.md) — auto-renumber on structural edits (drag/cut/multi-select
  delete), probe-first, reuses 255's engine.
- [Task 281](281-sort-list-items.md) — A→Z sort, nested-aware (a different real-editor affordance,
  already scoped).
- [Task 391](391-list-goes-loose-while-editing.md) — DONE; a tight→loose formatting regression on
  Backspace-merge, unrelated to this task's UX-parity concern.

This task is about **Enter-key behaviour and related list-navigation ergonomics** — the part of
"real editor" list UX that has no task yet.

## What's ALREADY implemented — confirmed by reading Vditor's source, not assumed

Before proposing new work, check what upstream Vditor already does (`fixList`,
`media-src/node_modules/vditor/src/ts/util/fixBrowserBehavior.ts:456-532`), so this task doesn't
re-request something that already works:

- **Tab / Shift+Tab indent-outdent** at the start of a list item — `fixList:505-529` calls
  `listIndent`/`listOutdent`. This is the real-editor behaviour (Tab demotes to a sub-item,
  Shift+Tab promotes) and looks present. **Needs a live check, not just a source read** — confirm
  it actually indents/outdents correctly for both ordered and unordered lists, nested checklists,
  and that it renumbers the ordered-list siblings correctly afterward (ties to 284's engine).
- **Enter inside a multi-paragraph list item** (`fixList:460-472`) — splits correctly without
  breaking out of the `<li>`.
- **Backspace at the start of the first item** (`fixList:474-489`) and **Backspace on an empty
  item aligning to the previous item** (`fixList:492-503`) — both handled.
- **Checklist toggle hotkey** (⇧⌘J) and **Backspace before the checkbox** (`fixTask`,
  `fixBrowserBehavior.ts:1081-1122`) — handled.

## What's NOT found in Vditor's own keydown handling — the likely real gaps

Searched `fixList` and `fixTask` specifically for an **Enter** branch handling these, and found
none (only Backspace/Tab branches exist for them). This does not by itself prove they're broken —
Lute's own Markdown spin on `execAfterRender` could still produce the right result generically — but
it means nothing SPECIAL guards these, unlike the cases above:

- **Enter on an EMPTY list item should exit the list**, converting it to a plain paragraph (the
  standard behaviour in Word/Docs/Notion/Typora — pressing Enter twice, or once on an empty
  bullet, "escapes" the list rather than adding another empty bullet forever). No source path was
  found that does this; Lute's generic spin may or may not happen to produce it. **Needs a live
  check**: create a list, press Enter on the last item until it's empty, press Enter once more —
  does it stay a list item, or become a plain paragraph?
- **Enter on a checklist item should continue the checklist** (new item is also `- [ ]`, not a
  plain bullet or plain paragraph) — likely fine via Lute's spin (GFM task-list re-parse), but
  unconfirmed live.
- **Enter at the START of a non-empty list item** (splitting before any typed text) should push the
  existing text down as a new item, not merge/duplicate — a classic real-editor edge case, unverified.
- **Enter with the caret INSIDE a nested sub-list's last item, followed by Shift+Tab** (the "outdent
  after Enter" pattern many editors offer as a compound gesture) — out of scope for a single
  key-handler fix, but worth noting as a possible follow-up once the base cases are confirmed.

## Scope

- [ ] **Probe first** (this project's established pattern for list work — see 284): in the real
      VS Code webview, both IR and WYSIWYG modes, run through every behaviour listed above
      (implemented AND suspected-gap) against a reference: pick ONE real editor as the comparison
      baseline (Google Docs or Notion recommended — both are commonly available and have very
      conventional list Enter/Tab semantics) and record pass/fail per operation, per mode. This is
      the deliverable that turns "usability, itp" into a concrete, gated list.
- [ ] For each confirmed gap: fix via the same mechanism class as `fixList`/`fixTask` (an
      `event.key === "Enter"` branch alongside the existing Backspace/Tab ones, or an esbuild patch
      following the `patchListToggle` precedent if the fix must live inside Vditor's own source
      rather than our wrapper) — NOT a rewrite of list handling; these are small, additive branches
      matching the existing file's style.
- [ ] Nested lists and mixed ordered/unordered must both be covered by whatever probe matrix and
      fixes come out of this — a fix that only works on a flat unordered list is not done.
- [ ] Any renumbering side-effect of a new Enter behaviour reuses 255/284's shared normalize engine
      once that exists — do not hand-roll a second renumbering path.

## Out of scope

- Renumbering itself (255/284/391 own that).
- Sorting (281).
- Drag-and-drop list reordering (not requested here; a separate, larger feature if ever wanted).
- Rewriting `fixList`/`fixTask` wholesale, or forking Vditor for this — these are additive
  key-handler branches, matching the file's existing shape; escalate to ADR-0004's fork-trigger
  question (task 401) only if the fix genuinely can't be done as a patch.

## Verification

- L1: unit tests per confirmed-and-fixed gap (Lute Node-recipe or DOM-level, matching this file's
  existing test style for list operations).
- L2: harness e2e (`media-src/e2e/list.spec.ts` already exists — extend it) for IR + WYSIWYG.
- L3: real-VS-Code e2e for at least the headline case ("Enter on an empty list item exits the
  list") per AGENTS.md (this is editor-surface editing behaviour).

## See also

- `media-src/node_modules/vditor/src/ts/util/fixBrowserBehavior.ts` — `fixList` (:456), `fixTask`
  (:1081), `fixTab` (:535, the NON-list generic Tab-inserts-a-tab-character path — do not confuse
  this with `fixList`'s list-specific Tab handling, which is separate and already implemented).
- `media-src/e2e/list.spec.ts` — existing list harness coverage to extend.
- [255](255-list-renumber-command.md), [281](281-sort-list-items.md), [284](284-list-auto-renumber.md),
  [391](391-list-goes-loose-while-editing.md) — sibling list tasks, scope boundaries above.
