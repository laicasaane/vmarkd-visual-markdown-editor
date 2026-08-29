// @vitest-environment jsdom
// Task 409: moved out of custom-diagrams.test.ts alongside the wavedrom engine itself.
import { test, expect, describe, beforeEach } from 'vitest'
import { renderWavedrom } from './wavedrom'

beforeEach(() => {
  document.body.innerHTML = ''
})

test('a failed WaveDrom load shows a terminal error instead of returning silently', async () => {
  document.getElementById('vditorWavedromScript')?.remove()
  delete (window as any).wavedrom
  document.body.innerHTML =
    '<div class="language-wavedrom" data-code=\'{"signal":[]}\'></div>'

  renderWavedrom()
  document
    .getElementById('vditorWavedromScript')!
    .dispatchEvent(new Event('error'))
  await new Promise((r) => setTimeout(r, 0))

  const wrapper = document.querySelector<HTMLElement>('.language-wavedrom')!
  expect(wrapper.querySelector('.vmde-diagram-error')).not.toBeNull()
  expect(wrapper.textContent).toContain('WaveDrom')
  expect(wrapper.getAttribute('data-wavedrom-error')).toBe('load')
  expect(wrapper.getAttribute('data-processed')).toBe('true')
})

// Task 186: WaveDrom's renderWaveForm resolves its output node via a DOCUMENT-GLOBAL
// document.getElementById(prefix + index). The IR pane renders first and its id-bearing
// divs stay in the pane — so when the full-Preview pass restarted numbering at 0, every
// getElementById hit the STALE IR div, the offscreen stage stayed empty, and faithfulRender
// swapped a zero-height empty div into the Preview wrapper (parity signature {ir:>0, pv:0}).
describe('renderWavedrom target ids across multi-pane passes (task 186)', () => {
  const WAVE = '{"signal":[{"name":"clk","wave":"p."}]}'

  beforeEach(() => {
    // addScript short-circuits when the script tag exists; the stub below mimics the real
    // bundle's contract (1 getElementById hit in wavedrom.min.js) incl. replacing innerHTML.
    if (!document.getElementById('vditorWavedromScript')) {
      const s = document.createElement('script')
      s.id = 'vditorWavedromScript'
      document.head.appendChild(s)
    }
    ;(window as any).wavedrom = {
      renderWaveForm: (i: number, _src: object, prefix: string) => {
        const el = document.getElementById(prefix + i)
        if (el) el.innerHTML = `<svg data-wd="${i}"></svg>`
      },
    }
  })

  async function renderPass(html: string): Promise<HTMLElement> {
    const pane = document.createElement('div')
    pane.innerHTML = html
    document.body.appendChild(pane)
    renderWavedrom(pane)
    // addScript.then → faithfulRender (async) → swap: microtasks + a macrotask tick.
    await new Promise((r) => setTimeout(r, 0))
    return pane.querySelector<HTMLElement>('.language-wavedrom')!
  }

  test('a second pass (the full-Preview copy) renders into ITS wrapper, not the stale IR div', async () => {
    const ir = await renderPass(
      `<div class="language-wavedrom" data-code='${WAVE}'></div>`,
    )
    expect(ir.querySelector('svg')).toBeTruthy()

    const pv = await renderPass(
      `<div class="language-wavedrom" data-code='${WAVE}'></div>`,
    )
    expect(pv.getAttribute('data-processed')).toBe('true')
    // The bug left this empty (svg drawn into the IR pane's leftover div instead).
    expect(pv.querySelector('svg')).toBeTruthy()
  })

  test('no __vmde_wd_* ids remain after a pass — nothing for a later getElementById to hit', async () => {
    // The id must exist only on the offscreen stage during produce(): anything retained in a
    // pane (or persisted by the task-184 render cache and restored in a session whose counter
    // restarted) becomes a stale getElementById winner for some future index.
    await renderPass(
      `<div class="language-wavedrom" data-code='${WAVE}'></div>`,
    )
    await renderPass(
      `<div class="language-wavedrom" data-code='${WAVE}'></div>`,
    )
    expect(document.querySelectorAll('[id^="__vmde_wd_"]')).toHaveLength(0)
  })
})
