import { beforeEach, describe, expect, it } from 'vitest'
import { listWikiPages, WikiSession } from '../../src/wiki/wiki-session'
import { _resetCacheMap } from '../../src/wiki/wiki-cache'
import { FileType, mock, Uri } from './vscode-mock'

// Task 405 — the per-session wiki context (this.wiki / this.lastWikiRoot in
// EditorSession) + onListWikiPages, extracted into their own unit. Behaviour mirrored
// exactly from onReady()/the config-change listener/onListWikiPages: the enabled flag +
// rootLabel come from getWikiDocumentContext, the init payload adds pageKeys/displayNames
// ONLY when a wiki root actually resolves, and lastWikiRoot is set unconditionally (even
// to undefined) so a later config change knows whether there's a cache to invalidate.

const F = FileType.File

function mountFs(tree: Record<string, [string, number][]>) {
  mock.setReadDirectory(async (uri: Uri) => tree[uri.fsPath] ?? [])
}

describe('WikiSession', () => {
  beforeEach(() => {
    mock.reset()
    _resetCacheMap()
    mock.setWorkspaceFolder('/ws')
  })

  it('a non-wiki document: context is disabled, no pageKeys/displayNames', async () => {
    mock.setConfig({ enabled: false })
    const session = new WikiSession(Uri.file('/ws/note.md'))
    expect(session.context.enabled).toBe(false)
    const payload = await session.buildInitPayload(
      Uri.file('/ws/note.md'),
      () => {
        /* post no-op — these tests only assert on the returned payload */
      },
    )
    expect(payload).toEqual({ enabled: false })
  })

  it('a wiki document: init payload adds pageKeys + displayNames from the shared cache', async () => {
    mock.setConfig({ enabled: true, root: '' })
    mountFs({
      '/ws': [
        ['Home.md', F],
        ['Other.md', F],
      ],
    })
    const session = new WikiSession(Uri.file('/ws/Home.md'))
    expect(session.context.enabled).toBe(true)
    const payload = await session.buildInitPayload(
      Uri.file('/ws/Home.md'),
      () => {
        /* post no-op — these tests only assert on the returned payload */
      },
    )
    expect(payload.enabled).toBe(true)
    expect(payload.pageKeys).toEqual(expect.arrayContaining(['home', 'other']))
    expect(payload.displayNames).toEqual(
      expect.arrayContaining(['Home', 'Other']),
    )
  })

  it('onConfigChanged invalidates the previous root cache and recomputes context', async () => {
    mock.setConfig({ enabled: true, root: '' })
    mountFs({ '/ws': [['Home.md', F]] })
    const session = new WikiSession(Uri.file('/ws/Home.md'))
    await session.buildInitPayload(Uri.file('/ws/Home.md'), () => {
      /* post no-op — these tests only assert on the returned payload */
    })

    // Disable wiki via config, then let the session pick that up.
    mock.setConfig({ enabled: false })
    session.onConfigChanged(Uri.file('/ws/Home.md'))
    expect(session.context.enabled).toBe(false)
  })
})

describe('listWikiPages', () => {
  beforeEach(() => {
    mock.reset()
    _resetCacheMap()
    mock.setWorkspaceFolder('/ws')
    mock.setConfig({ enabled: true, root: '' })
  })

  it('lists pages and opens the picked one', async () => {
    mountFs({
      '/ws': [
        ['Home.md', F],
        ['Other.md', F],
      ],
    })
    mock.setQuickPickResponse({ uri: Uri.file('/ws/Other.md') })
    await listWikiPages(Uri.file('/ws/Home.md'))
    expect(
      mock.calls.executeCommand.some(
        (c) =>
          c.command === 'vscode.openWith' &&
          c.args[0].fsPath === '/ws/Other.md',
      ),
    ).toBe(true)
  })

  it('does nothing when there is no wiki root', async () => {
    mock.setConfig({ enabled: false })
    await listWikiPages(Uri.file('/ws/note.md'))
    expect(mock.calls.executeCommand).toHaveLength(0)
  })

  it('opens nothing when the quick pick is dismissed', async () => {
    mountFs({ '/ws': [['Home.md', F]] })
    mock.setQuickPickResponse(undefined)
    await listWikiPages(Uri.file('/ws/Home.md'))
    expect(mock.calls.executeCommand).toHaveLength(0)
  })
})
