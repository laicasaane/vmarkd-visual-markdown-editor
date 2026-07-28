import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  docLargeMode,
  refreshOutline,
  refreshStatusBarMarker,
  setOutlineRefresher,
  setStatusBarRefresher,
  webviewEditorMode,
} from '../../src/host-session-state'

// Extracted from src/extension.ts (task 405): the per-document maps + the two
// indirection refreshers that used to be bare module-level `let`s reassigned from
// inside activate(). Moving them out first (before doc-sync/wiki/etc.) avoids a
// circular import — every later extraction reads these maps or calls these
// refreshers without importing back into extension.ts.
describe('host-session-state', () => {
  beforeEach(() => {
    docLargeMode.clear()
    webviewEditorMode.clear()
    setStatusBarRefresher(() => {})
    setOutlineRefresher(() => {})
  })

  it('docLargeMode / webviewEditorMode are shared, mutable maps', () => {
    docLargeMode.set('file:///a.md', {
      blocks: 1,
      chars: 2,
      contentVisibility: false,
      streaming: false,
      incremental: false,
    })
    webviewEditorMode.set('file:///a.md', 'wysiwyg')
    expect(docLargeMode.get('file:///a.md')?.blocks).toBe(1)
    expect(webviewEditorMode.get('file:///a.md')).toBe('wysiwyg')
  })

  it('refreshStatusBarMarker() calls whatever was last registered via setStatusBarRefresher()', () => {
    const fn = vi.fn()
    setStatusBarRefresher(fn)
    refreshStatusBarMarker()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('refreshOutline() calls whatever was last registered via setOutlineRefresher()', () => {
    const fn = vi.fn()
    setOutlineRefresher(fn)
    refreshOutline()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('defaults to a no-op before any refresher is registered (never throws)', () => {
    // beforeEach already reset to no-ops above; this documents that default explicitly
    // rather than relying on registration order across test files.
    expect(() => refreshStatusBarMarker()).not.toThrow()
    expect(() => refreshOutline()).not.toThrow()
  })
})
