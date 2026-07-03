# Task 215 — Right-click context menu contributions (`webview/context`)

**Status:** planned · **Impact:** 🟡 med · **Origin:** task 192 §5

## Problem

Right-click inside the editor offers nothing custom — the `webview/context` menu
contribution point is entirely unused (package.json:119-160). It is the natural home for
several features this backlog restores/adds.

## Scope

- [ ] Stamp `data-vscode-context` on the relevant webview regions (VS Code reads it to
      decide menu item visibility): editor root (`{webviewSection:'editor'}`), rendered
      diagrams (`{webviewSection:'diagram', lang}`), images, code blocks, wiki chips.
- [ ] Contribute menu items gated on `webviewId == vmarkd.editor` + `webviewSection`:
      **Copy as HTML / Copy as Markdown** (task 53 restored wire), **Export diagram…** (194),
      **Copy code block**, **Open Source at Cursor** (existing command), **Switch mode ▸**,
      **Toggle outline**. Trim to what's shipped — each item lands with its feature task;
      THIS task ships the plumbing + the items whose backing commands already exist.
- [ ] Command handlers resolve the click target from the `data-vscode-context` payload
      VS Code passes to the command (args-based, not selection-based).
- [ ] Keep the native Copy/Cut/Paste items intact — contribute alongside, never
      preventDefault contextmenu (191 Probe-23 guards this).

## Out of scope

- A custom DOM context menu inside the webview (native contribution is the right surface),
  per-item keybindings.

## Verification

- L1: unit for the context-stamping helper (right sections on the right nodes).
- L2: harness — `data-vscode-context` attributes present per region after render/edit
  cycles (survive re-render).
- L3 real-VS-Code (mandatory): execute the contributed commands directly with a forged
  context arg (native menu is not Playwright-drivable — 191 Probe-23 pattern documents
  this proxy) and assert effects; menu registration asserted via `vscode.commands.getCommands`.
