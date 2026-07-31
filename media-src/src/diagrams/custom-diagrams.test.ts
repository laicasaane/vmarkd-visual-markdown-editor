// @vitest-environment jsdom
import { test, expect, beforeEach, describe } from 'vitest'
import { ENGINES } from './engine-registry'
import {
  CUSTOM_DIAGRAM_ADAPTERS,
  customDiagramRenderers,
  presentCustomLangs,
} from './custom-diagrams'

beforeEach(() => {
  document.body.innerHTML = ''
})

// enrichMarkdownLabels (task 154) moved to diagram-engines/d2.test.ts (task 409, the deferred D2
// engine split) alongside the rest of the D2 engine.

// Drives observeCustomDiagrams' per-lang dispatch (task 164 §5): only engines whose lang is present
// get invoked + a yielded frame. Must be a SUPERSET of findBlocks (no edit-surface filter).
describe('presentCustomLangs', () => {
  test('empty doc → empty set (no-diagram sweeps skip every renderer)', () => {
    document.body.innerHTML =
      '<div id="app"><p>prose</p><pre><code>plain</code></pre></div>'
    expect(presentCustomLangs(document.getElementById('app')!).size).toBe(0)
  })

  test('picks out exactly the langs with an un-rendered block (incl. hyphenated vega-lite)', () => {
    document.body.innerHTML =
      '<div id="app">' +
      '<div class="language-d2"></div>' +
      '<code class="language-vega-lite hljs">{}</code>' +
      '<pre><code class="language-python">x=1</code></pre>' +
      '</div>'
    const present = presentCustomLangs(document.getElementById('app')!)
    expect(present.has('d2')).toBe(true)
    expect(present.has('vega-lite')).toBe(true)
    // A native/non-custom lang is still reported (harmless: it has no renderer in the array), but a
    // renderer whose lang is absent (e.g. wavedrom) is NOT — that's the whole point.
    expect(present.has('wavedrom')).toBe(false)
  })

  test('skips already-rendered blocks (data-processed="true")', () => {
    document.body.innerHTML =
      '<div id="app">' +
      '<div class="language-d2" data-processed="true"></div>' +
      '<div class="language-nomnoml"></div>' +
      '</div>'
    const present = presentCustomLangs(document.getElementById('app')!)
    expect(present.has('d2')).toBe(false) // done → not re-swept
    expect(present.has('nomnoml')).toBe(true)
  })

  test('SUPERSET of findBlocks: a lang only in an editable marker is still reported (safe false positive)', () => {
    // findBlocks would SKIP this (edit-surface .closest filter); the pre-scan must NOT — a false
    // negative would drop a real diagram, a false positive just degrades to a renderer no-op.
    document.body.innerHTML =
      '<div id="app"><pre class="vditor-ir__marker--pre">' +
      '<code class="language-wavedrom">{}</code></pre></div>'
    expect(
      presentCustomLangs(document.getElementById('app')!).has('wavedrom'),
    ).toBe(true)
  })
})

// Task 404 phase 1: CUSTOM_DIAGRAM_ADAPTERS must cover EXACTLY the `family: 'custom'` engines —
// in both directions, so a new custom engine that forgets to register an adapter (the "N+1"
// silent-non-render risk the review flagged) fails this test instead of shipping unwired.
describe('CUSTOM_DIAGRAM_ADAPTERS completeness (task 404 phase 1)', () => {
  const customLangs = ENGINES.filter((e) => e.family === 'custom').map(
    (e) => e.lang,
  )

  test('every family:"custom" engine has an adapter entry', () => {
    for (const lang of customLangs) {
      expect(
        CUSTOM_DIAGRAM_ADAPTERS[lang],
        `missing adapter for "${lang}"`,
      ).toBeDefined()
    }
  })

  test('no adapter entry exists for a non-custom (or unknown) lang', () => {
    const adapterLangs = Object.keys(CUSTOM_DIAGRAM_ADAPTERS)
    for (const lang of adapterLangs) {
      expect(customLangs, `orphan adapter for "${lang}"`).toContain(lang)
    }
  })

  test('every adapter has a render and a reRender function', () => {
    for (const lang of Object.keys(CUSTOM_DIAGRAM_ADAPTERS)) {
      const adapter = CUSTOM_DIAGRAM_ADAPTERS[lang]
      expect(typeof adapter.render, `${lang}.render`).toBe('function')
      expect(typeof adapter.reRender, `${lang}.reRender`).toBe('function')
    }
  })
})

// Task 404 phase 2: observeCustomDiagrams used to carry its OWN hard-coded `{lang, render}` array —
// a byte-for-byte duplicate of CUSTOM_DIAGRAM_ADAPTERS (the exact "same knowledge in two places"
// engine-registry.ts exists to kill). customDiagramRenderers() is the single derivation both the
// completeness test above and observeCustomDiagrams' dispatch loop now read from.
describe('customDiagramRenderers (task 404 phase 2)', () => {
  test('langs + order match ENGINES family:"custom", in registry order', () => {
    const expectedLangs = ENGINES.filter((e) => e.family === 'custom').map(
      (e) => e.lang,
    )
    expect(customDiagramRenderers().map((r) => r.lang)).toEqual(expectedLangs)
  })

  test("each entry's render is the SAME function reference as CUSTOM_DIAGRAM_ADAPTERS[lang].render", () => {
    for (const { lang, render } of customDiagramRenderers()) {
      expect(render, lang).toBe(CUSTOM_DIAGRAM_ADAPTERS[lang].render)
    }
  })
})
