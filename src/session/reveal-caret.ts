import * as vscode from 'vscode'
import { selectionForLine } from './reveal-range'
import type { HostMessage, WebviewMessage } from '../shared/protocol'

// Monotonic id for `get-cursor-offset` request/reply correlation. Task 405 — extracted out
// of extension.ts alongside `revealCaretInSource`; module-local (not exported) since only
// this function ever needed it.
let cursorOffsetSeq = 0

// Open a VMDE document's source in a text editor and select the caret's line
// (task 16). Shared by the revealInSource command (opens Beside) and the
// edit-in-vscode toolbar button (opens in the active column). The webview is
// asked for the caret's line + that line's text — measured against
// vditor.getValue() — and we match by CONTENT in the real doc so Vditor's
// on-load reflow (a blank line after a heading, `>` re-prefixing) can't shift
// the target. If the caret can't be resolved, we still open the editor (at the
// top) so the button always does something.
export async function revealCaretInSource(
  panel: vscode.WebviewPanel,
  docUri: vscode.Uri,
  viewColumn: vscode.ViewColumn,
): Promise<void> {
  // One-shot request/reply on the panel (reveal is panel-scoped, so it doesn't go through the
  // session's handler map — that map carries a no-op 'cursor-offset' entry to stay exhaustive).
  // `requestId` correlation: a late reply from a previous timed-out reveal must not resolve
  // this one (185/3a). The 1000 ms timeout stays as the hung-webview fallback.
  const requestId = `co-${++cursorOffsetSeq}`
  const reply = await new Promise<{ line: number; lineText: string }>(
    (resolve) => {
      const timeout = setTimeout(() => {
        sub.dispose()
        resolve({ line: -1, lineText: '' })
      }, 1000)
      const sub = panel.webview.onDidReceiveMessage((msg: WebviewMessage) => {
        if (msg.command === 'cursor-offset' && msg.requestId === requestId) {
          clearTimeout(timeout)
          sub.dispose()
          resolve({ line: msg.line, lineText: msg.lineText })
        }
      })
      panel.webview.postMessage({
        command: 'get-cursor-offset',
        requestId,
      } satisfies HostMessage)
    },
  )

  const editor = await vscode.window.showTextDocument(docUri, {
    viewColumn,
    preview: false,
  })
  if (reply.line < 0) return // opened, but no caret to jump to

  const doc = vscode.workspace.textDocuments.find(
    (d) => d.uri.toString() === docUri.toString(),
  )
  const text = doc ? doc.getText() : editor.document.getText()
  const { line, startChar, endChar } = selectionForLine(
    text,
    reply.line,
    reply.lineText,
  )
  const start = new vscode.Position(line, startChar)
  const end = new vscode.Position(line, endChar)
  editor.selection = new vscode.Selection(start, end)
  editor.revealRange(
    new vscode.Range(start, end),
    vscode.TextEditorRevealType.InCenter,
  )
}
