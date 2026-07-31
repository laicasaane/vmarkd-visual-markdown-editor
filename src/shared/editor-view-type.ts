// Task 460 phase 3 (finding: platform<->wiki cycle) — the custom editor's viewType id,
// package.json-declared (`contributes.customEditors[0].viewType`), zero dependencies. Needed by
// both `platform/` (commands, status-bar, extension, tab-targeting, markdown-editor-provider) and
// `wiki/` (wiki-session, asset-link-actions) — moving it out of `platform/tab-targeting.ts` broke
// the `wiki -> platform` direction of that cycle (the reverse, `platform -> wiki` via
// tab-targeting's `isWikiFile` import, is real and stays — `isWikiFile` itself cannot move here:
// it depends on `vscode.workspace`/`node:path`, which this module's whole purpose is to be free
// of — see this file's neighbours' header comments for the "dependency-free kernel" definition).
export const MarkdownEditorViewType = 'vmarkd.editor'
