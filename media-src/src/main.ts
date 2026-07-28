import './preload'
import type { InitPayload } from './init-payload'
import { logToHost } from './webview-log'

import { fixLinkClick } from './link-click-fix'
import { installClipboardLine } from './clipboard-line'
import { fixCut } from './utils'

import { applyVditorTheme } from './vditor-init'
import { sessionState } from './editor-session-state'
import {
  handleUpdate,
  installMessageRouter,
  markInlineInited,
} from './message-router'
// Vditor's index.css is NOT bundled here. The host links the COPIED media/vditor/dist/index.css
// (html-builder.ts) — the same single copy the harness and HTML-export load — so build.mjs
// patchVditorIndexCss() (run post-sync) is the SOLE patch site for it. Bundling it (the old
// `import 'vditor/dist/index.css'`) pulled the UNPATCHED node_modules copy into media/dist/main.css
// → editor and harness drifted (the WYSIWYG inline-code 0-padding trap, ADR-0004). One copy = no drift.
import { isMac } from './platform'
import { setupToolbarDismiss } from './toolbar-dismiss'
import { installFocusRestore } from './focus-restore'
import { installSelectedUrl } from './link-url'
import { innerVditor } from './inner-vditor'
import { configureDiagramRetheme } from './diagram-retheme'
import { observeGapParagraphs, setupTrailingNav } from './gap-paragraph'
import { setupCaretScroll } from './caret-scroll'
import { setupCalloutArrowNav } from './callout-nav'
import { setupHrArrowNav } from './hr-nav'
import { setupHistoryKeybind } from './undo-keybind'
import { setupSaveFlushKeybind } from './save-flush'
import { installLinkOpenGate } from './link-open-policy'
import { activeModeElement } from './source-map'
import { installEditorCaretTracking } from './editor-caret'
import './main.css'
// loaded after main.css so the VS Code-native chrome rules win on the cascade
import './vscode-chrome.css'

// Snapshot the in-editor caret on selectionchange (so Reveal-in-Source survives the
// iframe focus loss); the state + restore live in editor-caret.ts. Wired once.
installEditorCaretTracking()

// Task 389: leaving the vMarkd tab and coming back leaves focus on the webview's BODY — the
// selection survives (retainContextWhenHidden) but no caret is painted and keystrokes go nowhere.
// Put focus back on the editable surface, keeping the Range that is already there. Wired once.
installFocusRestore(window)

// Reclaim transient empty "gap" paragraphs Vditor splices when arrowing between adjacent
// blocks (blockquote↔code, code↔code). Wired once; reads the active editor lazily so it
// covers every re-init. See gap-paragraph.ts.
observeGapParagraphs(() =>
  window.vditor ? (activeModeElement(window.vditor) ?? null) : null,
)

// Keep the caret visible during programmatic arrow moves (table-cell up/down sets the
// selection without scrolling). Wired once; reads the active editor lazily. caret-scroll.ts.
setupCaretScroll(() =>
  window.vditor ? (activeModeElement(window.vditor) ?? null) : null,
)

// Arrow nav INTO collapsed callouts (their source is display:none — native caret movement
// can't enter, skipped them, and at EOF dropped the selection → caret jumped to the top).
// Wired once; reads the active editor lazily. callout-nav.ts.
setupCalloutArrowNav(
  () => (window.vditor ? (activeModeElement(window.vditor) ?? null) : null),
  () => innerVditor(),
)

// Step the caret ACROSS void `<hr>` thematic breaks (they have no text node, so the native move
// drops the selection on them → stuck above a rule). Wired once; reads the active editor lazily.
// hr-nav.ts (task 100).
setupHrArrowNav(() =>
  window.vditor ? (activeModeElement(window.vditor) ?? null) : null,
)

// Move the caret INTO the trailing paragraph at end-of-file. The invariant (above) keeps the
// paragraph present; this actively places the caret there on ArrowDown so the native EOF move
// can't drop the selection (→ Vditor normalising it to the editor start = the jump-to-top).
// Wired once; reads the active editor lazily. gap-paragraph.ts.
setupTrailingNav(() =>
  window.vditor ? (activeModeElement(window.vditor) ?? null) : null,
)

// Close toolbar dropdowns when clicking outside them (VS Code-native menu
// behaviour; see toolbar-dismiss.ts).
setupToolbarDismiss()

// Inject the per-init state the diagram re-theme authority needs (sessionState.lastInitMsg
// options/cdn read lazily so a re-init is reflected) + the code-theme applier that also
// runs at init (vditor-init.ts). rethemeDiagrams (diagram-retheme.ts, driven from
// message-router.ts) then drives every renderer's live re-theme from the two flip sites
// (task 152 items 1+3).
configureDiagramRetheme({
  getOptions: () => sessionState.lastInitMsg?.options,
  getCdn: () =>
    sessionState.lastInitMsg?.cdn || (window.vditor as any)?.options?.cdn || '',
  applyCodeTheme: applyVditorTheme,
})

// Wire the host→webview message listener (message-router.ts): one handler per
// `command`, keyed by the HostMessage discriminant.
installMessageRouter(window)

fixLinkClick()
fixCut()

// Task 385: give a collapsed Ctrl+C / Ctrl+X the current line, the way VS Code does — and stop the
// two defects that made the collapsed paths worse than useless (sv wiped the clipboard; cut ate a
// character). Must be installed before the first copy/cut; the Vditor patches call it by name.
installClipboardLine(window)

window.addEventListener('keydown', (event) => {
  const modifierPressed = isMac()
    ? event.metaKey && event.ctrlKey
    : event.ctrlKey && event.altKey
  if (modifierPressed && event.key.toLowerCase() === 'e') {
    event.preventDefault()
    event.stopPropagation()
    vscode.postMessage({ command: 'edit-in-vscode' })
  }
})

// Install the link-open gate the IR/WYSIWYG Vditor patches call (task 62). The
// mode is set per-init from the config setting; this just exposes the global.
installLinkOpenGate(window)

// Task 390: let the patched IR/WYSIWYG toolbar handlers see a URL-shaped selection, so clicking the
// link button on a selected URL puts it in BOTH halves of the link instead of leaving the
// destination as the `https://` placeholder. See link-url.ts.
installSelectedUrl(window)

// Route Ctrl/Cmd+Z·Y to Vditor's own undo engine instead of the browser/VS Code
// document undo — see undo-keybind.ts for the full rationale.
setupHistoryKeybind(window)

// Flush the debounced edit before VS Code saves, so Ctrl/Cmd+S never persists a
// stale snapshot (task 58). Capture phase + non-suppressing — see save-flush.ts.
setupSaveFlushKeybind(window, () => sessionState.editSync?.flush())

// Task 38: boot Vditor synchronously from the inlined init payload (host emits `#vmark-init` for
// non-wiki, non-huge docs) so we don't wait for the serial `ready→init` roundtrip. Set the echo-guard
// AFTER the init runs (so this first call isn't itself skipped) via markInlineInited; fall back to
// `ready→init` if the payload is absent (wiki/large docs) or fails to parse. `ready` is still posted
// so the host runs onReady (wiki cache/watcher + the no-op init echo).
const inlineInitEl = document.getElementById('vmark-init')
if (inlineInitEl?.textContent) {
  try {
    const payload = JSON.parse(inlineInitEl.textContent) as InitPayload
    handleUpdate({ command: 'update' as const, ...payload })
    markInlineInited(payload.content)
  } catch (err) {
    logToHost(
      `[main] inline init failed, falling back to ready→init: ${String(err)}`,
    )
  }
}

vscode.postMessage({ command: 'ready' })
