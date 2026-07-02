// Toolbar-driven persistence of Vditor state (split out of utils.ts, 185/3g).

import './vscode-api'

// Persist Vditor state across reopens. ALLOW-LIST = only genuinely user-chosen,
// non-config-derived state (task 152 item 4): the editor `mode` (ir/wysiwyg/sv) the
// user toggles at runtime. The whole `preview` blob + top-level `theme` used to be
// persisted, but every key in them is config-derived and re-applied authoritatively
// in buildVditorOptions — so saving them only created a stale shadow that fought live
// config (the lineNumber-stuck-on / stale-code-style one-way-switch bugs, memory:
// saved-Vditor-options-override-settings). Persisting just `mode` is the structural
// fix; buildVditorOptions' re-merge stays as belt-and-suspenders for old saved blobs.
export function saveVditorOptions() {
  vscode.postMessage({
    command: 'save-options',
    options: { mode: vditor.vditor.currentMode },
  })
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
        setTimeout(() => {
          saveVditorOptions()
        }, 500)
      }
    },
    true,
  )
}
