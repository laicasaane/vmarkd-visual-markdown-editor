// @vitest-environment jsdom
import { test, expect, beforeEach, describe } from 'vitest'
import { findBlocks, resetCustomBlocks } from './diagram-dom'

beforeEach(() => {
  document.body.innerHTML = ''
})

// Regression for the "diagram sits on a code-PANEL background" bug: Vditor highlights these unknown
// languages as code first (adds `.hljs` to the <code>); findBlocks swaps <code>→<div> and MUST NOT
// carry `.hljs` over, else the highlight.js theme paints the code-panel bg behind the diagram svg.
// (e2e counterpart: test/vscode-e2e/diagram-bg.spec.ts.)

test('code→div swap drops the hljs class (keeps language-X)', () => {
  document.body.innerHTML =
    '<pre class="vditor-ir__preview"><code class="language-d2 hljs">a -> b</code></pre>'
  const blocks = findBlocks(document, 'd2')
  expect(blocks).toHaveLength(1)
  const w = blocks[0].wrapper
  expect(w.tagName).toBe('DIV')
  expect(w.classList.contains('hljs')).toBe(false)
  expect(w.classList.contains('language-d2')).toBe(true)
  expect(w.className).toBe('language-d2')
  expect(blocks[0].code).toBe('a -> b')
})

test('preserves OTHER classes while stripping only hljs', () => {
  document.body.innerHTML =
    '<pre class="vditor-ir__preview"><code class="language-wavedrom hljs extra-x">{}</code></pre>'
  const blocks = findBlocks(document, 'wavedrom')
  expect(blocks).toHaveLength(1)
  const w = blocks[0].wrapper
  expect(w.classList.contains('hljs')).toBe(false)
  expect(w.classList.contains('language-wavedrom')).toBe(true)
  expect(w.classList.contains('extra-x')).toBe(true)
})

test('a code block without hljs swaps cleanly to a language-only div', () => {
  document.body.innerHTML =
    '<pre class="vditor-ir__preview"><code class="language-stl">solid x</code></pre>'
  const blocks = findBlocks(document, 'stl')
  expect(blocks).toHaveLength(1)
  expect(blocks[0].wrapper.className).toBe('language-stl')
})

test('skips the editable IR source marker (only renders in the preview)', () => {
  document.body.innerHTML =
    '<pre class="vditor-ir__marker--pre"><code class="language-d2 hljs">a -> b</code></pre>'
  expect(findBlocks(document, 'd2')).toHaveLength(0)
})

test('an existing rendered div is reused as the wrapper (idempotent, no hljs)', () => {
  document.body.innerHTML =
    '<pre class="vditor-ir__preview"><div class="language-d2" data-code="a -> b"></div></pre>'
  const blocks = findBlocks(document, 'd2')
  expect(blocks).toHaveLength(1)
  expect(blocks[0].wrapper.tagName).toBe('DIV')
  expect(blocks[0].wrapper.classList.contains('hljs')).toBe(false)
})

// Task 400: resetCustomBlocks() is the shared reset step every reRenderX (wavedrom, nomnoml,
// geojson, topojson, vega/vega-lite, stl) now delegates to, replacing 6 near-identical bodies.
describe('resetCustomBlocks (task 400)', () => {
  function pane(html: string): HTMLElement {
    const p = document.createElement('div')
    p.className = 'vditor-ir__preview'
    p.innerHTML = html
    document.body.appendChild(p)
    return p
  }

  test('clears data-processed and blanks a processed block inside a preview pane', () => {
    const p = pane(
      '<div class="language-nomnoml" data-processed="true"><svg></svg></div>',
    )
    resetCustomBlocks(document, 'nomnoml')
    const el = p.querySelector('.language-nomnoml')!
    expect(el.hasAttribute('data-processed')).toBe(false)
    expect(el.innerHTML).toBe('')
  })

  test('leaves an UN-processed block untouched (no data-processed attr at all)', () => {
    const p = pane('<div class="language-nomnoml"><svg></svg></div>')
    resetCustomBlocks(document, 'nomnoml')
    expect(p.querySelector('.language-nomnoml')!.innerHTML).toBe('<svg></svg>')
  })

  test('ignores a matching block OUTSIDE any preview pane', () => {
    const outside = document.createElement('div')
    outside.className = 'language-nomnoml'
    outside.setAttribute('data-processed', 'true')
    outside.innerHTML = '<svg></svg>'
    document.body.appendChild(outside)
    resetCustomBlocks(document, 'nomnoml')
    expect(outside.innerHTML).toBe('<svg></svg>')
  })

  test('clears the given error attribute when provided (the wavedrom/vega wrinkle)', () => {
    const p = pane(
      '<div class="language-wavedrom" data-processed="true" data-wavedrom-error="render"></div>',
    )
    resetCustomBlocks(document, 'wavedrom', 'data-wavedrom-error')
    expect(
      p
        .querySelector('.language-wavedrom')!
        .hasAttribute('data-wavedrom-error'),
    ).toBe(false)
  })

  test('without an error attribute arg, other attributes are left alone (only data-processed + innerHTML change)', () => {
    const p = pane(
      '<div class="language-stl" data-processed="true" data-keep="x"></div>',
    )
    resetCustomBlocks(document, 'stl')
    expect(p.querySelector('.language-stl')!.getAttribute('data-keep')).toBe(
      'x',
    )
  })

  test('accepts an array of langs, resetting each (the vega + vega-lite wrinkle)', () => {
    const p = pane(
      '<div class="language-vega" data-processed="true"></div>' +
        '<div class="language-vega-lite" data-processed="true"></div>',
    )
    resetCustomBlocks(document, ['vega', 'vega-lite'], 'data-vega-error')
    expect(
      p.querySelector('.language-vega')!.hasAttribute('data-processed'),
    ).toBe(false)
    expect(
      p.querySelector('.language-vega-lite')!.hasAttribute('data-processed'),
    ).toBe(false)
  })

  test('resets both `code.language-X` and `div.language-X` forms', () => {
    const p = pane(
      '<code class="language-nomnoml" data-processed="true">src</code>',
    )
    resetCustomBlocks(document, 'nomnoml')
    expect(p.querySelector('.language-nomnoml')!.innerHTML).toBe('')
  })
})
