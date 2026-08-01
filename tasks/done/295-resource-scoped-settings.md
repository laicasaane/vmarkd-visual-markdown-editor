# Task 295 — Per-folder settings (resource scope) — correctness-flavoured

**Status:** ✅ **DONE (2026-07-30)** · **Impact:** 🟡 med (multi-root users; silent-ignore today) · **Origin:** task 192 §12

## Result

24 properties now declare `"scope": "resource"` (23 + `wiki.root`), and every read that feeds a
document takes that document's URI: `collectConfigOptions(uri)` and `effectiveThemeKind(uri)` moved
from `vmarkdConfig()` to the existing `cfgFor(uri)`, `getWikiConfig(uri)` likewise, and the four
`EditorSession` / two `PanelConfigController` / one provider call sites pass the URI they already
hold. The declaration and the read have to move together — a resource-scoped property whose read
drops the URI is exactly this bug, and a URI-aware read of a window-scoped property just no-ops.

**One setting deliberately left window-scoped: `outline.treeView`.** It toggles the explorer
tree-view contribution — a window-level UI element with no document to scope it to. Every other
per-document-meaningful property is scoped, including `wiki.root`/`wiki.enabled` (a notes vault and a
plain docs repo in one workspace is precisely the case the task names).

**Verified red-then-green at both layers:**
- L1 `test/backend/resource-scoped-config.test.ts` — 6 cases on the multi-root mock: a folder
  override wins, does NOT leak to a document outside it, two roots resolve differently from one call
  each, unrelated keys still fall back, no-URI reads keep the old behaviour, and `effectiveThemeKind`
  follows the DOCUMENT's folder (a folder pinning github-light resolves LIGHT while the workbench is
  dark — that read decides code-block colouring). Reverting the URI threading turns 4 of the 6 red.
- L3 `test/vscode-e2e/resource-scoped-settings.spec.ts` + `fixtures/scoped-roots/` — a REAL
  multi-root workspace (`two-roots.code-workspace` passed as the harness `baseDir`), `docs/` pinning
  github-light and `notes/` pinning material-dark in their own `.vscode/settings.json`, workspace
  level at `auto`. Multi-root is what makes it discriminate: in a single-folder workspace
  `.vscode/settings.json` is workspace scope and a NON-scoped read sees it too, so the spec would
  pass with the bug intact. Reverted, it fails 3/3 with no theme link active at all.

**Honest limit:** the provider's own `theme.content` read (`_getHtmlForWebview`) was scoped too, but
the e2e does NOT separately prove that one — the webview re-applies the theme from the init options
inside the poll window, so only the FIRST PAINT differs there. That first paint is a real (brief)
wrong-theme flash on the instant-paint teaser, which is why the read was scoped; it just is not what
the spec above is measuring.

## What it is & the effect

VS Code lets settings vary per folder (`.vscode/settings.json` in each root) — but only
if the extension declares `"scope": "resource"` AND reads config with the document's URI.
The Joplin/Inkdrop per-notebook-settings pattern maps exactly onto this: your `docs/` repo
wants `theme.content: github-light` + `defaultMode: preview`, your notes vault wants
`material-dark` + wiki features.

**Today, code-verified:** only 7 of our properties declare resource scope
(css.custom/css.external/image.* — package.json:495-582); EVERYTHING else (theme.*,
editor.*, outline.*, diagram.*) is read through the non-scoped `vmarkdConfig()` in
`collectConfigOptions()` (editor-config.ts:20-21/138-186). A folder-level override is
**silently ignored** — the user writes valid settings and nothing happens, with no error.
That's a correctness gap wearing a feature's clothes. (`cfgFor(uri)` already exists and
is used for exactly those 7.)

## Scope

- [ ] Declare `"scope": "resource"` on every per-document-meaningful setting (theme.*,
      editor.*, outline.*, diagram.*, image.*, wiki toggles; leave truly-global ones —
      telemetry-class — window-scoped, audit each).
- [ ] Thread the document URI through `collectConfigOptions(document.uri)` (switch the
      reads to the existing `cfgFor`); config-changed pushes stay per-panel as today, so
      two open docs from different folders can differ live.
- [ ] Unit: a folder-scoped override WINS over user settings for a doc in that folder and
      does NOT leak to a doc outside it.

## Out of scope

- Per-document front-matter overrides (53's export block / a future note), settings UI.

## Verification

L1: the override-precedence matrix on the vscode-mock (multi-root). L3 real-VS-Code
(mandatory): two-root workspace fixture, different `theme.content` per root → two open
editors render different themes simultaneously; live change in one root's settings.json
re-themes only its doc.
