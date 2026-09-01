const LIVE_REGION_ID = 'vmde-live-region'
let liveRegion: HTMLElement | null = null
let announcementGeneration = 0

function ensureLiveRegion(doc: Document): HTMLElement {
  if (liveRegion?.isConnected && liveRegion.ownerDocument === doc)
    return liveRegion
  liveRegion = doc.getElementById(LIVE_REGION_ID)
  if (!liveRegion) {
    liveRegion = doc.createElement('div')
    liveRegion.id = LIVE_REGION_ID
    liveRegion.className = 'vmde-sr-only'
    liveRegion.setAttribute('role', 'status')
    liveRegion.setAttribute('aria-live', 'polite')
    liveRegion.setAttribute('aria-atomic', 'true')
    doc.body.append(liveRegion)
  }
  return liveRegion
}

export function installScreenReaderSemantics(
  documentName = 'Markdown document',
  doc: Document = document,
): HTMLElement {
  const label = `Markdown editor for ${documentName}`
  for (const editor of doc.querySelectorAll<HTMLElement>(
    '.vditor-ir, .vditor-wysiwyg, .vditor-sv',
  )) {
    editor.setAttribute('role', 'textbox')
    editor.setAttribute('aria-multiline', 'true')
    editor.setAttribute('aria-label', label)
  }
  return ensureLiveRegion(doc)
}

/** Announce one asynchronous state change through VMDE's single polite live region. */
export function announce(message: string): void {
  const region = liveRegion?.isConnected ? liveRegion : null
  if (!region || !message.trim()) return
  const generation = ++announcementGeneration
  region.textContent = ''
  queueMicrotask(() => {
    if (generation === announcementGeneration && region.isConnected) {
      region.textContent = message
    }
  })
}
