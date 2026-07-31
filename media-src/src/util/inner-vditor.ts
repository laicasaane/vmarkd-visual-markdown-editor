// Typed accessor for the Vditor INTERNAL instance (window.vditor.vditor — Vditor's
// own IVditor, which the published `vditor` types don't expose). main.ts reached it
// ~11× via `(window.vditor as any).vditor.<x>`; this centralises those casts behind
// one documented surface (task 152 item 2) covering only the internals we touch, so a
// Vditor shape change surfaces here instead of at every call site.
interface InnerVditor {
  ir?: { element?: HTMLElement }
  wysiwyg?: { element?: HTMLElement }
  // `element` (the overlay container, whose inline `display` flips block/none when the full
  // Preview is toggled) is read by outline.ts's `scrollToHeadingIndex` to tell whether headings
  // should be looked up in `previewElement` or the active IR/WYSIWYG element — task 458.
  preview?: { element?: HTMLElement; previewElement?: HTMLElement }
  outline?: { element?: HTMLElement }
  // `element` is the toolbar's own container div (`.vditor-toolbar`) — task 456 needs it to set
  // role="toolbar" + roving tabindex and to scope its Arrow-key traversal. Read via this typed
  // accessor rather than `document.querySelector('.vditor-toolbar')`: the instant-paint prerender
  // overlay (prerender-overlay.ts) clones the toolbar into `#vmarkd-prerender .vditor-toolbar` for
  // the Lute-wait teaser, so a bare selector can hit a dead clone instead of the live toolbar.
  toolbar?: { element?: HTMLElement; elements?: Record<string, HTMLElement> }
  options?: { undoDelay?: number; cdn?: string }
  lute?: {
    VditorIRDOM2Md(html: string): string
    VditorDOM2Md(html: string): string
  }
}

/** The Vditor internal instance, or null before the first init. */
export function innerVditor(): InnerVditor | null {
  return (
    (window.vditor as unknown as { vditor?: InnerVditor } | null)?.vditor ??
    null
  )
}
