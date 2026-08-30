# Task 196 — In-editor find & REPLACE

**Status:** done · **Impact:** 🔴 high · **Origin:** task 192 §2

## Problem

Ctrl+F works (task 01 shipped the binding to `editor.action.webvieweditor.showFind`,
package.json:614-617) but VS
Code's webview find widget is **find-only** — no replace, no regex, no whole-word. Replacing
text means hopping to the text editor (Ctrl+Alt+E). Daily-frequency journey (190 J21).

## Scope

- [x] Design decision: custom find/replace widget in the webview operating on the
      Vditor model, vs (b) replace-only companion that reuses the native find for locating.
      Lean (a) — the native widget searches the RENDERED DOM (IR markers included), which
      makes match counts lie in edit modes anyway.
- [x] Widget: find + replace + replace-all, case toggle, whole-word; operates on `getValue()`
      text with results mapped to blocks via `source-map.ts`; replace = targeted model edit +
      `preserveCaretAndScroll`, ONE undo step per replace-all.
- [x] Keybinding: Ctrl/Cmd+F opens the custom find/replace widget; Ctrl/Cmd+H remains the shipped
      Headings shortcut from Task 505. Escape closes without leaking to editor content.
- [x] Highlight current/all matches in the visible surface (decoration spans must be
      Lute-invisible — `data-render="2"`, see the vmde-lute-features skill, or CSS
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

## Prior art — fork re-scan 2026-07-23 (task 358)

- `zaaack` PR #163 `feat: add in-editor find bar with CSS Custom Highlight API` (0.1.17) — a working reference for the find-bar UI + highlight layer half of this task. Note our own Custom-Highlight-API verdict was about live WYSIWYG code colouring (memory `wysiwyg-code-highlight-custom-highlight-api`), a different use — the rejection does not carry over to search highlighting.

## Completed (2026-08-31)

VMDE now owns one source-accurate find/replace widget across IR, WYSIWYG, and SV. The literal match
engine searches `getValue()` with case and Unicode-aware whole-word toggles, maps every result to
Task 52's Markdown block ranges, and includes prose, fenced/diagram source, tables, and marker text
without relying on rendered-DOM counts. Replace and Replace All build deterministic source strings;
replacement text is literal (no regex/back-reference interpretation).

The widget lives outside Vditor's editable DOM with labeled native inputs/buttons, status live
region, next/previous navigation, Escape close/focus return, and fixed pointer-inert overlay
rectangles for all matched blocks plus a distinct current block. No decoration span enters Lute,
clipboard Markdown, or saved source. Direct editor input refreshes open results.

Both replacement actions use the existing eager `selection-scope.ts` module and one exact Vditor
transaction: pre/post undo checkpoints, collision-safe caret marker removal, scroll/focus/caret
restoration, extension-update suppression, and one `postExact`. Replace All is therefore one undo
step regardless of match count. The same adapter passes in all three edit modes.

The design chose the full custom widget rather than a replace-only native-find companion. Ctrl/Cmd+F
now invokes the discoverable `vmde.findReplace` command instead of VS Code's rendered-DOM find.
The task's old Ctrl+H proposal was deliberately not used: Task 505 subsequently promoted Ctrl+H as
the Headings picker, and the real acceptance explicitly proves it remains intact.

### Verification

- TDD RED coverage began with five absent engine APIs. The final selection-scope file passes 48/48
  focused tests, covering literal/case/Unicode-word matching, block/line mapping, code-fence/table
  hits, literal single/all transforms, accessible external-DOM widget behavior, exact transactions,
  two-checkpoint Replace All, and Escape.
- Final repository-configured Chromium coverage passes 5/5 with `--retries=0`: marker-safe current
  replace, prose/fence/table Replace All plus one-step undo, toggles/close/overlays, and identical
  WYSIWYG/SV transactions. The coverage bundle exercises the find widget/action paths; full unit
  coverage reports `selection-scope.ts` at 88.88% lines / 84.32% statements.
- After `node build.mjs`, the one-boot real-VS-Code spec passes 1/1 with `--retries=0` in 7.0s.
  Real Ctrl+F focuses the widget; Replace All spans prose/fence/table and one Ctrl+Z restores the
  exact live baseline; Ctrl+H still opens Headings; a marker-safe current replace persists to disk
  after Ctrl+S and undo restores the live baseline.
- Build, all three type checks, manifest/command routing, and protocol shape checks pass. Main.js
  measures 533.9 KB and is recorded as 534/536 KB; reusing the eager scope module keeps startup at
  275/275 modules.
- Aggregate quality passes brand checks, lint, jscpd, dependency-cruiser, all audits, 3,398/3,398
  unit coverage tests, and the 15-module ratchet. Its only failure is the unrelated pre-existing
  `knip` report for `yazl` in `test/backend/package-local-preview-core.test.ts`.

Retry history: the first real undo assertion compared against the raw fixture rather than Vditor's
already-normalized live table source; it was corrected to capture the pre-command model. The final
candidate passed without Playwright retries. Per queue policy, no FAST, full Chromium, or full
real-VS-Code suite was run.
