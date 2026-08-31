// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Vditor from 'vditor'
import {
  HOIST_HIDDEN_ATTR,
  HOIST_OUTLINE_HIDDEN_ATTR,
  installSectionHoist,
} from './section-hoist'
import {
  scrollToHeadingIndex,
  setupInlineTocNavigation,
  setupOutlineFlash,
} from './outline'

function fixture(savedState: Record<string, unknown> = {}) {
  document.body.innerHTML =
    '<div class="vditor">' +
    '<div class="vditor-toolbar"></div>' +
    '<div class="vditor-content">' +
    '<div class="vditor-ir"><pre class="vditor-reset"></pre></div>' +
    '<div class="vditor-wysiwyg"><pre class="vditor-reset"></pre></div>' +
    '</div>' +
    '<div class="vditor-outline"><div class="vditor-outline__content">' +
    '<ul><li><span data-target-id="chapter">Chapter</span><ul>' +
    '<li><span data-target-id="child">Child</span></li>' +
    '<li><span data-target-id="sibling">Sibling</span></li>' +
    '</ul></li><li><span data-target-id="next">Next</span></li></ul>' +
    '</div></div></div>'
  const markup =
    '<p data-block="0">preamble</p>' +
    '<h1 id="chapter" data-block="0">Chapter</h1>' +
    '<p data-block="0">intro</p>' +
    '<h2 id="child" data-block="0">Child</h2>' +
    '<p data-block="0">detail</p>' +
    '<h2 id="sibling" data-block="0">Sibling</h2>' +
    '<p data-block="0">later</p>' +
    '<h1 id="next" data-block="0">Next</h1>'
  const ir = document.querySelector<HTMLElement>('.vditor-ir > pre')!
  const wysiwyg = document.querySelector<HTMLElement>('.vditor-wysiwyg > pre')!
  ir.innerHTML = markup
  wysiwyg.innerHTML = markup
  ir.scrollTop = 217
  const state = {
    value: savedState,
    getState<T = unknown>(): T {
      return state.value as T
    },
    setState<T>(next: T): T {
      state.value = next as Record<string, unknown>
      return next
    },
  }
  const markdown = '# unchanged\n'
  const inner = {
    currentMode: 'ir',
    ir: { element: ir },
    wysiwyg: { element: wysiwyg },
    outline: {
      element: document.querySelector<HTMLElement>('.vditor-outline'),
    },
  }
  const editor = {
    vditor: inner,
    getValue: vi.fn(() => markdown),
  } as unknown as Vditor
  return { editor, inner, ir, wysiwyg, state, markdown }
}

function visibleBlockText(surface: HTMLElement): string[] {
  return Array.from(surface.children)
    .filter((block) => !block.hasAttribute(HOIST_HIDDEN_ATTR))
    .map((block) => block.textContent!)
}

describe('section hoisting', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
  })

  it('shows one hierarchical section while preserving the full editor DOM and value', () => {
    const f = fixture({ unrelated: 1 })
    f.ir.insertAdjacentHTML(
      'beforeend',
      '<p data-vmde-trailing>serializer-invisible trailing caret</p>',
    )
    const controller = installSectionHoist(f.editor, f.state)

    controller.hoistHeading(1)

    expect(visibleBlockText(f.ir)).toEqual(['Child', 'detail'])
    expect(f.ir.children).toHaveLength(9)
    expect(
      f.ir
        .querySelector('[data-vmde-trailing]')
        ?.hasAttribute(HOIST_HIDDEN_ATTR),
    ).toBe(true)
    expect(f.editor.getValue()).toBe(f.markdown)
    expect(
      Array.from(document.querySelectorAll<HTMLElement>('[data-target-id]'))
        .filter((item) => !item.hasAttribute(HOIST_OUTLINE_HIDDEN_ATTR))
        .map((item) => item.textContent),
    ).toEqual(['Child'])
    const childOutline = document.querySelector<HTMLElement>(
      '[data-target-id="child"]',
    )!
    expect(childOutline.tabIndex).toBe(0)
    expect(
      document
        .querySelector<HTMLElement>('[data-target-id="chapter"]')
        ?.getAttribute('aria-hidden'),
    ).toBe('true')
    expect(
      document.querySelector('.vmde-section-breadcrumb')?.textContent,
    ).toBe('Doc › Chapter › Child')
    expect(f.state.value).toEqual({
      unrelated: 1,
      vmdeSectionHoist: {
        headingIndex: 1,
        headingId: 'child',
        headingText: 'Child',
        headingLevel: 2,
        scrollTop: 217,
      },
    })
  })

  it('restores the pre-hoist scroll position when the user exits section view', () => {
    const f = fixture()
    const controller = installSectionHoist(f.editor, f.state)
    controller.hoistHeading(1)
    f.ir.scrollTop = 0

    controller.exit()

    expect(f.ir.querySelector(`[${HOIST_HIDDEN_ATTR}]`)).toBeNull()
    expect(document.querySelector('.vmde-section-breadcrumb')).toBeNull()
    expect(f.ir.scrollTop).toBe(217)
  })

  it('exits before the browser opens find so hidden matches are searchable', () => {
    const f = fixture()
    const controller = installSectionHoist(f.editor, f.state)
    controller.hoistHeading(1)

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }),
    )

    expect(f.ir.querySelector(`[${HOIST_HIDDEN_ATTR}]`)).toBeNull()
  })

  it('exits before programmatic and mouse outline reveals target hidden headings', () => {
    const f = fixture()
    const controller = installSectionHoist(f.editor, f.state)
    controller.hoistHeading(1)
    const next = f.ir.querySelector<HTMLElement>('#next')!
    const restores: FrameRequestCallback[] = []
    vi.mocked(window.requestAnimationFrame).mockImplementation((callback) => {
      restores.push(callback)
      return restores.length
    })
    next.scrollIntoView = vi.fn(() => {
      f.ir.scrollTop = 999
    })

    expect(scrollToHeadingIndex(f.editor, 3)).toBe(true)
    for (const restore of restores) restore(0)
    expect(f.ir.querySelector(`[${HOIST_HIDDEN_ATTR}]`)).toBeNull()
    expect(f.ir.scrollTop).toBe(999)

    controller.hoistHeading(1)
    setupOutlineFlash(f.editor)
    document
      .querySelector<HTMLElement>('[data-target-id="next"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(f.ir.querySelector(`[${HOIST_HIDDEN_ATTR}]`)).toBeNull()
  })

  it('restores focus on context-menu cancellation and focuses the exit after activation', () => {
    const f = fixture()
    installSectionHoist(f.editor, f.state)
    const child = document.querySelector<HTMLElement>(
      '[data-target-id="child"]',
    )!
    child.tabIndex = 0

    child.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
    expect(document.activeElement?.textContent).toBe('Hoist section')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(document.activeElement).toBe(child)

    child.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
    ;(
      document.querySelector('.vmde-section-hoist-menu button') as HTMLElement
    ).click()
    expect(document.activeElement).toBe(
      document.querySelector('.vmde-section-breadcrumb__exit'),
    )
  })

  it('rehydrates the per-webview heading and reapplies scope after a mode DOM rebuild', async () => {
    const f = fixture({ vmdeSectionHoist: { headingIndex: 1 } })
    installSectionHoist(f.editor, f.state)
    expect(visibleBlockText(f.ir)).toEqual(['Child', 'detail'])

    f.inner.currentMode = 'wysiwyg'
    f.wysiwyg.innerHTML = f.ir.innerHTML.replaceAll(
      ` ${HOIST_HIDDEN_ATTR}=""`,
      '',
    )
    await Promise.resolve()

    expect(visibleBlockText(f.wysiwyg)).toEqual(['Child', 'detail'])
  })

  it('rehydrates by heading identity when an earlier heading changes the ordinal', () => {
    const f = fixture({
      vmdeSectionHoist: {
        headingIndex: 1,
        headingId: 'child',
        headingText: 'Child',
        headingLevel: 2,
      },
    })
    const inserted = document.createElement('h2')
    inserted.id = 'inserted'
    inserted.setAttribute('data-block', '0')
    inserted.textContent = 'Inserted externally'
    f.ir.querySelector('#child')?.before(inserted)

    installSectionHoist(f.editor, f.state)

    expect(visibleBlockText(f.ir)).toEqual(['Child', 'detail'])
    expect(
      (f.state.value.vmdeSectionHoist as { headingIndex: number }).headingIndex,
    ).toBe(2)
  })

  it('reapplies outline scope after Vditor rebuilds its outline rows', async () => {
    const f = fixture()
    const controller = installSectionHoist(f.editor, f.state)
    controller.hoistHeading(1)
    const content = document.querySelector<HTMLElement>(
      '.vditor-outline__content',
    )!

    content.innerHTML =
      '<span data-target-id="chapter">Chapter</span>' +
      '<span data-target-id="child">Child</span>' +
      '<span data-target-id="sibling">Sibling</span>' +
      '<span data-target-id="next">Next</span>'
    await Promise.resolve()

    expect(
      Array.from(content.querySelectorAll<HTMLElement>('[data-target-id]'))
        .filter((item) => !item.hasAttribute(HOIST_OUTLINE_HIDDEN_ATTR))
        .map((item) => item.textContent),
    ).toEqual(['Child'])
  })
})

describe('inline toc navigation', () => {
  it("captures a pointer click and scrolls to Vditor's generated target id", () => {
    document.body.innerHTML =
      '<div id="app"><div class="vditor-ir"><pre class="vditor-reset">' +
      '<div class="vditor-toc"><span data-target-id="chapter">Chapter</span></div>' +
      '<h2 id="chapter">Chapter</h2></pre></div></div>'
    ;(globalThis as any).CSS = { escape: (value: string) => value }
    const target = document.getElementById('chapter')!
    target.scrollIntoView = vi.fn()
    setupInlineTocNavigation()

    document
      .querySelector<HTMLElement>('[data-target-id]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
  })

  it('does not intercept a toc click from another rendered surface', () => {
    document.body.innerHTML =
      '<div id="app">' +
      '<div class="vditor-ir"><pre class="vditor-reset"><h2 id="duplicate">Hidden</h2></pre></div>' +
      '<div class="vditor-wysiwyg"><pre class="vditor-reset">' +
      '<div class="vditor-toc"><span data-target-id="duplicate">Visible</span></div>' +
      '<h2 id="duplicate">Visible</h2></pre></div></div>'
    const headings = document.querySelectorAll<HTMLElement>('#duplicate')
    headings[0].scrollIntoView = vi.fn()
    headings[1].scrollIntoView = vi.fn()
    setupInlineTocNavigation()

    document
      .querySelector<HTMLElement>('.vditor-wysiwyg [data-target-id]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(headings[0].scrollIntoView).not.toHaveBeenCalled()
    expect(headings[1].scrollIntoView).not.toHaveBeenCalled()
  })
})
