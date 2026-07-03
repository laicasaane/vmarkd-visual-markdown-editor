# Task 295 — Per-folder settings (resource scope) — correctness-flavoured

**Status:** planned · **Impact:** 🟡 med (multi-root users; silent-ignore today) · **Origin:** task 192 §12

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
