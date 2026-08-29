// Task 505 — a gap the "one owner per key" design didn't anticipate: setting `hotkey: ''` on a
// Vditor toolbar item (toolbar.ts) disables Vditor's OWN keydown handler, but it does nothing
// about the BROWSER's built-in contenteditable editing commands. Chromium natively intercepts
// Ctrl/Cmd+B, +I, +U inside a `contenteditable` element (`.vditor-ir` is one) and runs
// `execCommand('bold'|'italic'|'underline')` unless the keydown is prevented — previously Vditor's
// own handler called `event.preventDefault()` on a match, which incidentally suppressed this too.
// Removing that handler (hotkey: '') removes that suppression as a side effect.
//
// Measured without this module (real VS Code, real keypress): a single Ctrl+B on a selection
// produced `Hello ****world.` instead of `Hello **world**.` — the browser's native bold command
// ran INSIDE the same keydown, ahead of / alongside the VS Code command's async postMessage round
// trip, corrupting the DOM before `vmde.format.bold` ever got a chance to act.
//
// Fix: a capture-phase listener that matches the SAME FORMAT_HOTKEYS table and calls ONLY
// `event.preventDefault()` — no toolbar dispatch, no engine call. This is not a second ACTOR: task
// 492 already proved (see toolbar-hotkey-dedupe.ts's original header) that VS Code's registered-
// keybinding command dispatch is a separate, IPC-driven mechanism that fires regardless of whether
// the page's own script called `preventDefault()` — Vditor's own handler used to call it on every
// promoted key and the VS Code command still double-fired anyway. So preventDefault() here blocks
// only the browser's native execCommand path; the VS Code command remains the sole thing that
// performs the formatting, reaching the webview via `trigger-toolbar-hotkey` exactly as before.
// Applied uniformly to all 12 FORMAT_HOTKEYS keys (not just b/i/u) — cheap, and future-proofs
// against other browser-native contenteditable bindings this repo hasn't hit yet.
import { isMac } from '../util/platform'
import { FORMAT_HOTKEYS } from '../../../src/shared/format-hotkeys'

// FORMAT_HOTKEYS uses VS Code's own keybinding notation ('ctrl+shift+7', 'cmd+]'); normalize a
// keydown the same way so the two can be compared directly. Modifier order mirrors the table:
// primary modifier, then shift, then the key itself — FORMAT_HOTKEYS never combines with Alt.
export function normalizeEventKey(
  event: Pick<
    KeyboardEvent,
    'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'
  >,
  mac: boolean,
): string | null {
  const primary = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey
  if (!primary || event.altKey) return null
  const parts = [mac ? 'cmd' : 'ctrl']
  if (event.shiftKey) parts.push('shift')
  parts.push(event.key.toLowerCase())
  return parts.join('+')
}

export function isPromotedFormatHotkey(
  event: Pick<
    KeyboardEvent,
    'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'
  >,
  mac: boolean,
): boolean {
  const normalized = normalizeEventKey(event, mac)
  if (!normalized) return false
  return FORMAT_HOTKEYS.some((row) => (mac ? row.mac : row.key) === normalized)
}

// Wire the keydown listener. `win` is the global object the webview runs in (mirrors
// `setupHistoryKeybind`'s signature in undo-keybind.ts).
export function setupFormatHotkeyGuard(win: Window & typeof globalThis): void {
  const onMac = isMac(win.navigator)
  win.addEventListener(
    'keydown',
    (event) => {
      if (isPromotedFormatHotkey(event, onMac)) event.preventDefault()
    },
    true, // capture phase — must run before the browser's native contenteditable handling
  )
}
