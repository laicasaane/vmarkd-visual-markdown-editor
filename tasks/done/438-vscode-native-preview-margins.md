# 438 — Editor side margins == VS Code's native markdown preview

**Status: ✅ DONE** (2026-07-29).

## Request

> "zrob by edytor mial takie marginesy … tak samo jak vscode natywny preview, zwroc uwage ze u nas
> jest tez tryb markerow headerow i inne ktore sie pokazuja po lewej stronie wiec wlaczenie ich nie
> powinno zmieniac marginesu, jedyna zmiana marginesu to jak ktos wlaczy narrow view"

Three requirements: (1) the same side margins as VS Code's built-in markdown preview, (2) toggling
the left-gutter markers must NOT move the text column, (3) narrow view is the only thing that may
change the margin.

## Reference measurement

VS Code's built-in preview (`markdown-language-features/media/markdown.css`, VS Code 1.124):

```css
html, body { padding: 0 26px; … }
```

The rule hits `html` AND `body`, so the insets STACK: the text really sits **52px** from the webview
edge. Confirmed by measuring a live preview rather than trusting the stylesheet —
`test/vscode-e2e/native-preview-probe.spec.ts` opens `markdown.showPreview` and reports
`paraLeft = 52` (`bodyPadding 26px/26px`, no `.markdown-body` padding). No max-width — full width
with a 52px gutter each side. That is the target. (Shipping 26px first was visibly too narrow:
"po lewej powinno byc wiecej, preview vscode ma wiecej".)

## What was wrong

| surface | before | now |
| --- | --- | --- |
| full-width editor (IR/WYSIWYG) | `padding: 0 20px` + a 35px left override for marker room → **35 left / 20 right** | `0 52px`, symmetric |
| full-width editor, markers OFF | left collapsed to **10px** (content + pinned toolbar) → the whole document jumped on toggle | unchanged 52px |
| full-width preview pane | 35px left / 20px right, and its own markers-off 10px mirror | `0 52px` |
| narrow view (`fullWidth: false`) | centred 800px column, floor 35px | same, floor 52px |
| pinned toolbar | 35px | 52px |

Root cause of the marker coupling: Vditor floats the H1–H6 / `↩` / footnote / ToC markers at
`margin-left: -29px`, which needs a 35px gutter to clear — so "make room for the markers" and "the
text margin" were the same number. With a 52px gutter the whole marker box (~23px: "H1" at 0.85rem
+ 4px padding-right) floats INSIDE it at Vditor's own -29px, so the text origin is
`--vmarkd-gutter` in both marker states and no rule sizes the gutter "for the markers".

## Changes

- `media-src/src/main.css`
  - new `--vmarkd-gutter: 52px` on `body` (consumers pass a `52px` fallback) — the single value every content surface uses.
  - full-width editor + preview: one symmetric `padding: 0 var(--vmarkd-gutter)`.
  - **deleted** both markers-off tightening rules (editor + pinned toolbar, and the preview mirror).
  - narrow view / prerender overlay: floor is now `max(var(--vmarkd-gutter), (100% - 800px) / 2)`.
  - marker offset left at Vditor's `-29px` (a note in its place explains why no override is needed).
- `package.json` — `vmarkd.editor.fullWidth` **default flipped to `true`** (agreed with the user):
  the default editor now looks like the native preview; off = the narrow centred 800px column.
- `test/backend/manifest.test.ts` — default assertion updated.
- `media-src/e2e/width-harness.ts` — `__setMarkers` no longer resets the width mode (the two flags
  are independent; "markers off in full width" was previously untestable).

## Tests

- [x] `media-src/e2e/width.spec.ts` — 4 new guards: symmetric 52px gutter in full width; markers
      on/off leave the text column at the same x; the marker box fits inside the gutter (starts no
      further left than the pane edge, ends before the text); narrow view never yields a *smaller*
      gutter than full width. 9/9 pass.
- [x] `media-src/e2e/outline.spec.ts` — the old "markers-off tightens the gutter" assertion now
      asserts the opposite (identical padding, 52px), i.e. it fails on the old CSS.
- [x] `test/vscode-e2e/native-preview-probe.spec.ts` (NEW, real VS Code) — measurement probe for the
      native preview's inset; prints, asserts nothing. Re-run it if VS Code changes markdown.css.
- [x] `test/vscode-e2e/editor-gutter.spec.ts` (NEW, real VS Code) — full-width gutter == 52px both
      sides, marker fits inside it, `vmarkd.editor.headingMarkers` toggled live does not move the
      column; narrow view stays centred with the 52px floor. 2/2 pass (~1.5 min).
- [x] `test/vscode-e2e/preview-width.spec.ts` — now sets `editor.fullWidth: false` itself instead of
      riding on the (changed) default, so it keeps testing the narrow mode its assertions describe.
- [x] full chromium harness suite (403 tests) green; `npm test` (1973) green; `test:vscode:fast`
      (39 tests) green; `npm run lint:ci`, `npm run typecheck` clean.
- [ ] full real-VS-Code suite (~40 min) — not run, propose before handover.

## Out of scope

Vertical padding: VS Code's preview uses `padding-top: 1em`; vMarkd keeps its 10px (narrow) / 0
(full width) rhythm, which is tuned for Edit↔Preview parity. Not touched.
