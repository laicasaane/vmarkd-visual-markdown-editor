// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { observeDiagramZoom, zoomBy } from './diagram-zoom'

describe('zoomBy — pure zoom math', () => {
  it('zooms in/out by the given factor, clamped to [MIN_K, MAX_K]', () => {
    const st = { k: 1, tx: 0, ty: 0 }
    expect(
      zoomBy({ style: {} } as unknown as SVGElement, st, 1.12, 50, 50),
    ).toBe(true)
    expect(st.k).toBeCloseTo(1.12)
    zoomBy({ style: {} } as unknown as SVGElement, st, 1 / 1.12, 50, 50)
    expect(st.k).toBeCloseTo(1)
  })

  it('no-ops (returns false, leaves state alone) once the MAX_K clamp is hit', () => {
    const st = { k: 12, tx: 0, ty: 0 } // MAX_K
    const changed = zoomBy(
      { style: {} } as unknown as SVGElement,
      st,
      1.12,
      0,
      0,
    )
    expect(changed).toBe(false)
    expect(st.k).toBe(12)
  })

  it('no-ops once the MIN_K clamp is hit', () => {
    const st = { k: 0.4, tx: 0, ty: 0 } // MIN_K
    const changed = zoomBy(
      { style: {} } as unknown as SVGElement,
      st,
      1 / 1.12,
      0,
      0,
    )
    expect(changed).toBe(false)
    expect(st.k).toBe(0.4)
  })
})

// A rendered static-SVG diagram (mermaid/d2/flowchart/graphviz/abc/smiles) inside a preview pane.
function buildDiagram(): {
  app: HTMLElement
  wrapper: HTMLElement
  svg: SVGElement
} {
  const app = document.createElement('div')
  app.innerHTML =
    '<div class="vditor-ir__preview"><div class="language-mermaid"><svg><rect /></svg></div></div>'
  document.body.appendChild(app)
  return {
    app,
    wrapper: app.querySelector('.language-mermaid') as HTMLElement,
    svg: app.querySelector('svg') as unknown as SVGElement,
  }
}

function keydown(
  target: HTMLElement,
  key: string,
  opts: KeyboardEventInit = {},
) {
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...opts,
    }),
  )
}

// observeDiagramZoom's decorate pass runs on a scheduled requestAnimationFrame, not synchronously —
// flush it before asserting on the wrapper's bound handlers/attributes.
function flushRaf(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()))
}

describe('observeDiagramZoom — keyboard +/-/0 parity (task 459)', () => {
  it('makes the wrapper script/click-focusable but NOT a Tab stop (tabindex="-1")', async () => {
    const { app, wrapper } = buildDiagram()
    const dispose = observeDiagramZoom(app)
    await flushRaf()
    expect(wrapper.getAttribute('tabindex')).toBe('-1')
    dispose()
  })

  it('"+"/"=" zoom in, "-" zooms out, "0" resets — same steps as the wheel handler', async () => {
    const { app, wrapper, svg } = buildDiagram()
    const dispose = observeDiagramZoom(app)
    await flushRaf()

    keydown(wrapper, '+')
    const scaleAfterPlus = svg.style.transform
    expect(scaleAfterPlus).toContain('scale(1.1200)')

    keydown(wrapper, '-')
    keydown(wrapper, '-') // net one step below 1 (started from 1.12)
    expect(svg.style.transform).not.toContain('scale(1.1200)')

    keydown(wrapper, '0')
    expect(svg.style.transform).toContain('scale(1.0000)')

    dispose()
  })

  it('ignores the key when a modifier is held (reserves Ctrl+wheel-family chords)', async () => {
    const { app, wrapper, svg } = buildDiagram()
    const dispose = observeDiagramZoom(app)
    await flushRaf()
    keydown(wrapper, '+', { ctrlKey: true })
    expect(svg.style.transform).toContain('scale(1.0000)') // unchanged
    dispose()
  })

  it('preventDefaults and stops the key from reaching an ancestor listener (no stray text insert)', async () => {
    const { app, wrapper } = buildDiagram()
    const dispose = observeDiagramZoom(app)
    await flushRaf()
    let reachedAncestor = false
    app.addEventListener('keydown', () => {
      reachedAncestor = true
    })
    const evt = new KeyboardEvent('keydown', {
      key: '+',
      bubbles: true,
      cancelable: true,
    })
    wrapper.dispatchEvent(evt)
    expect(evt.defaultPrevented).toBe(true)
    expect(reachedAncestor).toBe(false)
    dispose()
  })
})
