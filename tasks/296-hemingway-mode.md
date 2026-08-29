# Task 296 — Hemingway mode (no-delete drafting)

**Status:** planned · **Impact:** ⚪ low (writer's tool, trivial cost) · **Origin:** task 192 §12 (Ghostwriter/Apostrophe)

## What it is & the effect

A drafting discipline tool from Ghostwriter and Apostrophe (both ship it as a headline
writer feature): while enabled, **Backspace and Delete do nothing** — you can only write
forward, like on a typewriter. The point: first drafts die from compulsive self-editing;
removing the delete key for a session forces flow, and editing happens later as a
separate pass.

**Effect:** a toggle for writers doing timed drafts/morning pages/NaNoWriMo-style
sessions; combined with typewriter scrolling (197) and focus dim (198) it completes the
"drafting trio" those apps advertise.

## Scope

- [ ] Toggle: toolbar `…` entry + `vmde.editor.hemingwayMode` (default off) + a clear
      status-bar indicator while ON (users must never wonder why Backspace is dead).
- [ ] Capture-phase gate (the proven key-capture pattern) blocking in the editable
      surface: Backspace, Delete, Ctrl+X, and beforeinput `deleteContent*` /
      `insertText`-over-a-non-collapsed-selection (type-over is deletion too); arrows,
      typing, Enter, undo stay allowed (undo is the escape hatch — deliberate, matches
      Ghostwriter).
- [ ] Scope: edit surfaces only (ir/wysiwyg/sv); toolbar/table-panel destructive buttons
      get `--disabled` while ON (cheap sweep); IME-safe (294's guard helper).

## Out of scope

- Timers/word-sprint UI (261's goals cover targets), blocking edits BEFORE the session
  start point (full Hemingway variants — keep v1 simple).

## Verification

L1: gate decision table (keys × beforeinput types × selection state). L2: toggle on →
Backspace/Delete/cut/type-over inert, typing works, `getValue()` only ever GROWS; toggle
off restores; status indicator state. L3 real-VS-Code: one leg — chord/UI toggle + the
gate under real key capture.
