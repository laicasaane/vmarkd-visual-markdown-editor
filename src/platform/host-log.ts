import * as vscode from 'vscode'

// Levelled log channel (task 18 §2d), extracted from extension.ts (task 405) so the
// module-global `logger` + its two thin wrappers aren't tangled into the same file as
// activation/EditorSession. Replaces raw `console.log`, which always dumped full
// payloads — including document content — to the dev console. Routed at `trace`, so
// content-bearing logs surface only when the user raises the channel's log level;
// nothing leaks at the default level.
let channel: vscode.LogOutputChannel | undefined

export function initLogger(ch: vscode.LogOutputChannel): void {
  channel = ch
}

export function debug(...args: any[]): void {
  if (!channel) return
  channel.trace(
    args
      .map((a) => {
        if (typeof a === 'string') return a
        try {
          return JSON.stringify(a)
        } catch {
          return String(a)
        }
      })
      .join(' '),
  )
}

export function showError(msg: string): void {
  vscode.window.showErrorMessage(`[Visual Markdown Editor] ${msg}`)
}

// Raw pass-through append (no level, no formatting) — used by the webview `log`
// message handler, which forwards preformatted text verbatim.
export function appendRawLine(text: string): void {
  channel?.appendLine(text)
}
