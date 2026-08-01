// Task 282 — `vmarkd.editor.defaultMode: "preview"` boots the document read-only.
//
// "Preview" is NOT one of Vditor's three modes (ir/wysiwyg/sv); it is an overlay toggled by the
// toolbar's Preview button, which swaps the edit pane for the rendered pane and disables the editing
// toolbars. There is no constructor option for it and no public API to set it, so the only honest
// way to reach that state is to drive the same button the user would click — Vditor's own handler
// then does the pane swap, the toolbar disabling and the outline re-render, and nothing here has to
// duplicate (or drift from) that logic.
import { innerVditor } from '../util/inner-vditor'

export function openInPreview(): void {
  const btn = innerVditor()?.toolbar?.elements?.preview?.children[0]
  if (!btn) return
  // Already showing the preview (a re-init that kept the state) — clicking again would toggle it
  // back OFF, which is the opposite of what the setting asks for.
  if (btn.classList.contains('vditor-menu--current')) return
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}
