// Guards the STL 3D-model material colour (task 409: moved out of custom-diagrams.ts into its own
// engine file/test pair — was stl-material.test.ts). The reported bug: the model used the theme
// foreground (currentColor) as its base colour, but three.js lighting MULTIPLIES the base, so a
// near-black foreground (every light content theme, e.g. github-light) rendered an all-black blob.
// The fix is a fixed, theme-INDEPENDENT mid-grey. These tests lock in that invariant.
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, test } from 'vitest'
import { luminance } from '../../../../src/shared/mermaid-palettes'
import { reRenderStl, renderStl, STL_MATERIAL_COLOR } from './stl'

beforeEach(() => {
  document.body.innerHTML = ''
  document.getElementById('vditorThreeStlScript')?.remove()
  delete (window as any).__threeSTL
})

test('a failed Three.js STL load shows a terminal error instead of returning silently', async () => {
  document.body.innerHTML =
    '<div class="language-stl" data-code="solid triangle"></div>'

  renderStl()
  document
    .getElementById('vditorThreeStlScript')!
    .dispatchEvent(new Event('error'))
  await new Promise((r) => setTimeout(r, 0))

  const wrapper = document.querySelector<HTMLElement>('.language-stl')!
  expect(wrapper.querySelector('.vmde-diagram-error')).not.toBeNull()
  expect(wrapper.textContent).toContain('Three.js STL')
  expect(wrapper.getAttribute('data-stl-error')).toBe('load')
  expect(wrapper.getAttribute('data-processed')).toBe('true')
})

test('rerender clears stale STL load-failure metadata before retrying', () => {
  document.body.innerHTML = `
    <div class="vditor-preview">
      <div class="language-stl" data-processed="true" data-stl-error="load">old</div>
    </div>`

  reRenderStl()

  expect(
    document.querySelector('.language-stl')?.hasAttribute('data-stl-error'),
  ).toBe(false)
})

describe('STL 3D material colour', () => {
  it('is a fixed hex (theme-independent — never derived from currentColor)', () => {
    expect(STL_MATERIAL_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  // Pins the EXACT value. The real-VS-Code e2e (test/vscode-e2e/stl-material.spec.ts) can only assert
  // the applied colour on a host that can create a WebGL context — under headless xvfb the renderer
  // throws and the error box removes the canvas carrying data-stl-material. So the exact-value guard
  // has to live here, where it runs on every `npm test`, not only on a GPU-capable machine.
  it('is the specific neutral mid-grey the renderer applies', () => {
    expect(STL_MATERIAL_COLOR).toBe('#9aa0a6')
  })

  it('is a mid-tone so directional lighting reads on BOTH light and dark backgrounds', () => {
    // Not near-black (the github-light bug) and not near-white (would wash out): a comfortable
    // mid-tone the lit/shadowed faces can spread around without clipping.
    const y = luminance(STL_MATERIAL_COLOR)
    expect(y).toBeGreaterThan(0.2)
    expect(y).toBeLessThan(0.7)
  })
})
