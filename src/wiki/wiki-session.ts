import * as vscode from 'vscode'
import * as NodePath from 'node:path'
import {
  getWikiDocumentContext,
  getWikiRoot,
  type WikiDocumentContext,
} from './wiki'
import { getOrBuildCache, invalidateCache, type WikiCache } from './wiki-cache'
import { MarkdownEditorViewType } from '../shared/product-identity'

// Task 405 — the per-EditorSession wiki state (`this.wiki` + `this.lastWikiRoot`) and the
// init-payload/config-change logic that read/write it, extracted out of EditorSession.
// Cross-folder RENAME does NOT refresh the context — a documented Phase-1 limit — so
// there is deliberately no rename hook here, only onConfigChanged.
export class WikiSession {
  private wiki: WikiDocumentContext
  private lastWikiRoot: vscode.Uri | undefined

  constructor(documentUri: vscode.Uri) {
    this.wiki = getWikiDocumentContext(documentUri)
  }

  get context(): WikiDocumentContext {
    return this.wiki
  }

  // A wiki CONFIG change (enabled/root) invalidates the old per-root cache (so the
  // re-init that follows builds a fresh one for the potentially-changed root) and
  // recomputes the context.
  onConfigChanged(documentUri: vscode.Uri): void {
    if (this.lastWikiRoot) {
      invalidateCache(this.lastWikiRoot)
      this.lastWikiRoot = undefined
    }
    this.wiki = getWikiDocumentContext(documentUri)
  }

  // Build the init payload's `wiki` field: the context, plus (only when a wiki root
  // actually resolves) the full page-key/display-name set precomputed on the shared
  // per-root cache — sent up front so the missing-link check and the autocomplete hint
  // agree from the first render. `onCacheChanged` is the watcher callback (file
  // create/delete under the root); the caller wires it to push updated keys to the
  // webview.
  async buildInitPayload(
    documentUri: vscode.Uri,
    onCacheChanged: (cache: WikiCache) => void,
  ): Promise<
    | WikiDocumentContext
    | (WikiDocumentContext & {
        pageKeys: string[]
        displayNames: string[]
      })
  > {
    const wikiRoot = this.wiki.enabled ? getWikiRoot(documentUri) : undefined
    this.lastWikiRoot = wikiRoot
    if (!wikiRoot) return this.wiki
    const cache = await getOrBuildCache(wikiRoot, () => onCacheChanged(cache))
    return {
      ...this.wiki,
      pageKeys: cache.allPageKeys(),
      displayNames: cache.allDisplayNames(),
    }
  }
}

// The `list-wiki-pages` command's QuickPick — showing every page under the doc's wiki
// root and opening the one the user picks. A free function (no session state needed
// beyond the document uri) rather than a WikiSession method.
export async function listWikiPages(documentUri: vscode.Uri): Promise<void> {
  const wikiRoot = getWikiRoot(documentUri)
  if (!wikiRoot) {
    return
  }
  const cache = await getOrBuildCache(wikiRoot)
  const allPages = cache.allFiles()
  const picked = await vscode.window.showQuickPick(
    allPages.map((page) => ({
      label: NodePath.basename(page.fsPath, NodePath.extname(page.fsPath)),
      description: vscode.workspace.asRelativePath(page, false),
      uri: page,
    })),
    {
      title: 'Wiki Pages',
      placeHolder: 'Select a wiki page to open',
    },
  )
  if (picked?.uri) {
    await vscode.commands.executeCommand(
      'vscode.openWith',
      picked.uri,
      MarkdownEditorViewType,
    )
  }
}
