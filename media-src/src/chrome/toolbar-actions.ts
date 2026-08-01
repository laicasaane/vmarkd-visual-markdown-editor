// Toolbar-driven persistence of Vditor state (split out of utils.ts, 185/3g).

import '../util/vscode-api'

// Persist Vditor state across reopens. ALLOW-LIST = only genuinely user-chosen,
// non-config-derived state (task 152 item 4): the editor `mode` (ir/wysiwyg/sv) the
// user toggles at runtime. The whole `preview` blob + top-level `theme` used to be
// persisted, but every key in them is config-derived and re-applied authoritatively
// in buildVditorOptions — so saving them only created a stale shadow that fought live
// config (the lineNumber-stuck-on / stale-code-style one-way-switch bugs, memory:
// saved-Vditor-options-override-settings). Persisting just `mode` is the structural
// fix; buildVditorOptions' re-merge stays as belt-and-suspenders for old saved blobs.
// Task 187: a streamed (huge) open FORCES the session into IR (the stream writes the
// IR pane; a whole-doc sv render measured 5s at 312k chars — see the task file). That
// forcing is SESSION-ONLY: any panel click would otherwise persist mode:'ir' and stomp
// the user's saved sv/wysiwyg preference for every future file. While the override is
// set, save-options persists the USER'S mode; an explicit [data-mode] click clears it.
let persistModeOverride: string | null = null
export function setPersistModeOverride(mode: string | null) {
  persistModeOverride = mode
}

export function saveVditorOptions() {
  vscode.postMessage({
    command: 'save-options',
    options: { mode: persistModeOverride ?? vditor.vditor.currentMode },
  })
}

// Task 187: the host status bar shows the REAL edit mode (sv must not read
// "WYSIWYG"). Posted at init (finish-init) and after every edit-mode switch.
export function reportEditorMode() {
  const mode = vditor?.vditor?.currentMode
  if (mode === 'ir' || mode === 'wysiwyg' || mode === 'sv') {
    vscode.postMessage({ command: 'editorMode', mode })
  }
}

export function handleToolbarClick() {
  document.querySelectorAll('.vditor-toolbar').forEach((toolbar) => {
    toolbar.addEventListener('click', (e) => {
      if (
        (e.target as HTMLElement).closest(
          '.vditor-panel--left button, .vditor-panel--arrow button, .vditor-panel button',
        )
      ) {
        setTimeout(() => {
          saveVditorOptions()
        }, 500)
      }
    })
  })
  // The edit-mode dropdown (wysiwyg/ir/sv) is special: Vditor's own button
  // handlers call event.stopPropagation(), so a mode switch never reaches the
  // bubble-phase toolbar listener above — and the chosen mode was never persisted
  // (the editor kept reopening in whatever mode happened to get saved by some
  // OTHER panel click). Catch the mode button in the CAPTURE phase instead, which
  // runs before Vditor's stopPropagation, then save once setEditMode has applied.
  document.addEventListener(
    'click',
    (e) => {
      if ((e.target as HTMLElement).closest('.vditor-toolbar [data-mode]')) {
        // An explicit mode choice ends the streamed-open forcing: persist what the
        // user just picked, not the pre-stream preference.
        persistModeOverride = null
        setTimeout(() => {
          saveVditorOptions()
          reportEditorMode() // status-bar label tracks the switch (task 187)
        }, 500)
      }
    },
    true,
  )
}
