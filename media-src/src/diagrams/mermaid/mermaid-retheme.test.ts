// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// reRenderMermaid's own render step; mocked so these cases assert what it HANDS the offscreen-render
// primitive (which jobs, in what batches, with which cdn/theme), not native-offscreen's own DOM
// swap — that module has its own tests.
const { renderNativeJobs } = vi.hoisted(() => ({ renderNativeJobs: vi.fn() }))
vi.mock('../../diagram-kit/native-offscreen', () => ({ renderNativeJobs }))

import { disposeMermaidDeferObserver, reRenderMermaid } from './mermaid-retheme'

// The module-private DOM marker mermaid-retheme.ts mirrors the shared gate's defer state onto (see
// its own DEFER_ATTR comment: deliberately NOT promoted into the generic viewport-gate.ts, kept here
// as this module's own observability layer for mermaid-flip-gate.spec.ts). Not exported — asserted
// against the literal string, matching how the real e2e spec reads it.
const MERMAID_DEFER_ATTR = 'data-vmarkd-mermaid-defer'

// jsdom has no IntersectionObserver, and the real one can't be driven deterministically from a test
// — a minimal controllable fake that lets a test simulate an element scrolling into view.
class ControlledIntersectionObserver {
  static instances: ControlledIntersectionObserver[] = []
  readonly observed = new Set<Element>()
  readonly observe = vi.fn((target: Element) => this.observed.add(target))
  readonly unobserve = vi.fn((target: Element) => this.observed.delete(target))
  readonly disconnect = vi.fn(() => this.observed.clear())
  constructor(
    readonly callback: (entries: IntersectionObserverEntry[]) => void,
  ) {
    ControlledIntersectionObserver.instances.push(this)
  }
  intersect(target: Element): void {
    if (!this.observed.has(target)) return
    this.callback([
      { isIntersecting: true, target } as IntersectionObserverEntry,
    ])
  }
}
function latestObserver(): ControlledIntersectionObserver {
  return ControlledIntersectionObserver.instances.at(-1)!
}

function setRect(el: HTMLElement, top: number): void {
  el.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + 100,
      width: 100,
      height: 100,
      left: 0,
      right: 100,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect
}

// Mounts `<block class="vditor-ir__node"><pane class="vditor-ir__preview"><live class=
// "language-mermaid" data-code=...></pane></block>` — the same nesting Lute produces for an
// already-rendered diagram (diagram-retheme.test.ts's mountLang does the same for the mono group).
// `paneClass`/`blockClass` let a test build the `.vditor-preview` (full/split Preview) shape instead
// — `blockClass: null` mounts with no IR/WYSIWYG block wrapper, matching that surface's real markup.
function mountMermaid(
  container: HTMLElement,
  top: number,
  code: string,
  paneClass = 'vditor-ir__preview',
  blockClass: string | null = 'vditor-ir__node',
): { block: HTMLElement; live: HTMLElement } {
  const pane = document.createElement('div')
  pane.className = paneClass
  const live = document.createElement('div')
  live.className = 'language-mermaid'
  live.dataset.processed = 'true'
  live.dataset.code = code
  setRect(live, top)
  pane.append(live)
  if (blockClass === null) {
    container.append(pane)
    return { block: pane, live }
  }
  const block = document.createElement('div')
  block.className = blockClass
  block.append(pane)
  container.append(block)
  return { block, live }
}

beforeEach(() => {
  ControlledIntersectionObserver.instances = []
  vi.stubGlobal('IntersectionObserver', ControlledIntersectionObserver)
  // isVisibleish reads window.innerHeight; jsdom's default (0) would treat everything as offscreen.
  vi.stubGlobal('innerHeight', 600)
  document.body.replaceChildren()
  renderNativeJobs.mockClear()
})

afterEach(() => {
  disposeMermaidDeferObserver() // reset the shared gate between tests — its observer is a module singleton
  vi.unstubAllGlobals()
})

describe('reRenderMermaid', () => {
  it('batches every visible diagram into ONE renderNativeJobs call and defers the offscreen one', () => {
    const editor = document.createElement('div')
    const a = mountMermaid(editor, 0, 'graph TD; A-->B')
    const b = mountMermaid(editor, 50, 'graph TD; C-->D')
    const offscreen = mountMermaid(editor, 5000, 'graph TD; E-->F')
    document.body.append(editor)

    reRenderMermaid(editor, 'cdn-a', 'dark')

    expect(renderNativeJobs).toHaveBeenCalledTimes(1)
    expect(renderNativeJobs).toHaveBeenCalledWith(
      'mermaid',
      [
        { live: a.live, source: 'graph TD; A-->B' },
        { live: b.live, source: 'graph TD; C-->D' },
      ],
      'cdn-a',
      'dark',
    )
    expect(a.live.hasAttribute(MERMAID_DEFER_ATTR)).toBe(false)
    expect(b.live.hasAttribute(MERMAID_DEFER_ATTR)).toBe(false)
    expect(offscreen.live.getAttribute(MERMAID_DEFER_ATTR)).toBe('1')
  })

  it('renders the deferred diagram on its own, using the LATEST theme/cdn/source rather than the ones captured when it was deferred', () => {
    const editor = document.createElement('div')
    const offscreen = mountMermaid(editor, 5000, 'old source')
    document.body.append(editor)

    reRenderMermaid(editor, 'cdn-a', 'dark') // defers — still offscreen, nothing rendered yet
    expect(renderNativeJobs).not.toHaveBeenCalled()

    // A second flip before scroll-in: source changed (a live edit) AND theme/cdn changed. The gate
    // does not re-queue an already-deferred element, so this must reach the deferred node via the
    // module's OWN live state (latestTheme/latestCdn/sourceForLive), not the gate's callback.
    offscreen.live.dataset.code = 'latest source'
    reRenderMermaid(editor, 'cdn-b', 'light')
    expect(renderNativeJobs).not.toHaveBeenCalled() // still offscreen — no render yet

    latestObserver().intersect(offscreen.live)

    expect(renderNativeJobs).toHaveBeenCalledTimes(1)
    expect(renderNativeJobs).toHaveBeenCalledWith(
      'mermaid',
      [{ live: offscreen.live, source: 'latest source' }],
      'cdn-b',
      'light',
    )
    expect(offscreen.live.hasAttribute(MERMAID_DEFER_ATTR)).toBe(false)
  })

  it('reaches a mermaid diagram living in the full/split Preview surface (.vditor-preview, no IR/WYSIWYG block ancestor)', () => {
    const editor = document.createElement('div')
    const { live } = mountMermaid(
      editor,
      0,
      'graph TD; A-->B',
      'vditor-preview',
      null,
    )
    document.body.append(editor)

    reRenderMermaid(editor, 'cdn', 'dark')

    expect(renderNativeJobs).toHaveBeenCalledWith(
      'mermaid',
      [{ live, source: 'graph TD; A-->B' }],
      'cdn',
      'dark',
    )
  })

  it('does nothing when there is no editor element (initial boot / no active mode yet)', () => {
    expect(() => reRenderMermaid(undefined, 'cdn', 'dark')).not.toThrow()
    expect(renderNativeJobs).not.toHaveBeenCalled()
  })
})
