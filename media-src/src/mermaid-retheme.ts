// Re-render already-drawn mermaid diagrams in the current theme (task 59).
//
// Code highlighting follows the VS Code theme live (setTheme), but mermaid does not:
// Vditor renders each diagram to an <svg> once (marked `data-processed="true"`) and never
// re-runs it, so flipping dark↔light leaves diagrams in the stale theme until reopen.
//
// We re-render OFFSCREEN and swap the SVG in atomically: rendering in place would mean
// setting the preview's textContent back to the (short) source for mermaid to read, which
// momentarily collapses the diagram's height — and if the diagram sits above the viewport
// that shrinks the document and scrolls the view toward the top (the user-reported jump,
// mermaid-only). Instead we build a hidden sandbox holding the source, run Vditor's
// `mermaidRender` there, then copy each finished SVG back into its live preview node — the
// live DOM never collapses, so there's no scroll jump and no flash. The editable source is
// read from the sibling `<code class="language-mermaid">`. Async + best-effort; no diagrams
// → no-op.
import {
  type NativeJob,
  nativeSourceForPane,
  renderNativeJobs,
} from './native-offscreen'

export function reRenderMermaid(
  editorEl: HTMLElement | undefined,
  cdn: string,
  theme: 'dark' | 'light',
): void {
  if (!editorEl) return
  const panes = Array.from(
    editorEl.querySelectorAll<HTMLElement>(
      '.vditor-ir__preview, .vditor-wysiwyg__preview',
    ),
  )
  const jobs: NativeJob[] = []
  for (const pane of panes) {
    const live = pane.querySelector<HTMLElement>('.language-mermaid')
    if (!live) continue
    const source = nativeSourceForPane(pane, 'mermaid')
    if (source == null) continue
    jobs.push({ live, source })
  }
  // Theme: 'dark' → mermaid dark; anything else → mermaid default. An explicit `mermaidTheme`
  // setting still wins via the mermaid.initialize wrapper in applyMermaidTheme.
  renderNativeJobs('mermaid', jobs, cdn, theme)
}
