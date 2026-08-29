import type Vditor from 'vditor'
import { coalescePerFrame } from '../util/observe-coalesce'

export const OUTLINE_VIEWPORT_CLASS = 'vmde-outline-item--in-viewport'
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
  let resizeObserver: ResizeObserver | undefined
  let currentSurface: HTMLElement | undefined
  let currentRoot: HTMLElement | undefined
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

  const projectSections = (): void => {
    const surface = currentSurface
    const root = currentRoot
    if (disposed || !surface || !root || !surface.isConnected) return
    const headings = Array.from(observedHeadings).filter(
      (heading) => heading.isConnected && surface.contains(heading),
    )
    const rootRect = root.getBoundingClientRect()
    const viewportTop = rootRect.top + VIEWPORT_INSET_PX
    const viewportBottom = rootRect.bottom - VIEWPORT_INSET_PX
    const surfaceEnd =
      surface === root
        ? rootRect.top + surface.scrollHeight - root.scrollTop
        : surface.getBoundingClientRect().top + surface.scrollHeight
    visibleIds.clear()
    for (const [index, heading] of headings.entries()) {
      const start = heading.getBoundingClientRect().top
      const next = headings[index + 1]
      const end = next ? next.getBoundingClientRect().top : surfaceEnd
      if (end > viewportTop && start < viewportBottom) {
        visibleIds.add(heading.id)
      }
    }
    syncOutlineClasses()
  }

  const scheduleProjection = coalescePerFrame(projectSections)

  const disconnectHeadings = (): void => {
    generation++
    scheduleProjection.cancel()
    headingObserver?.disconnect()
    headingObserver = undefined
    resizeObserver?.disconnect()
    resizeObserver = undefined
    currentRoot?.removeEventListener('scroll', scheduleProjection)
    currentRoot = undefined
    observedHeadings = new Set()
  }

  const bindInvalidations = (
    surface: HTMLElement,
    root: HTMLElement,
    headings: HTMLElement[],
  ): void => {
    const observerGeneration = generation
    headingObserver = new IntersectionObserver(
      () => {
        if (disposed || observerGeneration !== generation) return
        scheduleProjection()
      },
      {
        root,
        rootMargin: `-${VIEWPORT_INSET_PX}px 0px -${VIEWPORT_INSET_PX}px 0px`,
        threshold: 0,
      },
    )
    for (const heading of headings) headingObserver.observe(heading)
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleProjection)
      resizeObserver.observe(root)
      if (surface !== root) resizeObserver.observe(surface)
      for (const heading of headings) resizeObserver.observe(heading)
    }
    root.addEventListener('scroll', scheduleProjection, { passive: true })
    scheduleProjection()
  }

  const refresh = (): void => {
    if (disposed) return
    const nextSurface = activeHeadingSurface(state)
    disconnectHeadings()
    visibleIds.clear()
    syncOutlineClasses()

    if (!isObservableSurface(outlineEl, nextSurface)) {
      currentSurface = nextSurface
      return
    }

    const headings = Array.from(
      nextSurface.querySelectorAll<HTMLElement>(HEADING_SELECTOR),
    ).filter((heading) => heading.id && heading.isConnected)
    currentSurface = nextSurface
    const root = scrollRoot(state, nextSurface)
    currentRoot = root
    observedHeadings = new Set(headings)

    bindInvalidations(nextSurface, root, headings)
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
