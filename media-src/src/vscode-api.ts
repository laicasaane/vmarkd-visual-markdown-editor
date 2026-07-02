// The webview↔VS Code API handle + the shared window globals (split out of utils.ts, 185/3g).
//
// SIDE EFFECT ON IMPORT: acquires the `vscode` postMessage handle and mirrors `window.global`.
// Every module whose functions post to the host (utils, link-click-fix, toolbar-actions, …)
// imports this module, so bundling any of them guarantees the handle is set before their
// functions can run. The e2e harnesses define `acquireVsCodeApi` (a stub) before the bundle
// executes, so this same line picks the stub up there.

// Type the global from the package's published types (dist). The source entry
// (`vditor/src/index`) can't be used as a type root — it pulls Vditor's whole source,
// which depends on ambient globals not loaded here. main.ts constructs from source and
// casts the assignment to bridge the two identities.
import type Vditor from 'vditor'
// Typed VS Code webview API handle so every `vscode.postMessage` is checked against
// the WebviewMessage union — a bad command/field is now a compile error (task 151).
import type { VsCodeApi } from '../../src/protocol'

window.vscode = (window as any).acquireVsCodeApi?.()
;(window as any).global = window

declare global {
  export const vditor: Vditor
  export const vscode: VsCodeApi
  interface Window {
    vditor: Vditor
    vscode: VsCodeApi
    global: Window
  }
}
