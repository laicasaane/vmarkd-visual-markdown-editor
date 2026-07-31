// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { nativeSourceForLive } from './diagram-surfaces'

// Task 466 — `nativeSourceForLive` replaces the earlier `nativeSourceForPane(pane, lang)` (and task
// 454's `resolveEchartsSource`, folded in here on the same simplification pass — see this function's
// own comment in diagram-surfaces.ts). The old `pane.querySelector('.language-lang')?.getAttribute
// ('data-code')` read the FIRST match within `pane`. That is correct for `.vditor-ir__preview`/
// `.vditor-wysiwyg__preview` (exactly one diagram each) but wrong for `.vditor-preview`, which is a
// SINGLE pane holding every diagram in the document — with 2+ same-lang diagrams there, every one of
// them would resolve to the FIRST one's source. Reading the `data-code` stamp directly off the LIVE
// node is correct by construction: there is no pane-wide query left to get wrong.
describe('nativeSourceForLive (task 466 — per-live-node source resolution)', () => {
  beforeEach(() => {
    document.body.replaceChildren()
  })

  it('resolves TWO same-language diagrams in a shared .vditor-preview pane to their OWN data-code', () => {
    const app = document.createElement('div')
    app.innerHTML = `
      <div class="vditor-preview">
        <div class="language-mermaid" data-processed="true" data-code="graph TD; A-->B;"><svg></svg></div>
        <div class="language-mermaid" data-processed="true" data-code="sequenceDiagram; A->>B: hi"><svg></svg></div>
      </div>`
    document.body.appendChild(app)
    const [first, second] = Array.from(
      app.querySelectorAll<HTMLElement>('.language-mermaid'),
    )
    expect(nativeSourceForLive(first, 'mermaid')).toBe('graph TD; A-->B;')
    expect(nativeSourceForLive(second, 'mermaid')).toBe(
      'sequenceDiagram; A->>B: hi',
    )
  })

  it('resolves TWO same-language echarts in a shared .vditor-preview pane to their OWN data-code (the exact hazard task 454 dodged by not routing through this helper)', () => {
    const app = document.createElement('div')
    app.innerHTML = `
      <div class="vditor-preview">
        <div class="language-echarts" data-processed="true" data-code='{"title":{"text":"Chart A"}}'><canvas></canvas></div>
        <div class="language-echarts" data-processed="true" data-code='{"title":{"text":"Chart B"}}'><canvas></canvas></div>
      </div>`
    document.body.appendChild(app)
    const [first, second] = Array.from(
      app.querySelectorAll<HTMLElement>('.language-echarts'),
    )
    expect(nativeSourceForLive(first, 'echarts')).toBe(
      '{"title":{"text":"Chart A"}}',
    )
    expect(nativeSourceForLive(second, 'echarts')).toBe(
      '{"title":{"text":"Chart B"}}',
    )
  })

  it('falls back to the sibling editable marker when the live node carries no data-code (IR/WYSIWYG, pre-stamp)', () => {
    const app = document.createElement('div')
    app.innerHTML = `
      <div class="vditor-ir__node">
        <pre><code class="language-mermaid">graph TD; A-->B;</code></pre>
        <div class="vditor-ir__preview">
          <div class="language-mermaid" data-processed="true"><svg></svg></div>
        </div>
      </div>`
    document.body.appendChild(app)
    const live = app.querySelector<HTMLElement>(
      '.vditor-ir__preview .language-mermaid',
    )!
    expect(nativeSourceForLive(live, 'mermaid')).toBe('graph TD; A-->B;')
  })

  it('falls back to the sibling editable marker in a WYSIWYG block too (blockScopeOf covers .vditor-wysiwyg__block)', () => {
    const app = document.createElement('div')
    app.innerHTML = `
      <div class="vditor-wysiwyg__block" data-type="code-block">
        <pre><code class="language-mermaid">graph TD; A-->B;</code></pre>
        <div class="vditor-wysiwyg__preview">
          <div class="language-mermaid" data-processed="true"><svg></svg></div>
        </div>
      </div>`
    document.body.appendChild(app)
    const live = app.querySelector<HTMLElement>(
      '.vditor-wysiwyg__preview .language-mermaid',
    )!
    expect(nativeSourceForLive(live, 'mermaid')).toBe('graph TD; A-->B;')
  })

  it('returns null when neither the stamp nor a sibling marker exists', () => {
    const app = document.createElement('div')
    app.innerHTML = `<div class="vditor-preview"><div class="language-mermaid"><svg></svg></div></div>`
    document.body.appendChild(app)
    const live = app.querySelector<HTMLElement>('.language-mermaid')!
    expect(nativeSourceForLive(live, 'mermaid')).toBeNull()
  })
})
