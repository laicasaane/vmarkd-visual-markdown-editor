// The webview↔VS Code API handle + the shared window globals (split out of utils.ts, 185/3g).
//
// Acquiring the `vscode` postMessage handle is an EXPLICIT init call (initVsCodeApi, task 470),
// not an import-time side effect on THIS module: `acquireVsCodeApi()` may be called only once per
// webview (a second call throws), so preload.ts — the one module every real entry point (main.ts)
// and every e2e harness already imports first — calls it exactly once, idempotently, before any
// other module's functions can run (see preload.ts for why that's the bootstrap slot, not this
// file). Modules that only post to the host (utils, link-click-fix, toolbar-actions, …) can import
// THIS module freely — merely importing it does nothing — and the e2e harnesses define
// `acquireVsCodeApi` (a stub) before the bundle executes, so it still picks the stub up once
// preload.ts's call runs.

// Type the global from the package's published types (dist). The source entry
// (`vditor/src/index`) can't be used as a type root — it pulls Vditor's whole source,
// which depends on ambient globals not loaded here. main.ts constructs from source and
// casts the assignment to bridge the two identities.
import type Vditor from 'vditor'
// Typed VS Code webview API handle so every `vscode.postMessage` is checked against
// the WebviewMessage union — a bad command/field is now a compile error (task 151).
import type { VsCodeApi } from '../../src/protocol'

let initialized = false
// Acquire the vscode postMessage handle + mirror window.global. Idempotent: a re-init
// (message-router.ts rebuilding the Vditor instance within the same page) must NOT call
// acquireVsCodeApi() again — the API throws on a second acquisition per webview — so a second
// call here is a deliberate, silent no-op rather than a guard the caller has to remember.
export function initVsCodeApi(): void {
  if (initialized) return
  initialized = true
  window.vscode = (window as any).acquireVsCodeApi?.()
  ;(window as any).global = window
}

declare global {
  export const vditor: Vditor
  export const vscode: VsCodeApi
  interface Window {
    vditor: Vditor
    vscode: VsCodeApi
    global: Window
  }
}
