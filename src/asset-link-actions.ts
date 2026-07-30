import * as vscode from 'vscode'
import * as NodePath from 'node:path'
import { getAssetsFolder } from './editor-config'
import { classifyHref } from './link-target'
import { MarkdownEditorViewType } from './tab-targeting'
import { createWikiPage, getWikiRoot, normalizeWikiLookupKey } from './wiki'
import { getOrBuildCache } from './wiki-cache'
import type { HostMessage, WebviewMessage } from './protocol'

// Gate filesystem-writing actions (image upload, wiki page creation) on the
// declared capabilities (see package.json `capabilities`): not in virtual
// workspaces (non-file scheme), and not in an untrusted workspace.
export function ensureCanWriteFiles(uri: vscode.Uri): boolean {
  if (uri.scheme !== 'file') {
    vscode.window.showInformationMessage(
      `[vMarkd] Image upload and wiki page creation are unavailable in virtual workspaces.`,
    )
    return false
  }
  if (!vscode.workspace.isTrusted) {
    vscode.window.showWarningMessage(
      `[vMarkd] Trust this workspace to upload images and create wiki pages.`,
    )
    return false
  }
  return true
}

export interface AssetLinkDeps {
  getActiveUri: () => vscode.Uri
  getActiveFsPath: () => string
  getWorkspaceFolder: () => vscode.WorkspaceFolder | undefined
  getDocumentUri: () => vscode.Uri
  postMessage: (msg: HostMessage) => void
  debug: (...args: unknown[]) => void
  showError: (msg: string) => void
}

// Task 405 — the three webview→host actions that write to disk or navigate outside the
// editor (onUpload, onOpenLink, onOpenWikilink), extracted out of EditorSession. Also the
// two containment checks [task 148](148-webview-security-hardening.md) items 1+2 cover
// (asset-folder write + link-open), now in one independently-testable unit.
export class AssetLinkActions {
  constructor(private readonly deps: AssetLinkDeps) {}

  async onUpload(
    message: Extract<WebviewMessage, { command: 'upload' }>,
  ): Promise<void> {
    if (!ensureCanWriteFiles(this.deps.getActiveUri())) {
      return
    }
    const assetsFolder = getAssetsFolder(this.deps.getActiveUri())
    try {
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(assetsFolder))
    } catch (error) {
      this.deps.debug('upload: createDirectory failed', error)
      this.deps.showError(`Invalid image folder: ${assetsFolder}`)
      return // can't write into a folder we failed to create
    }
    // Defense in depth (task 191 P1-18): never trust the webview-supplied name. Reduce it
    // to a bare basename (strips any `dir/` components), then verify the join stays inside
    // the assets folder — so a crafted `..`/`../` name can't write outside it even if the
    // webview-side sanitizeUploadName is bypassed. Unsafe names are skipped, not written.
    const written = (
      await Promise.all(
        message.files.map(async (file: any) => {
          const safeName = NodePath.basename(String(file.name))
          const target = NodePath.join(assetsFolder, safeName)
          const rel = NodePath.relative(assetsFolder, target)
          if (
            !safeName ||
            safeName === '..' ||
            rel.startsWith('..') ||
            NodePath.isAbsolute(rel)
          ) {
            this.deps.debug('upload: rejected unsafe file name', file.name)
            return null
          }
          await vscode.workspace.fs.writeFile(
            vscode.Uri.file(target),
            Buffer.from(file.base64, 'base64'),
          )
          return NodePath.relative(
            NodePath.dirname(this.deps.getActiveFsPath()),
            target,
          ).replace(/\\/g, '/')
        }),
      )
    ).filter((r): r is string => r !== null)
    this.deps.postMessage({
      command: 'uploaded',
      files: written,
    })
  }

  async onOpenLink(
    message: Extract<WebviewMessage, { command: 'open-link' }>,
  ): Promise<void> {
    const href = String(message.href)
    const classified = classifyHref(href)

    if (classified.kind === 'external') {
      // External URL → the OS default browser. env.openExternal is the canonical
      // API for this; vscode.open routes http inconsistently (Simple Browser).
      await vscode.env.openExternal(vscode.Uri.parse(classified.href))
      return
    }
    if (classified.kind === 'refused') {
      this.deps.debug('open-link: refused', href, classified.reason)
      this.deps.showError(`Can't open this link: ${classified.reason}`)
      return
    }
    if (classified.kind === 'scheme') {
      // A real URI (mailto:, tel:), allowlisted in link-target.ts. Uri.parse is
      // the correct constructor here — unlike the filesystem-path branch below, this is
      // genuinely a URI string, not an fsPath that happens to contain a colon (task 359 #1).
      await vscode.commands.executeCommand(
        'vscode.open',
        vscode.Uri.parse(classified.href),
      )
      return
    }
    if (classified.kind === 'same-doc-anchor') {
      // Fragment/heading navigation is task 243's job. No-op rather than resolving `#heading`
      // against the doc dir and failing to open a file literally named "#heading" (the
      // pre-fix behaviour — see tasks/359's probe measurements).
      this.deps.debug(
        'open-link: same-document anchor, not yet supported (task 243)',
        href,
      )
      return
    }

    // classified.kind === 'local' — a filesystem target (relative or absolute). Defense in
    // depth (task 148 item 2): contain the resolved target to the workspace folder (if the
    // doc belongs to one) or its own directory otherwise — mirrors onUpload's containment
    // above. Without this, `[x](/etc/passwd)` or `[x](../../../secret)` opened any file on
    // disk on click. classified.path is already percent-decoded and fragment-stripped.
    const activeFsPath = this.deps.getActiveFsPath()
    const local = NodePath.resolve(
      NodePath.dirname(activeFsPath),
      classified.path,
    )
    const workspaceFolder = this.deps.getWorkspaceFolder()
    const root = workspaceFolder?.uri.fsPath ?? NodePath.dirname(activeFsPath)
    const rel = NodePath.relative(root, local)
    if (rel.startsWith('..') || NodePath.isAbsolute(rel)) {
      this.deps.debug('open-link: refused out-of-scope target', href)
      this.deps.showError(
        `Can't open a link outside the ${workspaceFolder ? 'workspace' : 'document folder'}: ${href}`,
      )
      return
    }

    // Uri.file, not Uri.parse (task 359 #1) — `local` is a filesystem path, and Uri.parse
    // reads it as a URI string: on Windows a drive letter parses as scheme "c", and a POSIX
    // path containing "#"/"?"/"%" gets split into fragment/query/percent-decoded. Uri.file
    // takes it as the literal fsPath, which is what a resolved local target always is.
    const targetUri = vscode.Uri.file(local)
    let stat: vscode.FileStat | undefined
    try {
      stat = await vscode.workspace.fs.stat(targetUri)
    } catch {
      stat = undefined
    }
    if (!stat) {
      // Readable message naming the resolved path, instead of the raw VS Code "file not
      // found" dialog / silent failure this used to fall through to.
      this.deps.showError(`File not found: ${local}`)
      return
    }
    if ((stat.type & vscode.FileType.Directory) !== 0) {
      await vscode.commands.executeCommand('revealInExplorer', targetUri)
      return
    }
    await vscode.commands.executeCommand('vscode.open', targetUri)
  }

  async onOpenWikilink(
    message: Extract<WebviewMessage, { command: 'open-wikilink' }>,
  ): Promise<void> {
    const documentUri = this.deps.getDocumentUri()
    const root = getWikiRoot(documentUri)
    if (!root) {
      this.deps.showError(
        'Wiki links are only enabled for Markdown files inside a wiki folder.',
      )
      return
    }
    const rawTarget = String(message.target)
    const [targetPart] = rawTarget.split('|', 1)
    const key = normalizeWikiLookupKey(targetPart.trim())
    if (!key) {
      this.deps.showError('Invalid wiki link target.')
      return
    }
    const cache = await getOrBuildCache(root)
    const matches = cache.resolve(key)

    if (matches.length === 0) {
      const createChoice = await vscode.window.showWarningMessage(
        `Wiki page "${rawTarget}" was not found under "${vscode.workspace.asRelativePath(root, false)}".`,
        'Create Page',
      )
      if (createChoice === 'Create Page') {
        if (!ensureCanWriteFiles(documentUri)) return
        const newFileUri = await createWikiPage(root, key)
        await vscode.commands.executeCommand(
          'vscode.openWith',
          newFileUri,
          MarkdownEditorViewType,
        )
      }
      return
    }
    if (matches.length > 1) {
      const picked = await vscode.window.showQuickPick(
        matches.map((candidate) => ({
          label: NodePath.basename(candidate.fsPath),
          description: vscode.workspace.asRelativePath(candidate, false),
          uri: candidate,
        })),
        {
          title: `Select wiki page for "${rawTarget}"`,
          placeHolder: 'Multiple wiki pages match this link.',
        },
      )
      if (picked?.uri) {
        await vscode.commands.executeCommand(
          'vscode.openWith',
          picked.uri,
          MarkdownEditorViewType,
        )
      }
      return
    }
    await vscode.commands.executeCommand(
      'vscode.openWith',
      matches[0],
      MarkdownEditorViewType,
    )
  }
}
