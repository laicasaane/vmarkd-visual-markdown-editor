import { beforeEach, describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import { revealCaretInSource } from '../../src/reveal-caret'
import { mock } from './vscode-mock'

// Task 405 — extracted out of extension.ts (was a free function + a module-local
// `cursorOffsetSeq` counter) so it can be imported independently by both activate()'s
// registerCommands wiring and the (now separately-filed) EditorSession, without a
// circular import back into extension.ts. Also exercised indirectly via
// extension.test.ts's "edit-in-vscode reveals the caret line" — this file proves the
// module works with no EditorSession/provider involved at all.
describe('revealCaretInSource', () => {
  beforeEach(() => mock.reset())

  it('opens the source and selects the caret line reported by the webview', async () => {
    const text = 'first line\nsecond line here\nthird line\n'
    const doc = mock.createTextDocument('/ws/note.md', text)
    const panel = mock.createWebviewPanel()
    mock.setCursorReply({ line: 1, lineText: 'second line here' })

    await revealCaretInSource(panel as any, doc.uri, vscode.ViewColumn.Active)

    const editor = mock.calls.shownTextEditors.at(-1)
    expect(editor).toBeDefined()
    expect(editor.selection.active.line).toBe(1)
    expect(editor.selection.active.character).toBe('second line here'.length)
    expect(editor.revealRange).toHaveBeenCalled()
  })

  it('still opens the source (at the top) when the cursor cannot be resolved', async () => {
    const doc = mock.createTextDocument('/ws/note.md', 'a\nb\n')
    const panel = mock.createWebviewPanel()
    mock.setCursorReply({ line: -1, lineText: '' })

    await revealCaretInSource(panel as any, doc.uri, vscode.ViewColumn.Active)

    const editor = mock.calls.shownTextEditors.at(-1)
    expect(editor).toBeDefined()
    expect(editor.selection?.active.line ?? 0).toBe(0)
  })

  it('correlates the reply by requestId (task 185/3a) — a matching id resolves the reveal', async () => {
    const doc = mock.createTextDocument('/ws/note.md', 'x\ny\n')
    const panel = mock.createWebviewPanel()
    // Drive the round-trip manually (no auto-reply) so the requestId is visible.
    const call = revealCaretInSource(
      panel as any,
      doc.uri,
      vscode.ViewColumn.Active,
    )
    const request = mock.calls.postMessage.find(
      (m: any) => m.command === 'get-cursor-offset',
    )
    expect(request?.requestId).toMatch(/^co-/)
    await panel._receiveMessage({
      command: 'cursor-offset',
      requestId: request.requestId,
      line: 0,
      lineText: 'x',
    })
    await call
    const editor = mock.calls.shownTextEditors.at(-1)
    expect(editor.selection.active.line).toBe(0)
  })
})
