import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AssetLinkActions,
  ensureCanWriteFiles,
} from '../../src/asset-link-actions'
import { _resetCacheMap } from '../../src/wiki-cache'
import { FileType, mock, Uri } from './vscode-mock'

// Task 405 — onUpload/onOpenLink/onOpenWikilink + ensureCanWriteFiles extracted out of
// EditorSession into an independently-constructible unit (mirrors editor-session.test.ts's
// "no provider, no real deps" style). The webview-message-level behaviour for these three
// handlers is ALSO exercised end-to-end via image-upload.test.ts / open-link.test.ts /
// wikilink-handler.test.ts (through EditorSession, unmodified) — this file proves the
// class works in isolation, which is the actual decomposition payoff.

function makeActions(
  overrides: Partial<{
    activeUri: Uri
    activeFsPath: string
    workspaceFolder: any
    documentUri: Uri
  }> = {},
) {
  const activeUri = overrides.activeUri ?? Uri.file('/ws/note.md')
  const postMessage = vi.fn()
  const debug = vi.fn()
  const showError = vi.fn()
  const actions = new AssetLinkActions({
    getActiveUri: () => activeUri,
    getActiveFsPath: () => overrides.activeFsPath ?? activeUri.fsPath,
    getWorkspaceFolder: () => overrides.workspaceFolder,
    getDocumentUri: () => overrides.documentUri ?? activeUri,
    postMessage,
    debug,
    showError,
  })
  return { actions, postMessage, debug, showError }
}

describe('ensureCanWriteFiles', () => {
  beforeEach(() => mock.reset())

  it('true for a trusted, file-scheme workspace', () => {
    mock.setTrusted(true)
    expect(ensureCanWriteFiles(Uri.file('/ws/note.md'))).toBe(true)
  })

  it('false + info message for a non-file scheme (virtual workspace)', () => {
    mock.setTrusted(true)
    expect(ensureCanWriteFiles(Uri.parse('vscode-vfs://x/note.md'))).toBe(false)
    expect(mock.calls.showInformation.length).toBeGreaterThan(0)
  })

  it('false + warning for an untrusted workspace', () => {
    mock.setTrusted(false)
    expect(ensureCanWriteFiles(Uri.file('/ws/note.md'))).toBe(false)
    expect(mock.calls.showWarning.length).toBeGreaterThan(0)
  })
})

describe('AssetLinkActions.onUpload', () => {
  beforeEach(() => {
    mock.reset()
    mock.setWorkspaceFolder('/ws')
    mock.setTrusted(true)
  })

  it('writes each file under the assets folder and replies with relative paths', async () => {
    const { actions, postMessage } = makeActions({
      activeUri: Uri.file('/ws/note.md'),
      activeFsPath: '/ws/note.md',
    })
    await actions.onUpload({
      command: 'upload',
      files: [{ name: 'pic.png', base64: Buffer.from('x').toString('base64') }],
    } as any)
    expect(mock.calls.fsWrites).toHaveLength(1)
    expect(mock.calls.fsWrites[0].uri.fsPath).toBe('/ws/assets/pic.png')
    expect(postMessage).toHaveBeenCalledWith({
      command: 'uploaded',
      files: ['assets/pic.png'],
    })
  })

  it('reduces a name with directory components to its basename before writing', async () => {
    const { actions, postMessage } = makeActions({
      activeUri: Uri.file('/ws/note.md'),
      activeFsPath: '/ws/note.md',
    })
    await actions.onUpload({
      command: 'upload',
      files: [{ name: '../../evil.png', base64: '' }],
    } as any)
    // NodePath.basename strips the traversal components — the write lands INSIDE the
    // assets folder as a plain "evil.png", it is not refused (that's the defense: no
    // raw name ever reaches the join).
    expect(mock.calls.fsWrites).toHaveLength(1)
    expect(mock.calls.fsWrites[0].uri.fsPath).toBe('/ws/assets/evil.png')
    expect(postMessage).toHaveBeenCalledWith({
      command: 'uploaded',
      files: ['assets/evil.png'],
    })
  })

  it('rejects a literal ".." name — the containment check catches what basename cannot', async () => {
    const { actions, postMessage, debug } = makeActions({
      activeUri: Uri.file('/ws/note.md'),
      activeFsPath: '/ws/note.md',
    })
    await actions.onUpload({
      command: 'upload',
      files: [{ name: '..', base64: '' }],
    } as any)
    expect(mock.calls.fsWrites).toHaveLength(0)
    expect(debug).toHaveBeenCalled()
    expect(postMessage).toHaveBeenCalledWith({ command: 'uploaded', files: [] })
  })

  it('does nothing when the workspace is untrusted', async () => {
    mock.setTrusted(false)
    const { actions, postMessage } = makeActions({
      activeUri: Uri.file('/ws/note.md'),
      activeFsPath: '/ws/note.md',
    })
    await actions.onUpload({
      command: 'upload',
      files: [{ name: 'pic.png', base64: '' }],
    } as any)
    expect(mock.calls.fsWrites).toHaveLength(0)
    expect(postMessage).not.toHaveBeenCalled()
  })
})

describe('AssetLinkActions.onOpenLink', () => {
  beforeEach(() => {
    mock.reset()
    mock.setWorkspaceFolder('/ws')
  })

  it('opens an http(s) URL externally', async () => {
    const { actions } = makeActions({ activeFsPath: '/ws/note.md' })
    await actions.onOpenLink({
      command: 'open-link',
      href: 'https://example.com',
    } as any)
    expect(mock.calls.openExternal).toHaveLength(1)
  })

  it('opens a sibling file within the workspace', async () => {
    const { actions } = makeActions({
      activeUri: Uri.file('/ws/note.md'),
      activeFsPath: '/ws/note.md',
      workspaceFolder: { uri: Uri.file('/ws'), name: 'ws', index: 0 },
    })
    await actions.onOpenLink({
      command: 'open-link',
      href: 'sibling.md',
    } as any)
    const open = mock.calls.executeCommand.find(
      (c) => c.command === 'vscode.open',
    )
    expect(open?.args[0].fsPath).toBe('/ws/sibling.md')
  })

  it('refuses a target outside the workspace (task 148 item 2)', async () => {
    const { actions, showError, debug } = makeActions({
      activeUri: Uri.file('/ws/sub/note.md'),
      activeFsPath: '/ws/sub/note.md',
      workspaceFolder: { uri: Uri.file('/ws'), name: 'ws', index: 0 },
    })
    await actions.onOpenLink({
      command: 'open-link',
      href: '../../etc/passwd',
    } as any)
    expect(showError).toHaveBeenCalledTimes(1)
    expect(debug).toHaveBeenCalled()
    expect(
      mock.calls.executeCommand.some((c) => c.command === 'vscode.open'),
    ).toBe(false)
  })
})

describe('AssetLinkActions.onOpenWikilink', () => {
  beforeEach(() => {
    mock.reset()
    _resetCacheMap()
    mock.setWorkspaceFolder('/ws')
    mock.setConfig({ enabled: true, root: '' })
    mock.setReadDirectory(async (uri: Uri) =>
      uri.fsPath === '/ws' ? [['Home.md', FileType.File]] : [],
    )
  })

  it('opens a uniquely-resolved wiki page', async () => {
    const { actions } = makeActions({ documentUri: Uri.file('/ws/Home.md') })
    await actions.onOpenWikilink({
      command: 'open-wikilink',
      target: 'Home',
    } as any)
    expect(
      mock.calls.executeCommand.some(
        (c) =>
          c.command === 'vscode.openWith' && c.args[0].fsPath === '/ws/Home.md',
      ),
    ).toBe(true)
  })

  it('errors on an empty/whitespace target', async () => {
    const { actions, showError } = makeActions({
      documentUri: Uri.file('/ws/Home.md'),
    })
    await actions.onOpenWikilink({
      command: 'open-wikilink',
      target: '   ',
    } as any)
    expect(showError).toHaveBeenCalled()
  })
})
