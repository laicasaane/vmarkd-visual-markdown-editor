# 492 — Toolbar layout & menu usability: audit + proposed rework

Status: **analysis / not started**. No files changed. Raised by the user on 2026-08-02
("can toolbar usability be improved?"); the audit below was produced by an external
review pass (Codex, `gpt-5.6-sol`) and then **re-checked against the tree** — the
verification notes and the one correction are marked inline.

## Where the toolbar lives

| file | what it owns |
|---|---|
| `media-src/src/chrome/toolbar.ts:105-241` | **the definition** — order, separators, custom items, the `more` submenu, the optional wiki items |
| `media-src/src/chrome/toolbar-icons.ts` | custom SVGs: edit-in-VS-Code, wiki pages, go back, outline, link |
| `media-src/src/boot/vditor-init.ts:220-243` | hands the config to Vditor; `toolbarConfig.pin` pins it to the top |
| `media-src/src/vscode-chrome.css:22-172`, `:247-259` | VS Code-native look + the forced single non-wrapping row |
| `media-src/src/editing/escape-toolbar.ts:51-108` | `role="toolbar"`, `aria-orientation`, roving tabindex, arrow traversal, Escape |
| `media/vditor/dist/index.css` | Vditor 3.11.2's own toolbar CSS (the ≤520px media queries live here) |

## Current layout — verified

**26 top-level actions** in one row (28 with wiki enabled), separated into 6 groups
(7 with wiki). Counted directly from `toolbar.ts`:

```
emoji · headings · bold · italic · strike · link
| list · ordered-list · check · outdent · indent
| quote · line · code · inline-code · insert-before · insert-after
| upload · table
| undo · redo
| outline · preview
[ | navigate-back · wiki-pages ]            ← only when wikiEnabled
| edit-in-vscode · edit-mode · more
```

Submenus: **Emoji** (grid), **Headings** (H1–H6, `Alt+Ctrl/Cmd+1…6`), **Toggle Edit
Mode** (WYSIWYG / IR / Split, `Alt+Ctrl/Cmd+7…9`), **More** (`both`, Settings, About
Vditor, About vMarkd).

## Findings

### 1. No real overflow at narrow widths — the sharp one

`vscode-chrome.css:255-259` sets `.vditor-toolbar { display:flex; flex-wrap:nowrap }`.
That rule exists for a good reason (documented in the file: Vditor floats its items, and
at zero width — hidden tab — they stacked into a grid that got painted on the way back,
the "crooked toolbar" flash). The side effect is that in a narrow panel the trailing
items simply **overflow out of the viewport and become unclickable**, with no overflow
menu to catch them. The items most at risk are the last ones: `outline`, `preview`,
`edit-in-vscode`, `edit-mode`, `more` — i.e. exactly the high-value ones.

It gets worse below 520px: Vditor's own `media/vditor/dist/index.css:492-494` sets
`.vditor-toolbar__item { padding: 0 12px }` — the base rule (`:374`) has **no**
horizontal padding, so every button gets **+24px wider** precisely when space runs out.
The same breakpoint also kills tooltips (`index.css:249-253`, `content: none` on
`.vditor-tooltipped:before/:after`).

### 2. Too many permanent top-level actions

26 fixed slots, several of them rare in day-to-day markdown: `emoji`, `strike`,
`insert-before`, `insert-after`, `outdent`, `indent`, `line`. They hold prime horizontal
space that the actions in finding 1 lose.

### 3. Visual noise from separators

6–7 separators across 26 items — roughly one every 4 buttons.

### 4. Localisation is split and partial

`media-src/src/util/lang.ts` covers only 15 strings, and only `en_US` + `zh_CN` are
complete (`ja_JP` / `ko_KR` have `save` and nothing else — every other key falls back).
Meanwhile the `more` submenu labels in `toolbar.ts:199,211,214` — `Settings`,
`About Vditor`, `About vMarkd` — are **hardcoded English literals**, not `t()` calls, so
they never localise at all.

### 5. Keyboard shortcuts — partially registered

> **Correction to the original review.** It claimed vMarkd registers *no*
> `contributes.keybindings`. That is **false** — `package.json:767+` declares four:
> `ctrl+shift+v` → `vmarkd.pastePlain`, `ctrl+enter` → `vmarkd.activateLinkAtCaret`,
> `ctrl+alt+e` → `vmarkd.openTextEditor`, `ctrl+f` → the webview find widget, all gated
> on `activeCustomEditorId == vmarkd.editor`.

What *is* true: the **formatting** hotkeys (Ctrl/Cmd+B/I/D/K/L/O/J/U/G/M/Z/Y…) are baked
into Vditor and swallowed inside the webview. They are invisible in VS Code's Keyboard
Shortcuts UI, not rebindable there, and risk colliding with the workbench. Redo also
accepts `Shift+Ctrl/Cmd+Z` without advertising it in the tooltip.

### 6. Submenu ARIA is incomplete

`escape-toolbar.ts` gives the container `role="toolbar"` + `aria-orientation` + roving
tabindex — good. But the four dropdown triggers carry **no** `aria-haspopup` /
`aria-expanded` and the panels have no menu role (grepped: the only `aria-expanded` in
`media-src/src` is `nav/outline-keyboard.ts`, the outline tree). `upload` is a `div`
wrapping a hidden `<input type=file>`, not a real button.

## Proposed work — not yet decided, ordered by value

- [ ] **A. Real responsive overflow.** Measure the container width and *move* low-priority
      items into `more` (not `display:none`), with a pinned high-priority group
      (`edit-mode`, `preview`, `edit-in-vscode`, `more`, plus the wiki nav when enabled)
      that overflow never touches. New module next to `toolbar.ts` + `vscode-chrome.css`.
      Keep the `flex-wrap:nowrap` rule and its comment intact — it fixes a separate,
      documented bug.
- [ ] **B. Neutralise Vditor's ≤520px padding bump** — override `.vditor-toolbar__item`
      back to a compact target (~28-32px) in `vscode-chrome.css`, and reconsider whether
      losing tooltips at that width is right in a docked side panel.
- [ ] **C. Shrink the fixed set** — demote `emoji`, `strike`, `line`, `outdent`, `indent`,
      `insert-before`, `insert-after` into `more`. Cheap on its own; largely subsumed by A
      if A lands first.
- [ ] **D. Fewer separators**, once the set shrinks.
- [ ] **E. Label/icon consistency** — `Line` → `Horizontal Rule`, `Order List` →
      `Numbered List`, uniform 16×16 icons.
- [ ] **F. One localisation path** — route the `more` submenu literals through `t()`, and
      decide what to do about the two mostly-empty locales.
- [ ] **G. Tooltip ↔ shortcut truth** — at minimum show `Shift+Ctrl/Cmd+Z` on Redo.
      Promoting the Vditor formatting hotkeys into `contributes.keybindings` is a bigger
      call (they'd need real commands + a webview round-trip); decide before building.
- [ ] **H. Finish submenu ARIA** — `aria-haspopup`/`aria-expanded` on the four triggers,
      menu semantics + Arrow/Enter/Home/End/Escape inside the panels, and a semantic
      button for `upload`.

## Verification (required before any of this is called done)

Per AGENTS.md this is a webview/chrome feature, so both layers are mandatory:

- [ ] unit tests for the overflow-priority computation (pure function — keep the
      measurement separate from the DOM move so it is testable)
- [ ] chromium harness e2e in `media-src/e2e/` — narrow viewport, items land in `more`,
      pinned group stays visible
- [ ] **real-VS-Code e2e in `test/vscode-e2e/`** — narrow panel + full keyboard traversal;
      VS Code's injected CSS and the real panel resize are exactly what the harness cannot
      reproduce
- [ ] coverage confirmed on the new module
- [ ] `npm run quality` + `npm run lint:ci`

## Notes

- The audit above is a **read-only** pass. Nothing in `media-src/` or `src/` was modified.
- Findings 1, 2, 4, 5 and 6 were re-verified against the tree by reading the files; the
  original review's keybindings claim was wrong and is corrected in place above.
