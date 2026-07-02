// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { WebviewMessage } from '../../src/protocol'

// Stub native-offscreen so the native cache-miss path can be asserted without loading the real
// engines (which need addScript + a live DOM). renderNativeJobs is spied; a minimal
// nativeSourceForPane (the sibling-marker read) keeps reserve/report working. vi.hoisted so the
// spy exists before the hoisted vi.mock factory references it.
const { renderNativeJobs } = vi.hoisted(() => ({ renderNativeJobs: vi.fn() }))
vi.mock('./native-offscreen', () => ({
  renderNativeJobs,
  NATIVE_CACHE_LANGS: ['mermaid', 'abc', 'flowchart'],
  nativeSourceForPane: (pane: HTMLElement, lang: string) => {
    const block =
      pane.closest('.vditor-ir__node, [data-type="code-block"]') ||
      pane.parentElement
    const m =
      block &&
      Array.from(block.querySelectorAll<HTMLElement>(`.language-${lang}`)).find(
        (el) => !pane.contains(el),
      )
    return m?.textContent ?? null
  },
}))

import {
  hashOf,
  setRenderCacheConfig,
  installRenderCache,
  applyCacheHits,
} from './render-cache-client'

// Task 184 — webview cache client: hashOf determinism/sensitivity + the reserve→hit/miss paint
// path (the offscreen-swap into the LIVE constrained div, data-render="1" for byte-identity).

describe('hashOf — determinism + sensitivity', () => {
  beforeEach(() =>
    setRenderCacheConfig({ version: 'v1', themeKey: 'dark|github' }),
  )

  it('is deterministic for the same (lang, source, themeKey, version)', () => {
    expect(hashOf('d2', 'a -> b')).toBe(hashOf('d2', 'a -> b'))
  })
  it('changes when the SOURCE changes', () => {
    expect(hashOf('d2', 'a -> b')).not.toBe(hashOf('d2', 'a -> c'))
  })
  it('changes when the LANG changes', () => {
    expect(hashOf('d2', 'x')).not.toBe(hashOf('nomnoml', 'x'))
  })
  it('changes when the THEME key changes', () => {
    const a = hashOf('d2', 'x')
    setRenderCacheConfig({ themeKey: 'light|github' })
    expect(hashOf('d2', 'x')).not.toBe(a)
  })
  it('changes when the engine VERSION changes', () => {
    setRenderCacheConfig({ themeKey: 'dark|github' })
    const a = hashOf('d2', 'x')
    setRenderCacheConfig({ version: 'v2' })
    expect(hashOf('d2', 'x')).not.toBe(a)
  })
})

// Build an IR preview pane holding one d2 source block (as Vditor emits it before render).
function mountD2(source: string): HTMLElement {
  const app = document.createElement('div')
  app.id = 'app'
  app.innerHTML = `<div class="vditor-ir__preview" data-render="2"><pre><code class="language-d2">${source}</code></pre></div>`
  document.body.replaceChildren(app)
  return app
}

describe('installRenderCache — reserve + paint from cache', () => {
  beforeEach(() => setRenderCacheConfig({ version: 'v1', themeKey: 't' }))

  it('reserves each cacheable block and requests its cached SVG on open', () => {
    const app = mountD2('a -> b')
    const posted: WebviewMessage[] = []
    installRenderCache(app, (m) => posted.push(m))
    const req = posted.find((m) => m.command === 'diagram-cache-get')
    expect(req).toBeTruthy()
    // The block was reserved (data-processed) so the engine won't render it before the reply.
    const wrapper = app.querySelector('div.language-d2') as HTMLElement
    expect(wrapper.getAttribute('data-processed')).toBe('true')
    if (req && req.command === 'diagram-cache-get') {
      expect(req.hashes).toContain(hashOf('d2', 'a -> b'))
    }
  })

  it('paints a HIT into the live div with data-render="1" (byte-identical) + a cache marker', () => {
    const app = mountD2('a -> b')
    const posted: WebviewMessage[] = []
    installRenderCache(app, (m) => posted.push(m))
    const req = posted.find((m) => m.command === 'diagram-cache-get')!
    const hash = hashOf('d2', 'a -> b')
    applyCacheHits(req.requestId, { [hash]: '<svg data-t="cached"></svg>' })
    const wrapper = app.querySelector('div.language-d2') as HTMLElement
    expect(wrapper.querySelector('svg')?.getAttribute('data-t')).toBe('cached')
    expect(wrapper.getAttribute('data-render')).toBe('1') // Lute-invisible → serialize byte-identical
    expect(wrapper.getAttribute('data-vmarkd-cache-hit')).toBe('1')
    expect(wrapper.getAttribute('data-processed')).toBe('true') // engine stays skipped
  })

  it('unblocks the engine on a MISS (drops data-processed, retriggers a render pass)', () => {
    const app = mountD2('a -> b')
    const posted: WebviewMessage[] = []
    installRenderCache(app, (m) => posted.push(m))
    const req = posted.find((m) => m.command === 'diagram-cache-get')!
    applyCacheHits(req.requestId, {}) // empty = miss
    const wrapper = app.querySelector('div.language-d2') as HTMLElement
    expect(wrapper.getAttribute('data-processed')).toBeNull() // engine may render live now
    expect(wrapper.getAttribute('data-vmarkd-cache-hit')).toBeNull()
  })
})

// Task 184 Phase 3 — Vditor-NATIVE engines (mermaid/graphviz/abc/flowchart): the render target is
// the preview-pane `.language-<lang>` (Vditor renders it, no code→div swap), and the hash SOURCE is
// the editable marker (survives the render). Reserve blocks Vditor's deferred render; a MISS
// re-renders OFFSCREEN via renderNativeJobs(lang, …) (Vditor won't re-fire) rather than the
// custom-block comment-append.
function mountNative(lang: string, source: string): HTMLElement {
  const app = document.createElement('div')
  app.id = 'app'
  // Dual-node: editable marker source + the preview render target (both .language-<lang>).
  app.innerHTML = `<div class="vditor-ir__node" data-type="code-block"><pre class="vditor-ir__marker--pre"><code class="language-${lang}">${source}</code></pre><pre class="vditor-ir__preview" data-render="2"><div class="language-${lang}">${source}</div></pre></div>`
  document.body.replaceChildren(app)
  return app
}
// The preview-pane render target for `lang` (NOT the editable marker code).
function nativeTarget(app: HTMLElement, lang: string): HTMLElement {
  return app.querySelector(
    `.vditor-ir__preview .language-${lang}`,
  ) as HTMLElement
}

describe('installRenderCache — native engine reserve + paint', () => {
  beforeEach(() => {
    renderNativeJobs.mockClear()
    setRenderCacheConfig({
      version: 'v1',
      themeKey: 't',
      cdn: '/cdn',
      mode: 'dark',
    })
  })

  it('reserves the mermaid preview target and requests it hashed from the MARKER source', () => {
    const app = mountNative('mermaid', 'graph TD;A-->B')
    const posted: WebviewMessage[] = []
    installRenderCache(app, (m) => posted.push(m))
    const req = posted.find((m) => m.command === 'diagram-cache-get')
    expect(req?.command === 'diagram-cache-get' && req.hashes).toContain(
      hashOf('mermaid', 'graph TD;A-->B'),
    )
    // The engine's deferred pass is blocked on the preview target.
    expect(nativeTarget(app, 'mermaid').getAttribute('data-processed')).toBe(
      'true',
    )
  })

  it('generalises to abc (reserve + HIT paint)', () => {
    const app = mountNative('abc', 'X:1\nK:C\nCDEF|')
    const posted: WebviewMessage[] = []
    installRenderCache(app, (m) => posted.push(m))
    const req = posted.find((m) => m.command === 'diagram-cache-get')!
    expect(req.command === 'diagram-cache-get' && req.hashes).toContain(
      hashOf('abc', 'X:1\nK:C\nCDEF|'),
    )
    applyCacheHits(req.requestId, {
      [hashOf('abc', 'X:1\nK:C\nCDEF|')]: '<svg id="a-cached"></svg>',
    })
    const target = nativeTarget(app, 'abc')
    expect(target.querySelector('svg')?.id).toBe('a-cached')
    expect(target.getAttribute('data-vmarkd-cache-hit')).toBe('1')
    expect(target.getAttribute('data-processed')).toBe('true')
  })

  it('paints a HIT into the preview target (data-render="1" + cache marker, stays processed)', () => {
    const app = mountNative('mermaid', 'graph TD;A-->B')
    const posted: WebviewMessage[] = []
    installRenderCache(app, (m) => posted.push(m))
    const req = posted.find((m) => m.command === 'diagram-cache-get')!
    applyCacheHits(req.requestId, {
      [hashOf('mermaid', 'graph TD;A-->B')]: '<svg id="m-cached"></svg>',
    })
    const target = nativeTarget(app, 'mermaid')
    expect(target.querySelector('svg')?.id).toBe('m-cached')
    expect(target.getAttribute('data-render')).toBe('1')
    expect(target.getAttribute('data-vmarkd-cache-hit')).toBe('1')
    expect(target.getAttribute('data-processed')).toBe('true') // engine stays skipped
    expect(renderNativeJobs).not.toHaveBeenCalled() // no re-render on a hit
  })

  it('re-renders OFFSCREEN on a MISS (keeps data-processed; Vditor cannot re-fire)', () => {
    const app = mountNative('mermaid', 'graph TD;A-->B')
    const posted: WebviewMessage[] = []
    installRenderCache(app, (m) => posted.push(m))
    const req = posted.find((m) => m.command === 'diagram-cache-get')!
    applyCacheHits(req.requestId, {}) // miss
    const target = nativeTarget(app, 'mermaid')
    // Unlike a custom block, data-processed stays set — the engine's one-shot already skipped it.
    expect(target.getAttribute('data-processed')).toBe('true')
    expect(target.getAttribute('data-vmarkd-cache-reserve')).toBeNull()
    // The offscreen re-render was invoked with (lang, [job], cdn, mode).
    expect(renderNativeJobs).toHaveBeenCalledTimes(1)
    const [lang, jobs, cdn, mode] = renderNativeJobs.mock.calls[0]
    expect(lang).toBe('mermaid')
    expect(jobs).toEqual([{ live: target, source: 'graph TD;A-->B' }])
    expect(cdn).toBe('/cdn')
    expect(mode).toBe('dark')
  })
})
