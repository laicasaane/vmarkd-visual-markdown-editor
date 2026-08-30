import { invalidateCaret, requestCaret } from './caret'
import { activeModeElement } from '../util/source-map'
import { expandMarker } from 'vditor/src/ts/ir/expandMarker'
import { innerVditor, type InnerVditor } from '../util/inner-vditor'
import {
  isCompositionActive,
  subscribeCompositionState,
} from '../util/caret-gesture'

// Reveal-in-Source (task 16): remember the caret inside the editor. When the
// command runs from VS Code chrome (the toolbar button), focus leaves the
// webview iframe and the live selection collapses to the editor start — so the
// raw selection would read as offset 0. We snapshot the last in-editor caret on
// selectionchange and restore it before measuring, so the button and the command
// palette resolve to the SAME caret. Stored as a cloned Range.
let lastEditorRange: Range | null = null

function trackEditorCaret() {
  const v = window.vditor
  if (!v) return
  const editor = activeModeElement(v)
  if (!editor) return
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const node = sel.anchorNode
  if (!node || !editor.contains(node)) return
  // ignore a caret collapsed to the very start of the editor (the focus-loss
  // artifact we are guarding against) so it can't overwrite a real position
  if (node === editor && sel.anchorOffset === 0 && sel.isCollapsed) return
  lastEditorRange = sel.getRangeAt(0).cloneRange()
}

// Wire the selectionchange snapshot. Called once from main.ts (the caret state is
// a singleton across re-inits — it tracks whatever editor is currently mounted).
export function installEditorCaretTracking(): void {
  document.addEventListener('selectionchange', trackEditorCaret)
}

const EXPAND_CLASS = 'vditor-ir__node--expand'
const MARKER_DWELL_MS = 100

interface MarkerRevealRuntime {
  document: Document
  getVditor(): InnerVditor | null
  requestFrame(callback: FrameRequestCallback): number
  cancelFrame(handle: number): void
  setDwell(callback: () => void, delay: number): number
  clearDwell(handle: number): void
  compositionActive(): boolean
  subscribeComposition(listener: (active: boolean) => void): () => void
}

const defaultMarkerRevealRuntime = (): MarkerRevealRuntime => ({
  document,
  getVditor: innerVditor,
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  setDwell: (callback, delay) => window.setTimeout(callback, delay),
  clearDwell: (handle) => window.clearTimeout(handle),
  compositionActive: isCompositionActive,
  subscribeComposition: subscribeCompositionState,
})

function selectedRangeInIr(
  runtime: MarkerRevealRuntime,
  vditor: InnerVditor,
): { editor: HTMLElement; range: Range } | null {
  if (vditor.currentMode !== 'ir' || vditor.ir?.composingLock) return null
  const editor = vditor.ir?.element
  const selection = runtime.document.getSelection()
  if (!editor || !selection?.rangeCount) return null
  const range = selection.getRangeAt(0).cloneRange()
  if (
    !range.startContainer.isConnected ||
    !range.endContainer.isConnected ||
    !editor.contains(range.startContainer) ||
    !editor.contains(range.endContainer)
  )
    return null
  return { editor, range }
}

function sameRange(a: Range | null, b: Range): boolean {
  return Boolean(
    a &&
      a.startContainer === b.startContainer &&
      a.startOffset === b.startOffset &&
      a.endContainer === b.endContainer &&
      a.endOffset === b.endOffset,
  )
}

function revealSelectionMarkers(
  editor: HTMLElement,
  range: Range,
  vditor: InnerVditor,
  allowVisibleMarkerEdit: boolean,
): { current: Set<HTMLElement>; range: Range } {
  const previouslyExpanded = new Set(
    editor.querySelectorAll<HTMLElement>(`.${EXPAND_CLASS}`),
  )
  expandMarker(range, vditor as unknown as IVditor)
  const current = new Set(
    editor.querySelectorAll<HTMLElement>(`.${EXPAND_CLASS}`),
  )
  // expandMarker collapses the old node synchronously. Restore it before the frame paints; the
  // dwell timer removes it only if the selection remains elsewhere.
  for (const node of previouslyExpanded) {
    if (node.isConnected && !current.has(node)) node.classList.add(EXPAND_CLASS)
  }
  return {
    current,
    range: normalizeMarkerNavigationCaret(
      range,
      previouslyExpanded,
      allowVisibleMarkerEdit,
    ),
  }
}

function normalizeMarkerNavigationCaret(
  range: Range,
  previouslyExpanded: ReadonlySet<HTMLElement>,
  allowVisibleMarkerEdit: boolean,
): Range {
  if (!range.collapsed) return range
  const start =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as Element)
      : range.startContainer.parentElement
  const marker = start?.closest<HTMLElement>('.vditor-ir__marker')
  const node = marker?.closest<HTMLElement>('.vditor-ir__node')
  if (
    !marker ||
    !node ||
    (allowVisibleMarkerEdit && previouslyExpanded.has(node)) ||
    !node.parentNode
  )
    return range

  const markers = Array.from(
    node.querySelectorAll<HTMLElement>(':scope > .vditor-ir__marker'),
  )
  const markerIndex = markers.indexOf(marker)
  const before = markerIndex < 0 || markerIndex < markers.length / 2
  const siblings = Array.from(node.parentNode.childNodes)
  const nodeIndex = siblings.indexOf(node)
  if (nodeIndex < 0) return range

  requestCaret({
    node: node.parentNode,
    offset: nodeIndex + (before ? 0 : 1),
  })
  const selection = window.getSelection()
  const normalized = selection?.rangeCount
    ? selection.getRangeAt(0).cloneRange()
    : range
  // This is a one-shot normalization of a native selection movement, not a caret intent that may
  // override the next programmatic navigation. Keep the ADR-owned writer but retire its retry loop
  // immediately after the synchronous placement succeeds.
  invalidateCaret()
  return normalized
}

function collapseSettledPrevious(
  editor: HTMLElement,
  current: ReadonlySet<HTMLElement>,
): void {
  for (const node of editor.querySelectorAll<HTMLElement>(`.${EXPAND_CLASS}`)) {
    if (!current.has(node)) node.classList.remove(EXPAND_CLASS)
  }
}

/**
 * Reveal IR Markdown markers from the live selection instead of a key whitelist. Selection changes
 * are frame-coalesced so Home/End/Page navigation, pointer drags, and programmatic caret moves all
 * share one path. Previously expanded nodes survive until the caret has dwelled elsewhere for
 * 100 ms, preventing arrow traversal from flashing collapsed render/source states between keys.
 */
export function installIrMarkerReveal(
  overrides: Partial<MarkerRevealRuntime> = {},
): () => void {
  const runtime = { ...defaultMarkerRevealRuntime(), ...overrides }
  let frame = 0
  let dwell = 0
  let generation = 0
  let lastRange: Range | null = null
  let lastCurrent = new Set<HTMLElement>()
  let pendingComposition = false
  let allowVisibleMarkerEdit = false

  const clearDwell = () => {
    if (!dwell) return
    runtime.clearDwell(dwell)
    dwell = 0
  }

  const apply = () => {
    frame = 0
    if (runtime.compositionActive()) {
      pendingComposition = true
      return
    }
    const vditor = runtime.getVditor()
    if (!vditor) return
    const selected = selectedRangeInIr(runtime, vditor)
    if (!selected) {
      // `compositionend` clears VMDE's capture-phase authority before Vditor clears its own
      // bubble-phase lock. One more frame lets that synchronous input/spin finish before we read
      // or write marker classes; disconnected mid-spin ranges otherwise fail closed here.
      if (vditor.currentMode === 'ir' && vditor.ir?.composingLock) schedule()
      return
    }
    const { editor, range } = selected
    if (
      sameRange(lastRange, range) &&
      [...lastCurrent].every(
        (node) => node.isConnected && node.classList.contains(EXPAND_CLASS),
      )
    )
      return

    const revealed = revealSelectionMarkers(
      editor,
      range,
      vditor,
      allowVisibleMarkerEdit,
    )
    allowVisibleMarkerEdit = false
    const { current } = revealed

    lastRange = revealed.range
    lastCurrent = current
    const appliedGeneration = ++generation
    clearDwell()
    dwell = runtime.setDwell(() => {
      dwell = 0
      if (appliedGeneration !== generation || runtime.compositionActive())
        return
      collapseSettledPrevious(editor, current)
    }, MARKER_DWELL_MS)
  }

  const schedule = () => {
    if (frame) return
    frame = runtime.requestFrame(apply)
  }
  const onSelectionChange = () => schedule()
  const onPointerDown = () => {
    allowVisibleMarkerEdit = true
  }
  const onKeyDown = () => {
    allowVisibleMarkerEdit = false
  }
  const unsubscribeComposition = runtime.subscribeComposition((active) => {
    if (active) {
      pendingComposition = true
      clearDwell()
      return
    }
    if (pendingComposition) {
      pendingComposition = false
      lastRange = null
      schedule()
    }
  })

  runtime.document.addEventListener('selectionchange', onSelectionChange)
  runtime.document.addEventListener('pointerdown', onPointerDown, true)
  runtime.document.addEventListener('keydown', onKeyDown, true)
  return () => {
    runtime.document.removeEventListener('selectionchange', onSelectionChange)
    runtime.document.removeEventListener('pointerdown', onPointerDown, true)
    runtime.document.removeEventListener('keydown', onKeyDown, true)
    unsubscribeComposition()
    if (frame) runtime.cancelFrame(frame)
    clearDwell()
  }
}

// The last caret seen INSIDE the editor, without touching the live selection. Task 390 needs it
// because WYSIWYG's link button opens a popover and focuses its input, so by the time the debounced
// edit posts, the live selection is in that input and the edited block can no longer be resolved
// from it.
export function trackedEditorRange(): Range | null {
  return lastEditorRange
}

// Restore the remembered caret when the live selection is missing or collapsed
// to the editor start (focus left the iframe). Returns true if a restore ran.
//
// The write goes through caret.ts's requestCaret (ADR-0007 / task 446) instead of a hand-rolled
// removeAllRanges()/addRange() — this module is one of the six the ADR names as a former direct
// writer. The snapshot mechanism above (trackEditorCaret / lastEditorRange / trackedEditorRange)
// stays here unchanged: it only ever READS the selection, so it's outside the ADR's scope (every
// programmatic selection WRITE), and task 390's link path reads trackedEditorRange() directly.
export function restoreEditorCaretIfLost(): boolean {
  const v = window.vditor
  if (!v || !lastEditorRange) return false
  const editor = activeModeElement(v)
  if (!editor) return false
  const sel = window.getSelection()
  const node = sel && sel.rangeCount > 0 ? sel.anchorNode : null
  const live = node && editor.contains(node)
  const collapsedAtStart =
    node === editor && sel!.anchorOffset === 0 && sel!.isCollapsed
  if (live && !collapsedAtStart) return false // a real caret is present; keep it
  return requestCaret({
    node: lastEditorRange.startContainer,
    offset: lastEditorRange.startOffset,
  })
}
