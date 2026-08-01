import type { DocLargeModeInfo } from '../app/status-bar'

// Extracted from extension.ts (task 405). Two per-document maps + two "refresher"
// indirections, shared across activate()'s status-bar/outline wiring and every open
// EditorSession. Lives in its own module (no dependency on extension.ts) specifically
// so the later extractions (doc-sync, wiki-session, …) can read/call these without a
// circular import back into extension.ts.

// task 69: per-document large/normal regime (block-count gate), reported by the webview
// and shown as a small status-bar marker (see setupStatusBar). Keyed by uri.toString().
export const docLargeMode = new Map<string, DocLargeModeInfo>()

// Task 187: the webview's CURRENT edit mode per document (ir/wysiwyg/sv), reported at
// init + on every edit-mode switch — drives the status-bar mode label (sv is a SOURCE
// view; the static "WYSIWYG" label was wrong there).
export const webviewEditorMode = new Map<string, 'ir' | 'wysiwyg' | 'sv'>()

// Wired in activate() to the real status-bar updater; called from a session's
// onDocMode/editorMode handlers so the status bar refreshes without those handlers
// depending on activate()'s closures directly.
let statusBarRefresher: () => void = () => {}
export function setStatusBarRefresher(fn: () => void): void {
  statusBarRefresher = fn
}
export function refreshStatusBarMarker(): void {
  statusBarRefresher()
}

// Wired in activate() to the debounced outline-tree rebuild; called from a session's
// start()/onDidChangeViewState so the Markdown Outline tree (task 78) follows the
// active vMarkd editor — custom editors don't fire onDidChangeActiveTextEditor.
let outlineRefresherFn: () => void = () => {}
export function setOutlineRefresher(fn: () => void): void {
  outlineRefresherFn = fn
}
export function refreshOutline(): void {
  outlineRefresherFn()
}
