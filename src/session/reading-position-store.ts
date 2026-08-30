import type { ReadingPositionState } from '../shared/protocol'

export const ReadingPositionStoreKey = 'vmde.readingPositions'
const ReadingPositionStoreLimit = 50

export interface ReadingPositionEntry {
  uri: string
  state: ReadingPositionState
}

function isBlockAnchor(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const anchor = value as Record<string, unknown>
  return (
    typeof anchor.hash === 'string' &&
    Number.isInteger(anchor.index) &&
    (anchor.index as number) >= 0 &&
    Array.isArray(anchor.headingPath) &&
    anchor.headingPath.every((entry) => typeof entry === 'string')
  )
}

export function isReadingPositionState(
  value: unknown,
): value is ReadingPositionState {
  if (!value || typeof value !== 'object') return false
  const state = value as Record<string, unknown>
  if (!isBlockAnchor(state.anchor) || !Number.isFinite(state.scrollOffset))
    return false
  if (state.caret === undefined) return true
  if (!state.caret || typeof state.caret !== 'object') return false
  const caret = state.caret as Record<string, unknown>
  return (
    isBlockAnchor(caret.anchor) &&
    Array.isArray(caret.path) &&
    caret.path.every((entry) => Number.isInteger(entry) && entry >= 0) &&
    Number.isInteger(caret.offset) &&
    (caret.offset as number) >= 0
  )
}

export function readReadingPosition(
  entries: readonly ReadingPositionEntry[] | undefined,
  uri: string,
): ReadingPositionState | undefined {
  const state = entries?.find((entry) => entry.uri === uri)?.state
  return isReadingPositionState(state) ? state : undefined
}

export function updateReadingPositionLru(
  entries: readonly ReadingPositionEntry[] | undefined,
  uri: string,
  state: ReadingPositionState,
  limit = ReadingPositionStoreLimit,
): ReadingPositionEntry[] {
  return [
    { uri, state },
    ...(entries ?? []).filter((entry) => entry.uri !== uri),
  ].slice(0, Math.max(1, limit))
}
