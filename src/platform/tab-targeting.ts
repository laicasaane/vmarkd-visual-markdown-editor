import * as vscode from 'vscode'
import * as NodePath from 'node:path'
import { isWikiFile } from '../wiki/wiki'
import { MarkdownEditorViewType } from '../shared/editor-view-type'

const SupportedSchemes = new Set(['file', 'untitled'])
const SupportedMarkdownExtensions = new Set(['.md', '.markdown'])
const WikiFileContextKey = 'vmarkd.isWikiFile'

export function isSupportedMarkdownUri(uri: vscode.Uri) {
  return (
    SupportedSchemes.has(uri.scheme) &&
    SupportedMarkdownExtensions.has(NodePath.extname(uri.path).toLowerCase())
  )
}

export function getActiveTabInput() {
  return vscode.window.tabGroups.activeTabGroup.activeTab?.input
}

// Scan every tab group for a tab already showing `uri` in the given editor kind
// — our custom (WYSIWYG) editor, or a plain text editor. Lets us reveal an
// existing tab in its own column instead of opening a duplicate (task 36).
export function findTabForUri(
  uri: vscode.Uri,
  kind: 'custom' | 'text',
): vscode.Tab | undefined {
  const want = uri.toString()
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input
      if (
        kind === 'custom' &&
        input instanceof vscode.TabInputCustom &&
        input.viewType === MarkdownEditorViewType &&
        input.uri.toString() === want
      ) {
        return tab
      }
      if (
        kind === 'text' &&
        input instanceof vscode.TabInputText &&
        input.uri.toString() === want
      ) {
        return tab
      }
    }
  }
  return undefined
}

export function getCommandTarget(uri?: vscode.Uri) {
  if (uri) {
    return uri
  }

  const activeInput = getActiveTabInput()
  if (
    activeInput instanceof vscode.TabInputText ||
    activeInput instanceof vscode.TabInputCustom
  ) {
    return activeInput.uri
  }

  const activeEditorUri = vscode.window.activeTextEditor?.document.uri
  if (activeEditorUri) {
    return activeEditorUri
  }

  return undefined
}

export function isDiffContextForUri(uri: vscode.Uri) {
  const activeInput = getActiveTabInput()
  return (
    activeInput instanceof vscode.TabInputTextDiff &&
    (activeInput.original.toString() === uri.toString() ||
      activeInput.modified.toString() === uri.toString())
  )
}

// Task 405 — moved out of extension.ts: no session state, just `getCommandTarget` +
// `isWikiFile`, both already homed in this module's dependency graph. Kept as a plain
// free function (not injected) since both activate()'s refreshContexts and
// EditorSession's wiki-config-change listener call it identically, with no per-call
// variation.
export async function updateEditorContexts() {
  const target = getCommandTarget()
  await vscode.commands.executeCommand(
    'setContext',
    WikiFileContextKey,
    isWikiFile(target),
  )
}
