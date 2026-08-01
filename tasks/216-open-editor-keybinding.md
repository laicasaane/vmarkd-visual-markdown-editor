# Task 216 — Keybinding + palette entry to open vMarkd

**Status:** planned · **Impact:** ⚪ low, cheap win · **Origin:** task 192 §5

## Problem

Entry into the editor is mouse-only: `vmarkd.openEditor` is hidden from the command palette
(`when: false`, package.json:121-124) and has no keybinding. Upstream zaaack shipped
`ctrl+shift+alt+m`.

## Scope

- [ ] Keybinding `ctrl+shift+alt+m` (`cmd+shift+alt+m` mac) → `vmarkd.openEditor`, when
      `editorLangId == markdown && !activeCustomEditorId` (from a text editor); when already
      in vMarkd the same chord maps to `vmarkd.openTextEditor`? — NO: keep the existing
      Ctrl+Alt+E for the reverse and don't overload; document both in README.
- [ ] Palette: change `commandPalette` `when` from `false` to
      `editorLangId == markdown` so "vMarkd: Open" is discoverable.
- [ ] README keyboard section update (it documents Ctrl+Alt+E and Ctrl+F today).

## Out of scope

- Rebindable in-webview chords, a default-editor takeover setting (priority stays option).

## Verification

- L1: manifest sanity test (parse package.json: binding present, palette `when` correct) —
  the pattern used by existing manifest tests if any; else a small json assertion in
  `test/backend`.
- L3 real-VS-Code: open a markdown text editor, execute the command via the keybinding's
  command id, assert the custom editor became active (keystroke-level chord dispatch isn't
  reliable in the harness — command-level is the honest proxy, note it in the spec).
