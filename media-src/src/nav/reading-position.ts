import type Vditor from 'vditor'
import type {
  ReadingPositionState,
  VsCodeApi,
} from '../../../src/shared/protocol'
import { blockModeElement } from '../util/source-map'
import { findScroller } from '../chrome/toolbar-scroll-guard'
import { ensureFoldTargetVisible } from './section-fold'
import { ensureHoistBlockVisible } from './section-hoist'
import { createBlockAnchor, resolveBlockAnchor } from './block-anchor'
import { topLevelBlocks } from './section-range'

const STATE_KEY = 'vmdeReadingPosition'
const SAVE_DELAY_MS = 250

interface WebviewState {
  [STATE_KEY]?: ReadingPositionState
  [key: string]: unknown
}

type StateApi = Pick<VsCodeApi, 'getState' | 'setState'>

export interface RestoreDecision {
  enabled: boolean
  state?: ReadingPositionState
  prepaintIntent: number
  explicitReveal: boolean
}

export function shouldRestoreReadingPosition(input: RestoreDecision): boolean {
  return Boolean(
    input.enabled &&
      input.state &&
      input.prepaintIntent <= 0 &&
      !input.explicitReveal,
  )
}

function childPath(root: Node, node: Node): number[] | null {
  const path: number[] = []
  let current: Node | null = node
  while (current && current !== root) {
    const parent: Node | null = current.parentNode
    if (!parent) return null
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, current))
    current = parent
  }
  return current === root ? path : null
}

function nodeAtPath(root: Node, path: readonly number[]): Node | null {
  let node: Node = root
  for (const index of path) {
    const child = node.childNodes[index]
    if (!child) return null
    node = child
  }
  return node
}

function maxOffset(node: Node): number {
  return node.nodeType === Node.TEXT_NODE
    ? (node.textContent?.length ?? 0)
    : node.childNodes.length
}

function visibleAnchorBlock(
  blocks: readonly HTMLElement[],
  scroller: HTMLElement,
): HTMLElement | null {
  const top = scrollerViewportTop(scroller)
  return (
    blocks.find((block) => block.getBoundingClientRect().bottom > top + 1) ??
    blocks.at(-1) ??
    null
  )
}

function scrollerViewportTop(scroller: HTMLElement): number {
  return scroller === document.scrollingElement ||
    scroller === document.documentElement ||
    scroller === document.body
    ? 0
    : scroller.getBoundingClientRect().top
}

function snapshotPosition(vditor: Vditor): ReadingPositionState | undefined {
  const surface = blockModeElement(vditor)
  if (!surface) return undefined
  const blocks = topLevelBlocks(surface)
  const scroller = findScroller(surface)
  const viewportBlock = visibleAnchorBlock(blocks, scroller)
  if (!viewportBlock) return undefined
  const state: ReadingPositionState = {
    anchor: createBlockAnchor(viewportBlock, blocks),
    scrollOffset:
      viewportBlock.getBoundingClientRect().top - scrollerViewportTop(scroller),
  }
  const selection = window.getSelection()
  const caretNode = selection?.rangeCount ? selection.anchorNode : null
  const caretBlock =
    caretNode instanceof Element
      ? caretNode.closest<HTMLElement>('[data-block]')
      : caretNode?.parentElement?.closest<HTMLElement>('[data-block]')
  if (caretNode && caretBlock && surface.contains(caretBlock)) {
    const path = childPath(caretBlock, caretNode)
    if (path) {
      state.caret = {
        anchor: createBlockAnchor(caretBlock, blocks),
        path,
        offset: selection?.anchorOffset ?? 0,
      }
    }
  }
  return state
}

function restorePosition(vditor: Vditor, state: ReadingPositionState): boolean {
  const surface = blockModeElement(vditor)
  if (!surface) return false
  const blocks = topLevelBlocks(surface)
  const block = resolveBlockAnchor(state.anchor, blocks)
  if (!block) return false
  ensureHoistBlockVisible(block)
  ensureFoldTargetVisible(block)
  const scroller = findScroller(surface)
  const delta =
    block.getBoundingClientRect().top -
    scrollerViewportTop(scroller) -
    state.scrollOffset
  scroller.scrollTop = Math.max(0, scroller.scrollTop + delta)

  if (state.caret) {
    const caretBlock = resolveBlockAnchor(state.caret.anchor, blocks)
    if (caretBlock) {
      ensureHoistBlockVisible(caretBlock)
      ensureFoldTargetVisible(caretBlock)
      const node = nodeAtPath(caretBlock, state.caret.path) ?? caretBlock
      const range = document.createRange()
      range.setStart(node, Math.min(state.caret.offset, maxOffset(node)))
      range.collapse(true)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
  }
  return true
}

export interface ReadingPositionController {
  save(): ReadingPositionState | undefined
  cancelRestore(): void
  dispose(): void
}

let activeController: ReadingPositionController | undefined
let explicitRevealBeforeInstall = false

export function noteExplicitReadingPositionReveal(): void {
  if (activeController) activeController.cancelRestore()
  else explicitRevealBeforeInstall = true
}

function webviewState(api: StateApi): WebviewState {
  const value = api.getState<WebviewState>()
  return value && typeof value === 'object' ? value : {}
}

export function installReadingPosition(
  vditor: Vditor,
  hostState: ReadingPositionState | undefined,
  persist: (state: ReadingPositionState) => void,
  enabled: boolean,
  api: StateApi = vscode,
): ReadingPositionController {
  activeController?.dispose()
  let disposed = false
  let restoreCancelled = explicitRevealBeforeInstall
  explicitRevealBeforeInstall = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const save = (): ReadingPositionState | undefined => {
    if (disposed || !enabled) return undefined
    const state = snapshotPosition(vditor)
    if (!state) return undefined
    api.setState({ ...webviewState(api), [STATE_KEY]: state })
    persist(state)
    return state
  }
  const scheduleSave = () => {
    if (!enabled || disposed) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      save()
    }, SAVE_DELAY_MS)
  }
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') save()
  }
  const onPageHide = () => save()
  const app = document.getElementById('app')
  app?.addEventListener('scroll', scheduleSave, true)
  document.addEventListener('selectionchange', scheduleSave)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', onPageHide)

  const controller: ReadingPositionController = {
    save,
    cancelRestore() {
      restoreCancelled = true
    },
    dispose() {
      if (disposed) return
      if (timer) clearTimeout(timer)
      save()
      disposed = true
      app?.removeEventListener('scroll', scheduleSave, true)
      document.removeEventListener('selectionchange', scheduleSave)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      if (activeController === controller) activeController = undefined
    },
  }
  activeController = controller

  const state = webviewState(api)[STATE_KEY] ?? hostState
  requestAnimationFrame(() => {
    const prepaintIntent = Number(
      (window as typeof window & { __vmdeScroll?: { intent?: number } })
        .__vmdeScroll?.intent ?? 0,
    )
    if (
      !disposed &&
      shouldRestoreReadingPosition({
        enabled,
        state,
        prepaintIntent,
        explicitReveal: restoreCancelled,
      })
    ) {
      restorePosition(vditor, state!)
    }
  })
  return controller
}
