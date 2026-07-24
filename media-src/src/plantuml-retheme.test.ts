// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'

// The real engines need addScript + WASM/TeaVM; stub them and assert what reRenderLang hands over.
const { plantumlRender, graphvizRender, abcRender } = vi.hoisted(() => ({
  plantumlRender: vi.fn(),
  graphvizRender: vi.fn(),
  abcRender: vi.fn(),
}))
vi.mock('vditor/src/ts/markdown/plantumlRender', () => ({ plantumlRender }))
vi.mock('vditor/src/ts/markdown/graphvizRender', () => ({ graphvizRender }))
vi.mock('vditor/src/ts/markdown/abcRender', () => ({ abcRender }))

import {
  reRenderPlantuml,
  reRenderGraphviz,
  reRenderAbc,
} from './plantuml-retheme'

// Task 363 — a theme flip re-renders these mono engines in place by clearing the node and calling
// the renderer again. That is safe AFTER a render (the patched renderers stamp `data-code` as they
// draw) but a flip landing DURING the first render found the source only in textContent, wiped it
// with `innerHTML = ''`, and left the diagram permanently empty.

function mount(inner: string): HTMLElement {
  const app = document.createElement('div')
  app.innerHTML = `<div class="vditor-ir__preview" data-render="2">${inner}</div>`
  document.body.replaceChildren(app)
  return app
}

describe('reRenderLang — source survives the in-place clear', () => {
  beforeEach(() => {
    plantumlRender.mockClear()
    graphvizRender.mockClear()
    abcRender.mockClear()
  })

  it('keeps a FINISHED render re-renderable (data-code already stamped)', () => {
    const app = mount(
      '<div class="language-plantuml" data-code="@startuml\nA->B\n@enduml" data-processed="true"><svg id="old"></svg></div>',
    )
    reRenderPlantuml(app, '/cdn')
    const el = app.querySelector('.language-plantuml') as HTMLElement
    expect(el.getAttribute('data-code')).toBe('@startuml\nA->B\n@enduml')
    expect(el.getAttribute('data-processed')).toBeNull() // unblocked for the redraw
    expect(el.querySelector('svg')).toBeNull() // cleared, ready to be drawn fresh
    expect(plantumlRender).toHaveBeenCalledTimes(1)
  })

  // THE BUG: no data-code yet, source only in textContent.
  it('stamps the not-yet-rendered source into data-code before clearing it', () => {
    const app = mount(
      '<div class="language-graphviz">digraph G { A -> B }</div>',
    )
    reRenderGraphviz(app, '/cdn')
    const el = app.querySelector('.language-graphviz') as HTMLElement
    expect(el.getAttribute('data-code')).toBe('digraph G { A -> B }')
    expect(graphvizRender).toHaveBeenCalledTimes(1)
  })

  it('leaves a node with NO source alone instead of clearing it into an unrecoverable state', () => {
    const app = mount('<div class="language-graphviz"></div>')
    reRenderGraphviz(app, '/cdn')
    const el = app.querySelector('.language-graphviz') as HTMLElement
    expect(el.getAttribute('data-code')).toBeNull()
    expect(graphvizRender).not.toHaveBeenCalled()
  })

  // Mid-render the node may already hold engine output; its textContent is markup text, not source.
  it('never mistakes rendered markup for the source', () => {
    const app = mount(
      '<div class="language-plantuml"><svg><text>Alice</text></svg></div>',
    )
    reRenderPlantuml(app, '/cdn')
    const el = app.querySelector('.language-plantuml') as HTMLElement
    expect(el.getAttribute('data-code')).toBeNull()
    // Untouched — the in-flight render gets to finish rather than being wiped.
    expect(el.querySelector('svg')).not.toBeNull()
    expect(plantumlRender).not.toHaveBeenCalled()
  })

  it('applies to abc as well (same clear-and-redraw path)', () => {
    const app = mount('<div class="language-abc">X:1\nK:C\nCDEF|</div>')
    reRenderAbc(app, '/cdn')
    const el = app.querySelector('.language-abc') as HTMLElement
    expect(el.getAttribute('data-code')).toBe('X:1\nK:C\nCDEF|')
    expect(abcRender).toHaveBeenCalledTimes(1)
  })
})
