# Task 456 — Escape the editor by keyboard (the WCAG 2.1.2 keyboard trap)

**Status:** 📋 OPEN · **Impact:** 🔴 high — this is the ACTUAL violation ·
**Origin:** split out of [244](244-keyboard-accessibility.md), 2026-07-30.

## Problem (re-verified 2026-07-30)

Focus can never leave the editable surface by keyboard. `tab: '\t'` is set (`vditor-init.ts:250`)
and Vditor's `fixTab` preventDefaults Tab whenever `options.tab` is set, so the toolbar and outline
are unreachable. That is a keyboard trap: WCAG 2.1.2 is not "hard to use", it is a failure.

## The design, and why it does not fight `tab: '\t'`

Escape arms a ONE-SHOT "next Tab leaves" flag; the following Tab moves focus to the toolbar instead
of inserting a tab character; any other key disarms it. Tab keeps indenting during ordinary editing —
the escape is an explicit two-key gesture, which is also the platform convention. This is why the
parent task's apparent conflict ("the fix fights a deliberate setting") is not real, and why the
design decision belongs in the task rather than being improvised at the keyboard.

Vditor has a TODO stub for this at `fixBrowserBehavior.ts:538` — read it before choosing a mechanism.

## Scope

- [ ] Escape → arm; Tab → move focus to the toolbar; any other key → disarm.
- [ ] `role="toolbar"` + roving tabindex + ArrowLeft/Right traversal on the toolbar container.
      Escaping into a toolbar you cannot traverse is not an escape, so this ships together.
- [ ] Shift+Tab from the document start as the reverse gesture, if it falls out cheaply.

## Verification

L3 real-VS-Code (mandatory — key capture differs in the real webview): a keyboard-only walk that
Escapes, Tabs to the toolbar, arrows across it, and returns; `getValue()` untouched throughout —
a "fix" that inserts a stray tab character while proving focus moved is a regression. Assert no
VS Code chord collision.
