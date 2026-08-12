# Auto theme pairing design

## Goal

When `vmarkd.theme.content` is `auto`, use VMark's registered content theme when the active VS Code color theme is one of the supported matching themes:

- `Default Light Modern` → `vscode-light-2026`
- `Default Dark Modern` → `vscode-dark-2026`
- GitHub light themes → `github-light`
- GitHub dark themes → `github-dark`

Other VS Code themes keep the existing CSS-variable-based `auto` behavior.

## Design

Add a dependency-free resolver beside the content-theme registry. It accepts the active color-theme id and the already-derived light/dark mode, returning either a registered content-theme value or `auto`. The resolver is used only after the user setting has been normalized; explicitly selected named themes always win and are never overridden by the VS Code theme.

The host's `collectConfigOptions` and initial HTML builder receive the resolved content theme, so the correct stylesheet and `useVscodeThemeColor` flag are present on first paint. On a workbench color-theme change, each open editor posts the normal live configuration update in addition to the mode update; this refreshes the selected content stylesheet and all content-theme-dependent diagram/code settings while preserving the editor session.

## Testing

- Unit tests cover the four supported mappings, unrelated themes, and explicit named-theme precedence through collected options.
- The existing host live-theme tests cover the full `config-changed` live-update
  contract used for theme changes.
- A real VS Code e2e opens a document with `theme.content: auto`, switches between the built-in light/dark themes, and asserts the active `ct-*` stylesheet and body theme marker; it also verifies a non-matching theme remains on the VS Code-color path.
