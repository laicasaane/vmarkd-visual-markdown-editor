# Task 285 — Floating (bubble) toolbar on text selection

**Status:** planned · **Impact:** 🔴 high — flagged independently by THREE lenses of the WYSIWYG-editor audit · **Origin:** task 192 §12

## What it is & the effect

The Medium/Notion-style pattern, shipped by every modern editor framework (Tiptap
BubbleMenu, BlockNote Formatting Toolbar, Milkdown Crepe, Lexical playground): the moment
you select text with the mouse, a small toolbar pops up AT the selection with
bold/italic/code/link — you format without travelling to the top of the window.

**Today in vMarkd:** selecting text produces NO affordance at all in the default IR mode —
`highlightToolbarIR` merely highlights the pinned top-toolbar buttons. Formatting a word
mid-document means mouse-travel to the top bar (or knowing the hotkey).
**After:** select → format in place; users who prefer a clean surface can hide the top
toolbar entirely (`showToolbar=false` already exists) and lose nothing.

## Scope

- [ ] Overlay div OUTSIDE the editable DOM (zero serialization risk), positioned from
      `getSelection().getRangeAt(0).getBoundingClientRect()` on debounced selectionchange;
      shown only for non-collapsed selections in ir/wysiwyg (never sv source, never
      Preview).
- [ ] Buttons: bold / italic / strike / inline-code / link / wiki-link + the task-298
      "turn into" dropdown — ALL dispatching the existing toolbar/IR actions
      (`ir/process.ts processToolbar` already handles add/remove on the dual-node DOM),
      so no new serialization surface.
- [ ] Known traps, all with in-repo precedent: `mousedown` preventDefault on the overlay
      (toolbar focus-scroll memory), hide during IME composition and while a node is
      mid-spin, hide on scroll/drag, re-position on selection growth.
- [ ] Setting `vmarkd.editor.selectionToolbar` (default on); shares the overlay primitive
      with task 297 (link popover) — build the primitive once.

## Out of scope

- Right-click menu (215), block drag handles (259), toolbar customization.

## Verification

L1: position/visibility state machine unit. L2: drag-select → bubble appears at the rect,
click bold → `**` in `getValue()`, selection survives, collapsed/sv/Preview → hidden.
L3 real-VS-Code (mandatory): positioning under injected CSS, no focus-scroll jump on a
scrolled large doc (the scroll-guard class of bug), IME suppression.
