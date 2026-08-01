# Task 386 — BUG: copying from the split-view PREVIEW pane put nothing on the clipboard

**Status: ✅ DONE (2026-07-27).** Fixed by an esbuild patch on `vditor/src/ts/preview/index.ts`
(`patchPreviewCopyClipboardData` in `media-src/esbuild-shared.mjs`).

**Impact:** 🔴 high — this is a literal "copy/paste doesn't work" · **Origin:** task 385's second
investigation flagged it as "the top remaining candidate", with an INCONCLUSIVE probe

## The defect

Select text in the rendered right-hand pane of split view, press Ctrl+C, paste — and the previous
clipboard content comes back. The copy is silent: no error, no toast failure, nothing.

## Why it happened

The preview pane is the only clipboard path in the editor that does NOT use `clipboardData`.
IR, WYSIWYG and sv-edit all call `event.clipboardData.setData(...)` inside their copy handler.
`preview/index.ts` instead cloned the selection into a temp element and called `copyToX`, which ends
in **`document.execCommand("copy")` — re-entrant, because it runs inside that very `copy` handler** —
and then `preventDefault()`ed the original event.

In a VS Code webview (a doubly-nested OOPIF) Chromium refuses that re-entrant clipboard write **and
still returns `true`**. So the handler believed it had copied, the native copy was cancelled by its
own `preventDefault`, and nothing ever reached the system clipboard.

## How it was proved, after a first attempt failed to

The earlier probe was inconclusive because it **clicked the pane AFTER setting the selection**, which
collapses the very selection under test — the copy handler then had nothing to serialize, which
reads exactly like the bug without being it. Clicking FIRST (to focus the webview) and selecting
second made the defect reproducible on demand.

Instrumenting the handler then gave the mechanism directly:

| observation | value |
| --- | --- |
| `copy` event reached the pane | yes, `target: P`, `clipboardData` present |
| `document.execCommand("copy")` returned | **`true`** |
| original event `defaultPrevented` at document | `true` |
| system clipboard after | **unchanged** (still the sentinel) |
| same Ctrl+C in the sv EDIT pane, same run | **copied correctly** |

That last row is the control that rules out focus, keyboard routing and the VS Code clipboard bridge
— all three work in the same VS Code, in the same test.

## The fix

Write the event's own `clipboardData` (`text/html` + `text/plain`), the mechanism every other pane
already uses and which is proven to work here.

- The KaTeX `.base` fix-up is **kept**, so pasted math still renders.
- `copyToX`'s white background and code-background overrides are **deliberately not carried over**:
  they exist for the WeChat/Zhihu export buttons, and forcing a white background on an ordinary
  Ctrl+C would paste wrongly into a dark document. Those buttons still call `copyToX` and are
  untouched — their own `execCommand("copy")` runs from a click, not re-entrantly, so it is a
  different case and out of scope here.

## Verification

- **Unit** (`test/backend/vditor-source-patches.test.ts`): the shipped source really does copy via
  `copyToX`/`execCommand` (pre-patch assertion), the patch replaces it with `clipboardData`, the
  KaTeX fix-up survives, `copyToX` is left intact for the export buttons, and the anchor guard
  throws on version drift.
- **e2e, real VS Code** (`clipboard-preview.spec.ts`, 2 tests): a selection copied from the preview
  pane reaches the real VS Code clipboard, plus the sv-edit control.
  **Verified to FAIL without the fix** — stubbing the patch out of the chain and rebuilding turns the
  preview test red on all retries with "the clipboard was not left at its previous value", while the
  control stays green.

The spec asserts the selection is non-empty BEFORE pressing Ctrl+C, so the ordering trap that made
the first investigation inconclusive cannot silently return as a false pass.
