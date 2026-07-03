# Task 297 — Link edit popover in IR mode (balloon: Open · Copy · Edit URL · Unlink)

**Status:** planned · **Impact:** 🟡 med · **Shares overlay primitive with:** 285 · **Origin:** task 192 §12

## What it is & the effect

The CKEditor "link balloon" / Vditor-WYSIWYG pattern: click a rendered link → a small
balloon with Open / Copy URL / Edit / Unlink, with Edit giving a compact input — instead
of exposing the raw `[text](https://very-long-url…)` inline.

**Today in vMarkd's default IR mode:** clicking a link EXPANDS the raw markers inline —
for long URLs the paragraph visibly reflows and the caret swims in URL soup; there is no
Unlink or Copy-URL affordance at all (upstream Vditor ships the popover only for WYSIWYG
mode; IR's highlightToolbarIR does nothing selection-local). Editing an URL is the
concrete daily pain.
**After:** click → balloon; Edit rewrites the href in place (markers never need to open
for the common case); Unlink strips to plain text; Open respects the existing
Ctrl+click policy.

## Scope

- [ ] Build on the 285 overlay primitive (position/focus/dismiss/IME rules — ONE
      implementation). Trigger: caret enters an `a`/link IR node (selectionchange), or a
      dedicated affordance if plain-click must keep today's expand behaviour — decide by
      feel with the user (memory: show partial results).
- [ ] Actions: **Open** (existing open-link wire + policy), **Copy URL** (task-53 copy
      wire), **Edit** (input; commit rewrites the href marker span through the normal
      pipeline — one model edit, one undo), **Unlink** (replace node with its text).
- [ ] Cover regular links AND images' src (the WYSIWYG img popover stays Vditor's; this
      is the IR gap); wiki chips excluded (they have their own click semantics).
- [ ] Title attribute editing only if free (the 240 fidelity work touches titles — don't
      collide; coordinate).

## Out of scope

- Hover PREVIEW of the target (210), link autocomplete (32), the WYSIWYG-mode popovers
  (exist upstream; their L2 battery is 191 P1-1).

## Verification

L1: href-rewrite util unit (angle-bracket URLs, titles, escapes). L2: click link →
balloon; each action's `getValue()` outcome exact; long-URL paragraph does NOT reflow on
balloon-edit path; one undo per action. L3 real-VS-Code (mandatory): balloon under
injected CSS + Open respects the modifier policy.
