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

## CSS this needs, QUEUED not applied (2026-07-31)

Vditor strips the toolbar's focus ring outright — `index.css` has
`.vditor-toolbar__item .vditor-tooltipped:focus { outline: none; }` and only recolours the icon,
which on many themes is indistinguishable from hover or idle. That is defensible for a mouse click
and fatal here: this task's whole point is delivering keyboard-only users onto those buttons, and
landing them on an invisible target defeats it (WCAG 2.4.7 Focus Visible).

Held rather than applied because `main.css` is owned by task 464's audit while that runs. Apply
verbatim once 464 lands:

```css
.vditor-toolbar__item .vditor-tooltipped:focus-visible {
  outline: 1px solid var(--vscode-focusBorder, #007fd4);
  outline-offset: -1px;
  border-radius: 2px;
}
```

`:focus-visible`, not `:focus`, so a mouse click keeps Vditor's own ring-less styling untouched.
Negative `outline-offset` (an inset ring) because the toolbar's bounds are tight and an outward ring
clips against adjacent buttons.

**Note for whoever applies it:** task 464 is converting specificity-based `main.css` overrides into
`patchVditorIndexCss` source patches. This rule is NOT that class — it adds a ring Vditor never
had, rather than countering a wrong Vditor declaration, so it belongs in `main.css` under
ADR-0003's category 3. Do not let the 464 sweep reclassify it on sight.

## Verification

L3 real-VS-Code (mandatory — key capture differs in the real webview): a keyboard-only walk that
Escapes, Tabs to the toolbar, arrows across it, and returns; `getValue()` untouched throughout —
a "fix" that inserts a stray tab character while proving focus moved is a regression. Assert no
VS Code chord collision.
