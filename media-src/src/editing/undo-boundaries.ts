import type Vditor from 'vditor'
import { guardComposition } from '../util/caret-gesture'

type UndoMode = 'ir' | 'wysiwyg' | 'sv'
const MODEL_COMMAND_KEYS = new Set([
  'b',
  'i',
  'd',
  'h',
  'l',
  'e',
  'k',
  'm',
  'u',
  '=',
  '-',
  '+',
  '_',
  'x',
])

interface UndoInner {
  currentMode: UndoMode
  options?: {
    undoDelay?: number
    input?: (markdown: string) => void
  }
  ir?: { processTimeoutId?: number }
  wysiwyg?: { afterRenderTimeoutId?: number }
  sv?: { processTimeoutId?: number }
  undo?: {
    addToUndoStack?: (inner: UndoInner) => void
    ir?: { undoStack?: unknown[] }
    wysiwyg?: { undoStack?: unknown[] }
    sv?: { undoStack?: unknown[] }
  }
}

export function isSyntaxPromotionText(text: string): boolean {
  return /^(?:#{1,6}|[-+*>]|\d{1,9}[.)]) $/.test(
    text.replace(/[\u200b\u00a0]/g, ''),
  )
}

function pendingTimer(inner: UndoInner): number | undefined {
  if (inner.currentMode === 'wysiwyg')
    return inner.wysiwyg?.afterRenderTimeoutId
  if (inner.currentMode === 'sv') return inner.sv?.processTimeoutId
  return inner.ir?.processTimeoutId
}

export function checkpointUndoBoundary(
  inner: UndoInner,
  cancelPending: boolean,
): void {
  const timer = pendingTimer(inner)
  if (cancelPending && timer !== undefined) clearTimeout(timer)
  inner.undo?.addToUndoStack?.(inner)
}

function editableBlockText(target: EventTarget | null): string | null {
  if (!(target instanceof Node)) return null
  const selection = getSelection()
  const node = selection?.rangeCount ? selection.anchorNode : target
  const element =
    node instanceof Element ? node : (node as Node | null)?.parentElement
  const block = element?.closest<HTMLElement>('[data-block]')
  return block?.textContent ?? null
}

export function isUndoBoundaryCommand(event: KeyboardEvent): boolean {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return false
  const key = event.key.toLowerCase()
  if (key === 'c' || key === 'r' || key === 'f' || key === 'g')
    return event.shiftKey
  return MODEL_COMMAND_KEYS.has(key)
}

function isToolbarAction(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const action = target.closest<HTMLElement>(
    '.vditor-toolbar button, .vditor-panel button',
  )
  return Boolean(
    action && action.dataset.type !== 'undo' && action.dataset.type !== 'redo',
  )
}

export function installUndoBoundaries(
  vditor: Vditor,
  win: Window & typeof globalThis = window,
): () => void {
  const inner = () => (vditor as unknown as { vditor: UndoInner }).vditor
  let dirty = false
  let dirtyTimer: ReturnType<typeof setTimeout> | undefined
  const markDirty = () => {
    dirty = true
    if (dirtyTimer) clearTimeout(dirtyTimer)
    const delay = Number(inner().options?.undoDelay ?? 800)
    dirtyTimer = setTimeout(() => {
      dirty = false
      dirtyTimer = undefined
    }, delay + 50)
  }
  const boundary = (forceBefore = false) => {
    const current = inner()
    if (forceBefore || dirty) checkpointUndoBoundary(current, true)
    const stackLength = current.undo?.[current.currentMode]?.undoStack?.length
    setTimeout(() => {
      const settled = inner()
      const settledLength =
        settled.undo?.[settled.currentMode]?.undoStack?.length
      const timer = pendingTimer(settled)
      if (timer !== undefined) clearTimeout(timer)
      if (stackLength === undefined || settledLength === stackLength)
        checkpointUndoBoundary(settled, false)
      settled.options?.input?.(vditor.getValue())
      dirty = false
      if (dirtyTimer) clearTimeout(dirtyTimer)
      dirtyTimer = undefined
    }, 0)
  }
  const onPaste = () => boundary()
  const onKeydown = (event: KeyboardEvent) => {
    if (guardComposition(event)) return
    if (event.key === 'Enter' || isUndoBoundaryCommand(event)) boundary()
  }
  const onClick = (event: MouseEvent) => {
    if (isToolbarAction(event.target)) boundary()
  }
  const onInput = (event: Event) => {
    const input = event as InputEvent
    if (input.isComposing) return
    const current = inner()
    if (
      current.currentMode === 'ir' &&
      input.inputType === 'insertText' &&
      input.data === ' '
    ) {
      const text = editableBlockText(event.target)
      if (text !== null && isSyntaxPromotionText(text)) {
        boundary(true)
        return
      }
    }
    markDirty()
  }

  win.addEventListener('paste', onPaste, true)
  win.addEventListener('keydown', onKeydown, true)
  win.addEventListener('click', onClick, true)
  win.addEventListener('input', onInput, true)
  return () => {
    if (dirtyTimer) clearTimeout(dirtyTimer)
    win.removeEventListener('paste', onPaste, true)
    win.removeEventListener('keydown', onKeydown, true)
    win.removeEventListener('click', onClick, true)
    win.removeEventListener('input', onInput, true)
  }
}
