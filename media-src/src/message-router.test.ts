// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Coverage-ratchet net (task 403 group 1) for the host->webview dispatch task 399 extracted
// from main.ts. Mirrors task 151's pattern (dispatch on a known command; log + no-op on an
// unhandled one) plus the highest-risk branches of handleUpdate — the echo-guard (task 38),
// the init-failure retry (task 151 item 3), and the external-update path (caret/scroll
// preservation + cache invalidation, #1912). Heavy collaborators (Vditor construction,
// diagram re-theme, live-config, the DOM caret/diff helpers) are mocked; the routing/dispatch
// logic and handleUpdate's own control flow are real.
const h = vi.hoisted(() => ({
  initVditor: vi.fn(),
  renderCacheThemeKey: vi.fn(() => 'KEY'),
  reportError: vi.fn(),
  logToHost: vi.fn(),
  saveVditorOptions: vi.fn(),
  applyBodyOptions: vi.fn(),
  swapStyle: vi.fn(),
  initOnlyChanged: vi.fn(() => false),
  setD2Config: vi.fn(),
  setRenderCacheConfig: vi.fn(),
  applyCacheHits: vi.fn(),
  rethemeDiagrams: vi.fn(),
  applyLinkOpenSetting: vi.fn(),
  applyPasteUrlSetting: vi.fn(),
  renderDiffMarkers: vi.fn(),
  clearDiffMarkers: vi.fn(),
  preserveCaretAndScroll: vi.fn((_v: unknown, mutate: () => void) => mutate()),
  restoreEditorCaretIfLost: vi.fn(),
  getCursorSourceOffset: vi.fn(() => -1),
  activeModeElement: vi.fn(() => null),
  lineAndTextForOffset: vi.fn(() => ({ line: -1, lineText: '' })),
}))
vi.mock('./vditor-init', () => ({
  initVditor: h.initVditor,
  renderCacheThemeKey: h.renderCacheThemeKey,
}))
vi.mock('./webview-log', () => ({
  reportError: h.reportError,
  logToHost: h.logToHost,
}))
vi.mock('./toolbar-actions', () => ({ saveVditorOptions: h.saveVditorOptions }))
vi.mock('./live-config', () => ({
  applyBodyOptions: h.applyBodyOptions,
  swapStyle: h.swapStyle,
  initOnlyChanged: h.initOnlyChanged,
}))
// d2ConfigFromOptions is the real one (a pure projection): mocking it away would hide whether the
// router still forwards every D2/geo option, which is exactly what the shared helper is for.
vi.mock('./d2-config', async (orig) => ({
  ...(await orig<typeof import('./d2-config')>()),
  setD2Config: h.setD2Config,
}))
vi.mock('./render-cache-client', () => ({
  setRenderCacheConfig: h.setRenderCacheConfig,
  applyCacheHits: h.applyCacheHits,
}))
vi.mock('./diagram-retheme', () => ({ rethemeDiagrams: h.rethemeDiagrams }))
vi.mock('./link-open-policy', () => ({
  applyLinkOpenSetting: h.applyLinkOpenSetting,
}))
vi.mock('./link-url', () => ({ applyPasteUrlSetting: h.applyPasteUrlSetting }))
vi.mock('./diff-markers', () => ({
  renderDiffMarkers: h.renderDiffMarkers,
  clearDiffMarkers: h.clearDiffMarkers,
}))
vi.mock('./caret-preserve', () => ({
  preserveCaretAndScroll: h.preserveCaretAndScroll,
}))
vi.mock('./editor-caret', () => ({
  restoreEditorCaretIfLost: h.restoreEditorCaretIfLost,
}))
vi.mock('./source-map', () => ({
  getCursorSourceOffset: h.getCursorSourceOffset,
  activeModeElement: h.activeModeElement,
  lineAndTextForOffset: h.lineAndTextForOffset,
}))

import {
  handleUpdate,
  installMessageRouter,
  markInlineInited,
} from './message-router'
import { sessionState } from './editor-session-state'
import type { InitPayload } from './init-payload'

function boot() {
  const post = vi.fn()
  ;(globalThis as unknown as { vscode: unknown }).vscode = {
    postMessage: post,
  }
  return { post }
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.lastInitMsg = null
  sessionState.applyingExtensionUpdate = false
  sessionState.streaming = false
  sessionState.editSync = null
  ;(window as any).vditor = undefined
})
afterEach(() => {
  vi.useRealTimers()
})

describe('installMessageRouter — routing', () => {
  it('dispatches a known command to its handler', () => {
    installMessageRouter(window)
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { command: 'reload-css', id: 'foo', css: '.x{}' },
      }),
    )
    expect(h.swapStyle).toHaveBeenCalledWith('foo', '.x{}')
  })

  it('logs and no-ops on an unhandled command instead of throwing', () => {
    installMessageRouter(window)
    expect(() =>
      window.dispatchEvent(
        new MessageEvent('message', { data: { command: 'not-a-real-one' } }),
      ),
    ).not.toThrow()
    expect(h.logToHost).toHaveBeenCalledWith(
      expect.stringContaining('not-a-real-one'),
    )
  })

  it('ignores a message with no string command (e.g. a foreign postMessage)', () => {
    installMessageRouter(window)
    expect(() =>
      window.dispatchEvent(new MessageEvent('message', { data: {} })),
    ).not.toThrow()
    expect(h.logToHost).not.toHaveBeenCalled()
  })
})

// Task 148 item 3 (second half): a known command with a MISSING or WRONG-TYPE required field used
// to reach its handler as-is — TypeScript's HostMessage union only checks internal callers, not
// what actually arrives on the wire, so a malformed/drifted message became a runtime shape error
// INSIDE the handler instead of a rejection at the dispatch seam. Lightweight discriminant +
// required-field check, routed to the SAME logToHost the unhandled-command branch already uses
// (never throws) — deliberately no schema library for a same-process seam.
describe('installMessageRouter — payload shape validation (task 148 item 3)', () => {
  it('drops a known command missing a required field instead of calling its handler', () => {
    installMessageRouter(window)
    // reload-css requires both `id` and `css` (handleReloadCss calls swapStyle(msg.id, msg.css));
    // `css` is missing here.
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { command: 'reload-css', id: 'foo' },
      }),
    )
    expect(h.swapStyle).not.toHaveBeenCalled()
    expect(h.logToHost).toHaveBeenCalledWith(
      expect.stringContaining('reload-css'),
    )
  })

  it('drops a known command whose required field has the wrong type', () => {
    installMessageRouter(window)
    // set-theme's `theme` must be a string; handleSetTheme forwards it into rethemeDiagrams.
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { command: 'set-theme', theme: 42 },
      }),
    )
    expect(h.rethemeDiagrams).not.toHaveBeenCalled()
    expect(h.logToHost).toHaveBeenCalledWith(
      expect.stringContaining('set-theme'),
    )
  })

  it('still dispatches a valid message with every required field present and correctly typed', () => {
    installMessageRouter(window)
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { command: 'reload-css', id: 'foo', css: '.x{}' },
        // A realistic trusted origin — a bare jsdom MessageEvent defaults `origin` to `""`, which
        // would (correctly) trip the UNRELATED origin-mismatch warning (task 148 item 3) and
        // break this test's "no logging at all" assertion for a reason that has nothing to do
        // with what this test checks (shape validation). See the dedicated origin-check describe
        // block below for that behaviour.
        origin: 'vscode-webview://test-instance',
      }),
    )
    expect(h.swapStyle).toHaveBeenCalledWith('foo', '.x{}')
    expect(h.logToHost).not.toHaveBeenCalled()
  })

  it('does not shape-check a command with no required fields (e.g. nothing to validate)', () => {
    installMessageRouter(window)
    // uploaded requires `files` to be an array; an empty array is a VALID array, not a missing field.
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { command: 'uploaded', files: [] },
        origin: 'vscode-webview://test-instance', // see comment above
      }),
    )
    expect(h.logToHost).not.toHaveBeenCalled()
  })
})

// Task 148 item 3 (origin check — WARN-ONLY). Uses a fresh `EventTarget` per test instead of the
// shared jsdom `window` other describe blocks in this file use: `installMessageRouter` attaches a
// NEW listener each call and nothing in this file ever removes old ones, so listeners accumulate
// on `window` across the whole test file's run. That's harmless for tests that only check "was
// the handler called with X", but these tests check EXACT call counts (rate-limiting semantics),
// which stale listeners from earlier tests would silently inflate. `installMessageRouter`'s
// parameter only needs `addEventListener`/the shape a `MessageEvent` handler expects — a plain
// `EventTarget` satisfies that with zero cross-test interference.
describe('installMessageRouter — origin check (task 148 item 3, warn-only)', () => {
  function freshTarget() {
    return new EventTarget() as unknown as Window
  }

  it('warns once (not per-message) when messages arrive with an unexpected origin, but still dispatches every one', () => {
    const target = freshTarget()
    installMessageRouter(target)
    for (let i = 0; i < 3; i++) {
      target.dispatchEvent(
        new MessageEvent('message', {
          data: { command: 'reload-css', id: `f${i}`, css: '.x{}' },
          origin: 'https://evil.example.com',
        }),
      )
    }
    expect(h.swapStyle).toHaveBeenCalledTimes(3)
    const originWarnings = h.logToHost.mock.calls.filter(([msg]: [string]) =>
      msg.includes('unexpected message origin'),
    )
    expect(originWarnings).toHaveLength(1)
    expect(originWarnings[0][0]).toContain('https://evil.example.com')
  })

  it('does not warn when the origin matches vscode-webview://', () => {
    const target = freshTarget()
    installMessageRouter(target)
    target.dispatchEvent(
      new MessageEvent('message', {
        data: { command: 'reload-css', id: 'foo', css: '.x{}' },
        origin: 'vscode-webview://some-per-launch-random-token',
      }),
    )
    expect(h.swapStyle).toHaveBeenCalledWith('foo', '.x{}')
    expect(
      h.logToHost.mock.calls.some(([msg]: [string]) =>
        msg.includes('unexpected message origin'),
      ),
    ).toBe(false)
  })

  it('never blocks dispatch, even for an unexpected origin — warn-only means warn-only', () => {
    const target = freshTarget()
    installMessageRouter(target)
    target.dispatchEvent(
      new MessageEvent('message', {
        // A browser-hosted VS Code (Codespaces) origin shape — plausible per package.json's
        // declared `virtualWorkspaces: "limited"` support, not something this repo can launch to
        // confirm the exact string, which is exactly why this must never become a drop.
        data: { command: 'reload-css', id: 'bar', css: '.y{}' },
        origin: 'https://abc123.vscode-cdn.net',
      }),
    )
    expect(h.swapStyle).toHaveBeenCalledWith('bar', '.y{}')
  })
})

describe('handleUpdate — init', () => {
  it('a fresh init clears stale diff markers and calls initVditor', () => {
    handleUpdate({
      command: 'update',
      type: 'init',
      content: 'doc',
    } as any)
    expect(h.clearDiffMarkers).toHaveBeenCalledTimes(1)
    expect(h.applyBodyOptions).toHaveBeenCalled()
    expect(h.initVditor).toHaveBeenCalledTimes(1)
    expect(h.initVditor).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'init', content: 'doc' }),
    )
  })

  it('task 38: an init echo matching the inline-inited content is skipped once, then re-armed', () => {
    markInlineInited('same-content')
    handleUpdate({
      command: 'update',
      type: 'init',
      content: 'same-content',
    } as any)
    expect(h.initVditor).not.toHaveBeenCalled()

    // The guard is one-shot: a SECOND init with the same content is a real re-init, not an echo.
    handleUpdate({
      command: 'update',
      type: 'init',
      content: 'same-content',
    } as any)
    expect(h.initVditor).toHaveBeenCalledTimes(1)
  })

  it('a failed init is reported and retried with content only, then re-saves options', () => {
    h.initVditor.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    handleUpdate({
      command: 'update',
      type: 'init',
      content: 'doc',
      options: { codeTheme: 'x' },
    } as any)
    expect(h.reportError).toHaveBeenCalledTimes(1)
    expect(h.initVditor).toHaveBeenCalledTimes(2)
    expect(h.initVditor).toHaveBeenLastCalledWith({ content: 'doc' })
    expect(h.saveVditorOptions).toHaveBeenCalledTimes(1)
  })
})

describe('handleUpdate — external update (non-init)', () => {
  it('while streaming, a differing update is ignored (no diff/setValue against a partial doc)', () => {
    sessionState.streaming = true
    ;(window as any).vditor = { getValue: () => 'OLD' }
    handleUpdate({ command: 'update', content: 'NEW' } as any)
    expect(h.preserveCaretAndScroll).not.toHaveBeenCalled()
  })

  it('an external update rewrites the doc under applyingExtensionUpdate + invalidates the cache', () => {
    vi.useFakeTimers()
    const setValue = vi.fn()
    const invalidate = vi.fn()
    const reportDocMode = vi.fn()
    sessionState.editSync = { invalidate, reportDocMode } as any
    ;(window as any).vditor = { getValue: () => 'OLD', setValue }
    handleUpdate({ command: 'update', content: 'NEW' } as any)

    expect(sessionState.applyingExtensionUpdate).toBe(true)
    expect(h.preserveCaretAndScroll).toHaveBeenCalledTimes(1)
    expect(setValue).toHaveBeenCalledWith('NEW')
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(reportDocMode).toHaveBeenCalledTimes(1)

    vi.runAllTimers()
    expect(sessionState.applyingExtensionUpdate).toBe(false)
  })

  it('a no-op update (content already matches) touches nothing', () => {
    ;(window as any).vditor = { getValue: () => 'SAME' }
    handleUpdate({ command: 'update', content: 'SAME' } as any)
    expect(h.preserveCaretAndScroll).not.toHaveBeenCalled()
  })
})

describe('handleGetCursorOffset', () => {
  it('always replies, even with no live editor (line -1, so the host round-trip never hangs)', () => {
    const { post } = boot()
    installMessageRouter(window)
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { command: 'get-cursor-offset', requestId: 'r1' },
      }),
    )
    expect(post).toHaveBeenCalledWith({
      command: 'cursor-offset',
      requestId: 'r1',
      line: -1,
      lineText: '',
    })
  })
})

// Task 408 — handleConfigChanged currently hand-computes 8 `xxxChanged` booleans by comparing
// sessionState.lastInitMsg.options against msg.options field-by-field, then calls rethemeDiagrams
// with them OR'd against contentThemeChanged. This PINS that exact dispatch behavior BEFORE the
// rewrite (replacing the hand-written comparisons with diagramConfigDelta + rethemeFlagsFor) so
// the refactor is provably behavior-preserving — every case here must still pass unchanged after.
describe('handleConfigChanged — rethemeDiagrams dispatch (task 408 pin)', () => {
  function initWith(options: Record<string, unknown>) {
    sessionState.lastInitMsg = {
      content: '',
      theme: 'light',
      options,
    } as unknown as InitPayload
    ;(window as any).vditor = {}
  }
  function dispatchConfigChanged(options: Record<string, unknown>) {
    installMessageRouter(window)
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { command: 'config-changed', options },
      }),
    )
  }

  it('a lone d2Layout change flips ONLY d2', () => {
    initWith({ contentTheme: 'auto', d2Layout: 'dagre' })
    dispatchConfigChanged({ contentTheme: 'auto', d2Layout: 'elk' })
    expect(h.rethemeDiagrams).toHaveBeenCalledWith(
      expect.objectContaining({
        code: false,
        mermaid: false,
        echarts: false,
        smiles: false,
        flowchart: false,
        vega: false,
        monoGroup: false,
        geo: false,
        d2: true,
      }),
    )
  })

  it('a lone mermaidLayout change flips ONLY mermaid', () => {
    initWith({ contentTheme: 'auto', mermaidLayout: 'dagre' })
    dispatchConfigChanged({ contentTheme: 'auto', mermaidLayout: 'elk' })
    expect(h.rethemeDiagrams).toHaveBeenCalledWith(
      expect.objectContaining({
        code: false,
        mermaid: true,
        echarts: false,
        smiles: false,
        flowchart: false,
        vega: false,
        monoGroup: false,
        geo: false,
        d2: false,
      }),
    )
  })

  it('a lone geoBasemap change flips ONLY geo', () => {
    initWith({ contentTheme: 'auto', geoBasemap: 'auto' })
    dispatchConfigChanged({ contentTheme: 'auto', geoBasemap: 'none' })
    expect(h.rethemeDiagrams).toHaveBeenCalledWith(
      expect.objectContaining({
        code: false,
        mermaid: false,
        echarts: false,
        smiles: false,
        flowchart: false,
        vega: false,
        monoGroup: false,
        geo: true,
        d2: false,
      }),
    )
  })

  it('a contentTheme change flips EVERY diagram flag (global) but not code alone', () => {
    initWith({ contentTheme: 'auto' })
    dispatchConfigChanged({ contentTheme: 'github-dark' })
    expect(h.rethemeDiagrams).toHaveBeenCalledWith(
      expect.objectContaining({
        code: true,
        mermaid: true,
        echarts: true,
        smiles: true,
        flowchart: true,
        vega: true,
        monoGroup: true,
        geo: true,
        d2: true,
      }),
    )
  })

  it('a lone codeTheme change flips ONLY code, no diagram flag', () => {
    initWith({ contentTheme: 'auto', codeTheme: 'github' })
    dispatchConfigChanged({ contentTheme: 'auto', codeTheme: 'monokai' })
    expect(h.rethemeDiagrams).toHaveBeenCalledWith(
      expect.objectContaining({
        code: true,
        mermaid: false,
        echarts: false,
        smiles: false,
        flowchart: false,
        vega: false,
        monoGroup: false,
        geo: false,
        d2: false,
      }),
    )
  })

  it('no change at all flips nothing', () => {
    initWith({ contentTheme: 'auto', d2Layout: 'dagre' })
    dispatchConfigChanged({ contentTheme: 'auto', d2Layout: 'dagre' })
    expect(h.rethemeDiagrams).toHaveBeenCalledWith(
      expect.objectContaining({
        code: false,
        mermaid: false,
        echarts: false,
        smiles: false,
        flowchart: false,
        vega: false,
        monoGroup: false,
        geo: false,
        d2: false,
      }),
    )
  })

  it("forwards the merged options to setRenderCacheConfig (feeds hashOf's per-engine fragment)", () => {
    initWith({ contentTheme: 'auto', d2Layout: 'dagre' })
    dispatchConfigChanged({ contentTheme: 'auto', d2Layout: 'elk' })
    expect(h.setRenderCacheConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          contentTheme: 'auto',
          d2Layout: 'elk',
        }),
      }),
    )
  })
})

describe('handleDiffInfo', () => {
  it('stashes the changes and renders gutter markers when an editor is live', () => {
    ;(window as any).vditor = {}
    installMessageRouter(window)
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { command: 'diff-info', changes: [{ line: 3 }] },
      }),
    )
    expect(h.renderDiffMarkers).toHaveBeenCalledWith((window as any).vditor, [
      { line: 3 },
    ])
  })
})

// Task 436 (prerequisite finding) — a VS Code colour-theme flip arrives as `set-theme` and NOTHING
// ELSE: the host's onDidChangeActiveColorTheme posts only that command (editor-session.ts). But the
// render cache's `themeKey` is `mode|contentTheme|fontSize` (renderCacheThemeKey), so a flip that
// moves the MODE has to reach setRenderCacheConfig or the key goes stale — every render PUT after
// the flip is filed under the pre-flip mode, and a later lookup in that mode serves the wrong
// colours. config-changed already does this; set-theme did not, which is why 436's cache-first
// lookup could not be built on top of it.
describe('handleSetTheme — the cache key follows a workbench flip (task 436)', () => {
  beforeEach(() => {
    sessionState.lastInitMsg = {
      content: '',
      theme: 'light',
      options: { contentTheme: 'auto' },
    } as unknown as InitPayload
    ;(window as any).vditor = {}
  })

  it('updates the render-cache themeKey + mode BEFORE re-theming', () => {
    // A FRESH target, not the shared jsdom `window`: installMessageRouter adds a listener per call
    // and nothing removes them, so on `window` every earlier test's listener would also fire and
    // inflate the ordering log. Same reasoning as the origin-check block above.
    const target = new EventTarget() as unknown as Window
    installMessageRouter(target)
    const order: string[] = []
    h.setRenderCacheConfig.mockImplementation(() => {
      order.push('cache')
    })
    h.rethemeDiagrams.mockImplementation(() => {
      order.push('retheme')
    })
    target.dispatchEvent(
      new MessageEvent('message', {
        data: { command: 'set-theme', theme: 'dark' },
      }),
    )
    expect(h.setRenderCacheConfig).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'dark' }),
    )
    // The key itself is renderCacheThemeKey's job (mocked here); what this pins is that the flip's
    // new mode is what gets handed to it.
    expect(h.renderCacheThemeKey).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'dark' }),
    )
    // Ordering is the whole point: a re-theme that hashes under the OLD key would "hit" on the
    // pre-flip render and paint the colours the flip was supposed to change.
    expect(order).toEqual(['cache', 'retheme'])
  })
})
