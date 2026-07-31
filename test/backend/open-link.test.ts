import { beforeEach, describe, expect, it } from 'vitest'
import { MarkdownEditorProvider } from '../../src/platform/extension'
import { mock } from './vscode-mock'

// Task 148 item 2: the webview posts `{ command: 'open-link', href }` for a clicked
// non-http(s) link; the host resolves it relative to the document dir and opens it via
// `vscode.open`. Before this fix the resolved target had NO containment check —
// `[x](/etc/passwd)` or `[x](../../../secret)` opened any file on disk (info disclosure).

function resolveProvider(fsPath = '/workspace/note.md', text = '# Hi\n') {
  mock.setWorkspaceFolder('/workspace')
  const context = mock.createExtensionContext()
  const document = mock.createTextDocument(fsPath, text)
  const panel = mock.createWebviewPanel()
  const provider = new MarkdownEditorProvider(context as any)
  provider.resolveCustomTextEditor(document as any, panel as any)
  return { context, document, panel, provider }
}

function openedUris() {
  return mock.calls.executeCommand
    .filter((c) => c.command === 'vscode.open')
    .map((c) => c.args[0].fsPath)
}

describe('open-link containment (onOpenLink, task 148 item 2)', () => {
  beforeEach(() => mock.reset())

  it('opens a relative link that stays within the workspace', async () => {
    const { panel } = resolveProvider('/workspace/note.md')
    await panel._receiveMessage({ command: 'open-link', href: 'sibling.md' })
    expect(openedUris()).toEqual(['/workspace/sibling.md'])
    expect(mock.calls.showError).toHaveLength(0)
  })

  it('opens a `../` link that still resolves inside the workspace', async () => {
    const { panel } = resolveProvider('/workspace/sub/note.md')
    await panel._receiveMessage({ command: 'open-link', href: '../top.md' })
    expect(openedUris()).toEqual(['/workspace/top.md'])
  })

  it('refuses a `../../../` link that escapes the workspace — opens nothing', async () => {
    const { panel } = resolveProvider('/workspace/note.md')
    await panel._receiveMessage({
      command: 'open-link',
      href: '../../../etc/passwd',
    })
    expect(openedUris()).toEqual([])
    expect(mock.calls.showError.join(' ')).toContain('workspace')
  })

  it('refuses an absolute-path link outside the workspace — opens nothing', async () => {
    const { panel } = resolveProvider('/workspace/note.md')
    await panel._receiveMessage({ command: 'open-link', href: '/etc/passwd' })
    expect(openedUris()).toEqual([])
  })

  it('an http(s) link always opens externally, containment does not apply', async () => {
    const { panel } = resolveProvider('/workspace/note.md')
    await panel._receiveMessage({
      command: 'open-link',
      href: 'https://example.com/x',
    })
    expect(mock.calls.openExternal.map((u) => u.toString())).toEqual([
      'https://example.com/x',
    ])
    expect(openedUris()).toEqual([])
  })

  it("without a workspace, contains to the document's own directory", async () => {
    // no mock.setWorkspaceFolder() call — reset() leaves state.workspaceFolder undefined.
    const context = mock.createExtensionContext()
    const document = mock.createTextDocument('/standalone/note.md', '# Hi\n')
    const panel = mock.createWebviewPanel()
    const provider = new MarkdownEditorProvider(context as any)
    provider.resolveCustomTextEditor(document as any, panel as any)

    await panel._receiveMessage({ command: 'open-link', href: 'sibling.md' })
    expect(openedUris()).toEqual(['/standalone/sibling.md'])

    await panel._receiveMessage({
      command: 'open-link',
      href: '../../../etc/passwd',
    })
    expect(openedUris()).toEqual(['/standalone/sibling.md']) // unchanged — 2nd call refused
  })
})
