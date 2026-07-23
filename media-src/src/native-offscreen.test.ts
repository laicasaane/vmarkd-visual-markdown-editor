import { JSDOM } from 'jsdom'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

// native-offscreen imports engine-registry, which reads the `VDITOR_VERSION` esbuild define at module
// scope — provide it before the dynamic import (same pattern as engine-registry.test.ts).
let hasRenderedOutput: (temp: HTMLElement) => boolean
beforeAll(async () => {
  ;(globalThis as Record<string, unknown>).VDITOR_VERSION = 'test'
  ;({ hasRenderedOutput } = await import('./native-offscreen'))
})

// Task 360 — the offscreen render→swap must copy a themed error box, not only a finished <svg>.
// `hasRenderedOutput` is the swap guard: a broken native diagram (mermaid/abc/flowchart) renders its
// `.vmarkd-diagram-error` box offscreen instead of an <svg>, and it must still be swapped into the live
// node (else the block keeps its raw source text with data-processed="true" and never shows an error).
describe('hasRenderedOutput (native-offscreen swap guard)', () => {
  let doc: Document
  beforeEach(() => {
    doc = new JSDOM('<!doctype html><body></body>').window.document
  })
  const temp = (html: string): HTMLElement => {
    const d = doc.createElement('div')
    d.innerHTML = html
    return d
  }

  it('swaps a finished <svg> render', () => {
    expect(hasRenderedOutput(temp('<svg><g></g></svg>'))).toBe(true)
  })

  it('swaps a themed error box (the task-360 fix — broken render, no svg)', () => {
    expect(
      hasRenderedOutput(
        temp(
          '<div class="vmarkd-diagram-error"><div class="vmarkd-diagram-error__title">Mermaid</div><pre class="vmarkd-diagram-error__msg">Parse error</pre></div>',
        ),
      ),
    ).toBe(true)
  })

  it('does NOT swap raw source text (still rendering / never produced output)', () => {
    expect(hasRenderedOutput(temp('flowchart TD\n  A --&lt; B\n'))).toBe(false)
  })

  it('does NOT swap an empty temp', () => {
    expect(hasRenderedOutput(temp(''))).toBe(false)
  })
})
