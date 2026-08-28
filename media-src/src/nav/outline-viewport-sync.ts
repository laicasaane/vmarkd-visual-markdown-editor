import type Vditor from 'vditor'
import { coalescePerFrame } from '../util/observe-coalesce'

export const OUTLINE_VIEWPORT_CLASS = 'vmarkd-outline-item--in-viewport'
const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6'
const OUTLINE_ITEM_SELECTOR = 'li > span[data-target-id]'
const VIEWPORT_INSET_PX = 4

interface ElementHolder {
  element?: HTMLElement
}

interface PreviewHolder extends ElementHolder {
  previewElement?: HTMLElement
}

interface VditorState {
  currentMode?: string
  outline?: ElementHolder
  preview?: PreviewHolder
  [mode: string]: unknown
}

function stateOf(vditor: Vditor): VditorState | undefined {
  return (vditor as unknown as { vditor?: VditorState }).vditor
}

// Mirrors Vditor's Outline.render surface choice: Preview (including SV's rendered split pane)
// wins whenever its container is shown; otherwise the current IR/WYSIWYG editor owns the outline.
function activeHeadingSurface(state: VditorState): HTMLElement | undefined {
  const preview = state.preview
  if (preview?.element?.style.display === 'block') {
    return preview.previewElement
  }
  const mode = state.currentMode
  return mode ? (state[mode] as ElementHolder | undefined)?.element : undefined
}

// Vditor's own outline click handler scrolls an edit surface directly, but scrolls the Preview
// surface's parent. Reuse that exact ownership rule so IntersectionObserver measures the same
// viewport users navigate, rather than assuming the webview window is the scroller.
function scrollRoot(state: VditorState, surface: HTMLElement): HTMLElement {
  return state.preview?.element?.contains(surface)
    ? (surface.parentElement ?? surface)
    : surface
}

function isObservableSurface(
  outline: HTMLElement,
  surface: HTMLElement | undefined,
): surface is HTMLElement {
  return getComputedStyle(outline).display !== 'none' && !!surface?.isConnected
}

export function installOutlineViewportSync(vditor: Vditor): () => void {
  const state = stateOf(vditor)
  const outlineEl = state?.outline?.element
  const contentEl = outlineEl?.querySelector<HTMLElement>(
    '.vditor-outline__content',
  )
  if (!state || !outlineEl || !contentEl) {
    return () => {
      /* no outline to observe */
    }
  }

  let disposed = false
  let generation = 0
  let headingObserver: IntersectionObserver | undefined
  let currentSurface: HTMLElement | undefined
  let observedHeadings = new Set<HTMLElement>()
  const visibleIds = new Set<string>()

  const outlineItems = (): HTMLElement[] =>
    Array.from(outlineEl.querySelectorAll<HTMLElement>(OUTLINE_ITEM_SELECTOR))

  const syncOutlineClasses = (): void => {
    for (const item of outlineItems()) {
      const id = item.dataset.targetId
      item.classList.toggle(OUTLINE_VIEWPORT_CLASS, !!id && visibleIds.has(id))
    }
  }

  const disconnectHeadings = (): void => {
    generation++
    headingObserver?.disconnect()
    headingObserver = undefined
    observedHeadings = new Set()
  }

  const refresh = (): void => {
    if (disposed) return
    const nextSurface = activeHeadingSurface(state)
    const sameSurface = nextSurface === currentSurface
    disconnectHeadings()

    if (!isObservableSurface(outlineEl, nextSurface)) {
      currentSurface = nextSurface
      visibleIds.clear()
      syncOutlineClasses()
      return
    }

    const headings = Array.from(
      nextSurface.querySelectorAll<HTMLElement>(HEADING_SELECTOR),
    ).filter((heading) => heading.id && heading.isConnected)
    const headingIds = new Set(headings.map((heading) => heading.id))
    if (!sameSurface) visibleIds.clear()
    else {
      for (const id of visibleIds) {
        if (!headingIds.has(id)) visibleIds.delete(id)
      }
    }
    currentSurface = nextSurface
    observedHeadings = new Set(headings)
    syncOutlineClasses()

    const observerGeneration = generation
    headingObserver = new IntersectionObserver(
      (entries) => {
        if (disposed || observerGeneration !== generation) return
        for (const entry of entries) {
          const heading = entry.target
          if (
            !(heading instanceof HTMLElement) ||
            !observedHeadings.has(heading) ||
            !heading.isConnected ||
            !currentSurface?.contains(heading) ||
            !heading.id
          ) {
            continue
          }
          const visible =
            entry.isIntersecting && entry.intersectionRect.height > 0
          if (visible) visibleIds.add(heading.id)
          else visibleIds.delete(heading.id)
        }
        syncOutlineClasses()
      },
      {
        root: scrollRoot(state, nextSurface),
        rootMargin: `-${VIEWPORT_INSET_PX}px 0px -${VIEWPORT_INSET_PX}px 0px`,
        threshold: 0,
      },
    )
    for (const heading of headings) headingObserver.observe(heading)
  }

  const scheduleRefresh = coalescePerFrame(refresh)
  const outlineObserver = new MutationObserver(scheduleRefresh)
  outlineObserver.observe(contentEl, {
    childList: true,
    subtree: true,
  })
  outlineObserver.observe(outlineEl, {
    attributes: true,
    attributeFilter: ['style'],
  })
  scheduleRefresh()

  return () => {
    disposed = true
    outlineObserver.disconnect()
    scheduleRefresh.cancel()
    disconnectHeadings()
    currentSurface = undefined
    visibleIds.clear()
    syncOutlineClasses()
  }
}
