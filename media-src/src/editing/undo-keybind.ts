// Keyboard undo/redo routing.
//
// TASK 463 measured this precisely (real VS Code, all 3 edit modes, all 3 chords, both with and
// without this module) after an experiment tried to replace it with a build-time patch of
// `editorCommonEvent.ts`'s undo/redo gate. Two findings from that measurement replace the
// module's old (unverifiable, and it turns out WRONG) bubble-phase-race rationale:
//
// 1. Plain Ctrl/Cmd+Z and +Y are NOT actually blocked by the `!vditor.toolbar.elements.undo/redo`
//    gate the way it first looked from source. `hotkeyEvent`'s generic toolbar-hotkey fallback
//    loop (below the explicit gate, in the SAME function) matches those same two hotkeys against
//    the configured toolbar items and dispatches a synthetic click on the real Undo/Redo buttons —
//    which calls `vditor.undo.undo/redo` directly. That fallback isn't gated on button-absence, so
//    it already runs today even without this module, and it already calls `event.preventDefault()`
//    — which, measured, is what actually stops VS Code's native undo/redo from ALSO firing (VS
//    Code's webview key-forwarding appears to respect `defaultPrevented`; nothing here needed to
//    win a capture/bubble race, and this module's stopPropagation/stopImmediatePropagation were
//    never the load-bearing part for those two chords).
// 2. Ctrl/Cmd+Shift+Z (the OS-standard redo chord) is the ONE gap neither the explicit gate NOR
//    that fallback loop covers — Vditor's own toolbar config never declares a `⇧⌘Z` hotkey, so
//    `event.preventDefault()` never runs for it in vanilla Vditor and VS Code's native redo fires
//    (measured: RED without this module, specifically and only on that chord). A build-time patch
//    widening the redo match to include `⇧⌘Z` DOES fix that when focus is inside the editable
//    element (measured GREEN, all 3 modes) — but it cannot fix it everywhere: Vditor's own handler
//    is bound on the EDITOR ELEMENT (`hotkeyEvent(vditor, this.element)`), so a keydown whose
//    TARGET is outside that element (toolbar, elsewhere in the webview) never reaches it. Measured:
//    with only the patch and focus moved outside the editor, ⇧⌘Z did nothing at all — no engine
//    call, no document mutation, not even VS Code's native redo (it does not fire either, likely
//    for the same defaultPrevented-adjacent reason above) — so the KEY REGRESSES SILENTLY rather
//    than jumping. This module is bound on `window`, so it has the reach a patch on Vditor's own
//    (editor-element-scoped) source cannot get without literally becoming this module.
//
// Net: this module's only remaining, PROVEN-NECESSARY job is Ctrl/Cmd+Shift+Z, from anywhere in
// the webview — Vditor's own hotkey dispatch (with zero help from here) already handles plain
// Ctrl/Cmd+Z and +Y correctly. Kept covering all three chords anyway (simpler than special-casing
// one) since routing all of them through the exact toolbar-button call keeps keyboard == toolbar
// button for every chord, not just the one Vditor can't reach on its own.

import { isMac } from '../util/platform'

type HistoryKind = 'undo' | 'redo'

// Pure mapping from a keydown to an undo/redo action (or null when it isn't a
// history shortcut). Kept side-effect-free so it can be unit-tested directly.
//   Ctrl/Cmd+Z        → undo
//   Ctrl/Cmd+Shift+Z  → redo
//   Ctrl/Cmd+Y        → redo
// On mac the primary modifier is Cmd (metaKey); elsewhere it's Ctrl. Alt is never
// part of a history shortcut (Ctrl+Alt+E is our edit-in-vscode binding).
export function historyActionFor(
  event: Pick<
    KeyboardEvent,
    'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'
  >,
  mac: boolean,
): HistoryKind | null {
  const historyMod = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey
  if (!historyMod || event.altKey) return null
  const key = event.key.toLowerCase()
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && !event.shiftKey) return 'redo'
  return null
}

// Invoke Vditor's own undo/redo engine — `window.vditor.vditor.undo[kind](inner)`
// — the same call the toolbar Undo/Redo buttons make. No-ops safely if Vditor (or
// its undo engine) isn't ready yet.
export function runVditorHistory(win: any, kind: HistoryKind): void {
  const inner = win?.vditor?.vditor
  inner?.undo?.[kind]?.(inner)
}

// Wire the keydown listener. `win` is the global object holding the Vditor
// instance (`win.vditor`).
//
// Registered in the CAPTURE phase on `window` — this is what gives it reach beyond the editable
// element (task 463's measured, proven-necessary reason this module exists at all: Ctrl/Cmd+Shift+Z
// from anywhere in the webview, see the module header). `preventDefault()` is very likely doing
// the actual work of stopping VS Code's native undo/redo (measured indirectly: Vditor's OWN
// fallback dispatch, which only calls `preventDefault()` and never touches propagation, already
// stops it for the two chords that fallback covers) — `stopImmediatePropagation()` is kept as
// belt-and-suspenders since VS Code's exact webview key-forwarding mechanism lives outside this
// repo and was never directly instrumented, only its net effect was measured.
export function setupHistoryKeybind(win: Window & typeof globalThis): void {
  const onMac = isMac(win.navigator)
  win.addEventListener(
    'keydown',
    (event) => {
      const kind = historyActionFor(event, onMac)
      if (!kind) return
      event.preventDefault()
      event.stopImmediatePropagation()
      runVditorHistory(win, kind)
    },
    true, // capture phase — beat VS Code's bubble-phase key forwarding
  )
}
