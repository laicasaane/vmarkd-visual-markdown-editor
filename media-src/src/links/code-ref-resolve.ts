// Task 229 — host round-trip for code-ref existence ("unresolved paths stay plain — no
// dead-link chips"). Mirrors render-cache-client.ts's `diagram-cache-get` shape: a batched,
// requestId-correlated ask, a fallback timer so a dropped reply can't wedge a path as
// "forever pending", and `post` threaded in per-call (not a module-level `vscode` global) so
// this stays unit-testable without a real webview.
//
// The cache/pending-by-requestId maps are module-level singletons (same pattern as
// wiki-serialize.ts's `_knownPages` / render-cache-client's `pending`) — there is exactly one
// resolver per webview session, shared by every `observeCodeRefs(root)` instance (IR/WYSIWYG's
// `#app` binding AND the Preview pane's own binding both ask the SAME host).

import type { WebviewMessage } from '../../../src/shared/protocol'
import { logToHost } from '../util/webview-log'

const RESOLVE_TIMEOUT_MS = 2000
// Coalesce same-frame discoveries (many text nodes finding the same new path at once, or a
// burst of edits) into one request instead of one per text node.
const BATCH_DEBOUNCE_MS = 50

const resolvedCache = new Map<string, boolean>() // path -> exists
const inFlight = new Set<string>() // paths currently part of an unanswered request
const requestPaths = new Map<string, string[]>() // requestId -> the paths it asked
const reapplyCallbacks = new Set<() => void>()
let batchQueue = new Set<string>()
let batchTimer = 0
let requestSeq = 0

/** Cached resolution for `path`: true (exists), false (confirmed missing), or undefined (not
 *  yet asked / still in flight — decorator should leave it plain for now). */
export function codeRefResolution(path: string): boolean | undefined {
  return resolvedCache.get(path)
}

/** A decorator instance registers here so a host reply (which can land anywhere in the
 *  document, not necessarily the block that triggered the request) re-runs every live
 *  decorator instead of only the one that happened to ask first. Returns an unregisterer. */
export function registerCodeRefReapply(cb: () => void): () => void {
  reapplyCallbacks.add(cb)
  return () => reapplyCallbacks.delete(cb)
}

function flushBatch(post: (msg: WebviewMessage) => void): void {
  batchTimer = 0
  const paths = Array.from(batchQueue)
  batchQueue = new Set()
  if (paths.length === 0) return
  const requestId = `coderef-${++requestSeq}`
  requestPaths.set(requestId, paths)
  window.setTimeout(() => {
    if (!requestPaths.has(requestId)) return // already answered — nothing to fall back on
    requestPaths.delete(requestId)
    for (const path of paths) inFlight.delete(path) // allow a retry on the next decoration pass
    logToHost(
      `code-ref-resolve: host reply for ${requestId} never arrived — leaving ${paths.length} path(s) unresolved after ${RESOLVE_TIMEOUT_MS} ms`,
    )
  }, RESOLVE_TIMEOUT_MS)
  post({ command: 'resolve-code-refs', requestId, paths })
}

/** Queue `path` for a batched host existence check, deduped against already-known/in-flight
 *  paths. Safe to call once per candidate match found during a decoration pass. */
export function requestCodeRefResolution(
  path: string,
  post: (msg: WebviewMessage) => void,
): void {
  if (resolvedCache.has(path) || inFlight.has(path)) return
  inFlight.add(path)
  batchQueue.add(path)
  if (!batchTimer)
    batchTimer = window.setTimeout(() => flushBatch(post), BATCH_DEBOUNCE_MS)
}

/** Host reply (`code-refs-resolved`) — resolve exactly the paths THIS request asked (never the
 *  whole `inFlight` set: a second batch can already be queued/in-flight by the time an earlier
 *  reply lands, and crediting it to the wrong request would wrongly mark an unripe path as
 *  "confirmed missing"). Re-runs every registered decorator so newly-known paths get chipped —
 *  or confirmed to stay plain — without waiting for an unrelated future edit. */
export function applyCodeRefResolution(
  requestId: string,
  existing: string[],
): void {
  const paths = requestPaths.get(requestId)
  if (!paths) return // stale (already timed out) or unknown requestId — ignore
  requestPaths.delete(requestId)
  const existingSet = new Set(existing)
  for (const path of paths) {
    resolvedCache.set(path, existingSet.has(path))
    inFlight.delete(path)
  }
  for (const cb of reapplyCallbacks) cb()
}

/** Test-only reset (mirrors wiki-cache.ts's `_resetCacheMap`) — the module state above is a
 *  process-lifetime singleton in production but must not leak between unit tests. */
export function _resetCodeRefResolutionForTests(): void {
  resolvedCache.clear()
  inFlight.clear()
  requestPaths.clear()
  reapplyCallbacks.clear()
  batchQueue = new Set()
  batchTimer = 0
  requestSeq = 0
}
