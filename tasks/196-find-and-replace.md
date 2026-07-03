# Task 196 — In-editor find & REPLACE

**Status:** planned — design-first · **Impact:** 🔴 high · **Origin:** task 192 §2

## Problem

Ctrl+F works (task 01 shipped the binding to `editor.action.webvieweditor.showFind`,
package.json:614-617) but VS
Code's webview find widget is **find-only** — no replace, no regex, no whole-word. Replacing
text means hopping to the text editor (Ctrl+Alt+E). Daily-frequency journey (190 J21).

## Scope

- [ ] Design decision first: (a) custom find/replace widget in the webview operating on the
      Vditor model, vs (b) replace-only companion that reuses the native find for locating.
      Lean (a) — the native widget searches the RENDERED DOM (IR markers included), which
      makes match counts lie in edit modes anyway.
- [ ] Widget: find + replace + replace-all, case toggle, whole-word; operates on `getValue()`
      text with results mapped to blocks via `source-map.ts`; replace = targeted model edit +
      `preserveCaretAndScroll`, ONE undo step per replace-all.
- [ ] Keybinding: Ctrl+H when `activeCustomEditorId == vmarkd.editor` (mirror the Ctrl+F
      contribution); Escape closes. Note `undo-keybind.ts` capture-phase interception handles
      only Z/Y — extend deliberately, don't shadow VS Code chords.
- [ ] Highlight current/all matches in the visible surface (decoration spans must be
      Lute-invisible — `data-render="2"`, see the vmarkd-lute-features skill, or CSS
      Custom Highlight API is REJECTED per memory — use overlay rects).

## Out of scope

- Multi-file search/replace (VS Code's Ctrl+Shift+F covers it), regex back-references v1,
  search history.

## Verification

- L1: replace engine unit (match mapping, replace-all single undo step, code-fence hits).
- L2: harness — open widget, replace mid-doc term, `getValue()` correct, caret/scroll kept,
  markers not corrupted (torture fixture).
- L3 real-VS-Code (mandatory): Ctrl+H reaches the widget in the real webview (key-capture
  seam), replace persists to disk after Ctrl+S, undo restores.
