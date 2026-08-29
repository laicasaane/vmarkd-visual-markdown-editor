// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Vditor from 'vditor'
import {
  installOutlineViewportSync,
  OUTLINE_VIEWPORT_CLASS,
} from './outline-viewport-sync'
import { HOIST_HIDDEN_ATTR } from './section-hoist'
import { HOIST_SCOPE_CHANGE_EVENT } from './section-hoist'

class ControlledIntersectionObserver {
  static instances: ControlledIntersectionObserver[] = []
  readonly observed = new Set<Element>()
  readonly disconnect = vi.fn(() => this.observed.clear())

  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    ControlledIntersectionObserver.instances.push(this)
  }

  observe(target: Element): void {
    this.observed.add(target)
  }

  unobserve(target: Element): void {
    this.observed.delete(target)
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  emit(target: Element, { intersecting = true, height = 20 } = {}): void {
    this.callback(
      [
        {
          target,
          isIntersecting: intersecting,
          intersectionRect: { height },
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    )
  }
}

class ControlledResizeObserver {
  static instances: ControlledResizeObserver[] = []
  readonly observed = new Set<Element>()
  readonly disconnect = vi.fn(() => this.observed.clear())

  constructor(readonly callback: ResizeObserverCallback) {
    ControlledResizeObserver.instances.push(this)
  }

  observe(target: Element): void {
    this.observed.add(target)
  }

  unobserve(target: Element): void {
    this.observed.delete(target)
  }

  emit(): void {
    this.callback([], this as unknown as ResizeObserver)
  }
}

interface Fixture {
  editor: Vditor
  inner: Record<string, any>
  outline: HTMLElement
  content: HTMLElement
  ir: HTMLElement
  wysiwyg: HTMLElement
  preview: HTMLElement
  headings: Record<string, HTMLElement>
}

let frameId = 0
let frames = new Map<number, FrameRequestCallback>()

function outlineMarkup(ids = ['first', 'second', 'third']): string {
  return `<ul>${ids
    .map((id) => `<li><span data-target-id="${id}">${id}</span></li>`)
    .join('')}</ul>`
}

function makeSurface(className: string, ids: string[]): HTMLElement {
  const surface = document.createElement('div')
  surface.className = className
  for (const [index, id] of ids.entries()) {
    const heading = document.createElement(`h${Math.min(index + 1, 6)}`)
    heading.id = id
    heading.textContent = id
    surface.append(heading)
  }
  return surface
}

function setupFixture(): Fixture {
  const app = document.createElement('div')
  const ir = makeSurface('vditor-ir', ['first', 'second', 'third'])
  const wysiwyg = makeSurface('vditor-wysiwyg', ['first', 'second', 'third'])
  const sv = document.createElement('div')
  sv.className = 'vditor-sv'
  const previewElement = makeSurface('vditor-reset', [
    'first',
    'second',
    'third',
  ])
  const preview = document.createElement('div')
  preview.className = 'vditor-preview'
  preview.style.display = 'none'
  preview.append(previewElement)

  const outline = document.createElement('div')
  outline.className = 'vditor-outline'
  outline.style.display = 'block'
  const title = document.createElement('div')
  title.className = 'vditor-outline__title'
  const content = document.createElement('div')
  content.className = 'vditor-outline__content'
  content.innerHTML = outlineMarkup()
  outline.append(title, content)
  app.append(ir, wysiwyg, sv, preview, outline)
  document.body.append(app)

  const inner = {
    currentMode: 'ir',
    ir: { element: ir },
    wysiwyg: { element: wysiwyg },
    sv: { element: sv },
    preview: { element: preview, previewElement },
    outline: { element: outline },
  }
  return {
    editor: { vditor: inner } as unknown as Vditor,
    inner,
    outline,
    content,
    ir,
    wysiwyg,
    preview,
    headings: Object.fromEntries(
      Array.from(ir.querySelectorAll<HTMLElement>('h1,h2,h3')).map((el) => [
        el.id,
        el,
      ]),
    ),
  }
}

function observer(index = -1): ControlledIntersectionObserver {
  return ControlledIntersectionObserver.instances.at(index)!
}

function highlightedIds(outline: HTMLElement): string[] {
  return Array.from(
    outline.querySelectorAll<HTMLElement>(`.${OUTLINE_VIEWPORT_CLASS}`),
  ).map((item) => item.dataset.targetId!)
}

function installGeometry(
  fixture: Fixture,
  headingTops = [10, 300, 500],
  viewport = { top: 0, bottom: 100 },
  scrollHeight = 650,
): void {
  vi.spyOn(fixture.ir, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        top: viewport.top,
        bottom: viewport.bottom,
      }) as DOMRect,
  )
  Object.defineProperty(fixture.ir, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  })
  Object.values(fixture.headings).forEach((heading, index) => {
    vi.spyOn(heading, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          top: headingTops[index] - fixture.ir.scrollTop,
          bottom: headingTops[index] + 24 - fixture.ir.scrollTop,
        }) as DOMRect,
    )
  })
}

async function flushFramesAndMutations(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  while (frames.size > 0) {
    const pending = Array.from(frames.values())
    frames = new Map()
    for (const callback of pending) callback(performance.now())
    await Promise.resolve()
  }
}

beforeEach(() => {
  document.body.replaceChildren()
  ControlledIntersectionObserver.instances = []
  ControlledResizeObserver.instances = []
  frameId = 0
  frames = new Map()
  vi.stubGlobal('IntersectionObserver', ControlledIntersectionObserver)
  vi.stubGlobal('ResizeObserver', ControlledResizeObserver)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++frameId
    frames.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
})

describe('installOutlineViewportSync', () => {
  it('returns a callable no-op disposer when no outline DOM exists', () => {
    const dispose = installOutlineViewportSync({
      vditor: { currentMode: 'ir' },
    } as unknown as Vditor)

    expect(() => dispose()).not.toThrow()
    expect(ControlledIntersectionObserver.instances).toHaveLength(0)
  })

  it('observes active IR headings against the editor scroller with the approved inset', () => {
    const fixture = setupFixture()
    installGeometry(fixture)

    installOutlineViewportSync(fixture.editor)

    expect(ControlledIntersectionObserver.instances).toHaveLength(1)
    expect(observer().options).toEqual({
      root: fixture.ir,
      rootMargin: '-4px 0px -4px 0px',
      threshold: 0,
    })
    expect(Array.from(observer().observed)).toEqual(
      Object.values(fixture.headings),
    )
  })

  it('does not observe headings hidden outside the hoisted section', () => {
    const fixture = setupFixture()
    fixture.headings.first.setAttribute(HOIST_HIDDEN_ATTR, '')

    installOutlineViewportSync(fixture.editor)

    expect(Array.from(observer().observed)).toEqual([
      fixture.headings.second,
      fixture.headings.third,
    ])
  })

  it('rebinds heading observation when the hoist scope changes at runtime', async () => {
    const fixture = setupFixture()
    installOutlineViewportSync(fixture.editor)
    const beforeHoist = observer()

    fixture.headings.first.setAttribute(HOIST_HIDDEN_ATTR, '')
    document.dispatchEvent(new Event(HOIST_SCOPE_CHANGE_EVENT))
    await flushFramesAndMutations()

    expect(beforeHoist.disconnect).toHaveBeenCalledOnce()
    expect(Array.from(observer().observed)).toEqual([
      fixture.headings.second,
      fixture.headings.third,
    ])
  })

  it('keeps a heading active while its long section, but not its box, intersects', async () => {
    const fixture = setupFixture()
    installGeometry(fixture)
    installOutlineViewportSync(fixture.editor)
    await flushFramesAndMutations()
    expect(highlightedIds(fixture.outline)).toEqual(['first'])

    fixture.ir.scrollTop = 120
    fixture.ir.dispatchEvent(new Event('scroll'))
    await flushFramesAndMutations()
    expect(fixture.headings.first.getBoundingClientRect().bottom).toBeLessThan(
      4,
    )
    expect(highlightedIds(fixture.outline)).toEqual(['first'])

    fixture.ir.scrollTop = 310
    fixture.ir.dispatchEvent(new Event('scroll'))
    await flushFramesAndMutations()
    expect(highlightedIds(fixture.outline)).toEqual(['second'])
  })

  it('highlights both flat rendered sections while the viewport spans their boundary', async () => {
    const fixture = setupFixture()
    installGeometry(fixture)
    installOutlineViewportSync(fixture.editor)

    fixture.ir.scrollTop = 210
    fixture.ir.dispatchEvent(new Event('scroll'))
    await flushFramesAndMutations()
    expect(highlightedIds(fixture.outline)).toEqual(['first', 'second'])

    fixture.ir.scrollTop = 300
    fixture.ir.dispatchEvent(new Event('scroll'))
    await flushFramesAndMutations()
    expect(highlightedIds(fixture.outline)).toEqual(['second'])
  })

  it('extends the final section to the surface end and leaves preamble ownerless', async () => {
    const fixture = setupFixture()
    installGeometry(fixture, [150, 300, 500], { top: 0, bottom: 100 }, 800)
    installOutlineViewportSync(fixture.editor)
    await flushFramesAndMutations()
    expect(highlightedIds(fixture.outline)).toEqual([])

    fixture.ir.scrollTop = 650
    fixture.ir.dispatchEvent(new Event('scroll'))
    await flushFramesAndMutations()
    expect(highlightedIds(fixture.outline)).toEqual(['third'])
  })

  it('uses strict nonzero intersection at the 4px inset boundaries', async () => {
    const fixture = setupFixture()
    installGeometry(fixture, [96, 200, 300])
    installOutlineViewportSync(fixture.editor)
    await flushFramesAndMutations()
    expect(highlightedIds(fixture.outline)).toEqual([])

    installGeometry(fixture, [95, 200, 300])
    fixture.ir.dispatchEvent(new Event('scroll'))
    await flushFramesAndMutations()
    expect(highlightedIds(fixture.outline)).toEqual(['first'])
  })

  it('coalesces scroll, resize, and observer invalidations into one projection frame', async () => {
    const fixture = setupFixture()
    installGeometry(fixture)
    installOutlineViewportSync(fixture.editor)
    await flushFramesAndMutations()
    vi.mocked(fixture.ir.getBoundingClientRect).mockClear()

    fixture.ir.dispatchEvent(new Event('scroll'))
    fixture.ir.dispatchEvent(new Event('scroll'))
    observer().emit(fixture.headings.first)
    ControlledResizeObserver.instances.at(-1)?.emit()
    expect(frames.size).toBe(1)
    await flushFramesAndMutations()
    expect(fixture.ir.getBoundingClientRect).toHaveBeenCalled()
  })

  it('ignores callbacks from stale generations and detached headings', async () => {
    const fixture = setupFixture()
    installOutlineViewportSync(fixture.editor)
    const stale = observer()

    fixture.content.innerHTML = outlineMarkup()
    await flushFramesAndMutations()
    expect(ControlledIntersectionObserver.instances).toHaveLength(2)

    stale.emit(fixture.headings.first)
    expect(highlightedIds(fixture.outline)).toEqual([])

    fixture.headings.second.remove()
    observer().emit(fixture.headings.second)
    expect(highlightedIds(fixture.outline)).toEqual([])
  })

  it('remaps retained visible IDs onto replacement outline rows', async () => {
    const fixture = setupFixture()
    installGeometry(fixture)
    installOutlineViewportSync(fixture.editor)
    await flushFramesAndMutations()
    const oldRow = fixture.outline.querySelector('[data-target-id="first"]')

    fixture.content.innerHTML = outlineMarkup()
    await flushFramesAndMutations()

    const replacement = fixture.outline.querySelector(
      '[data-target-id="first"]',
    )
    expect(replacement).not.toBe(oldRow)
    expect(replacement?.classList.contains(OUTLINE_VIEWPORT_CLASS)).toBe(true)
  })

  it('does not rebuild heading observation for a branch collapse style change', async () => {
    const fixture = setupFixture()
    installOutlineViewportSync(fixture.editor)
    await flushFramesAndMutations()
    const childGroup = document.createElement('ul')
    fixture.content.querySelector('li')?.append(childGroup)
    await flushFramesAndMutations()
    const afterContentChange = ControlledIntersectionObserver.instances.length

    childGroup.style.display = 'none'
    await flushFramesAndMutations()

    expect(ControlledIntersectionObserver.instances).toHaveLength(
      afterContentChange,
    )
  })

  it('rebinds from editing modes to the rendered Preview surface and its parent scroller', async () => {
    const fixture = setupFixture()
    installOutlineViewportSync(fixture.editor)
    const irObserver = observer()

    fixture.inner.currentMode = 'wysiwyg'
    fixture.content.innerHTML = outlineMarkup()
    await flushFramesAndMutations()
    expect(irObserver.disconnect).toHaveBeenCalledOnce()
    expect(observer().options?.root).toBe(fixture.wysiwyg)

    fixture.preview.style.display = 'block'
    fixture.content.innerHTML = outlineMarkup()
    await flushFramesAndMutations()
    expect(observer().options?.root).toBe(fixture.preview)
    expect(Array.from(observer().observed)).toEqual(
      Array.from(fixture.preview.querySelectorAll('h1,h2,h3')),
    )
  })

  it('clears and disconnects while hidden, then reconstructs observation when reopened', async () => {
    const fixture = setupFixture()
    installGeometry(fixture)
    installOutlineViewportSync(fixture.editor)
    await flushFramesAndMutations()
    expect(highlightedIds(fixture.outline)).toEqual(['first'])
    const visibleObserver = observer()

    fixture.outline.style.display = 'none'
    await flushFramesAndMutations()
    expect(visibleObserver.disconnect).toHaveBeenCalledOnce()
    expect(highlightedIds(fixture.outline)).toEqual([])

    fixture.outline.style.display = 'block'
    await flushFramesAndMutations()
    expect(observer()).not.toBe(visibleObserver)
    expect(observer().observed.size).toBe(3)
    expect(highlightedIds(fixture.outline)).toEqual(['first'])
  })

  it('disposes observers and pending coalesced work and removes only viewport state', async () => {
    const fixture = setupFixture()
    const dispose = installOutlineViewportSync(fixture.editor)
    const activeObserver = observer()
    const activeResizeObserver = ControlledResizeObserver.instances.at(-1)!
    observer().emit(fixture.headings.first)

    fixture.content.innerHTML = outlineMarkup()
    await Promise.resolve()
    dispose()
    await flushFramesAndMutations()

    expect(activeObserver.disconnect).toHaveBeenCalledOnce()
    expect(activeResizeObserver.disconnect).toHaveBeenCalledOnce()
    expect(highlightedIds(fixture.outline)).toEqual([])
    expect(ControlledIntersectionObserver.instances).toHaveLength(1)
    fixture.ir.dispatchEvent(new Event('scroll'))
    expect(frames.size).toBe(0)
    for (const item of fixture.outline.querySelectorAll('[data-target-id]')) {
      expect(item.hasAttribute('aria-current')).toBe(false)
      expect(item.hasAttribute('aria-selected')).toBe(false)
    }
  })
})
