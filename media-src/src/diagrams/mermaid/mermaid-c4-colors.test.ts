// @vitest-environment jsdom
import { expect, test } from 'vitest'
import { contrastRatio } from '../../../../src/shared/mermaid-palettes'
import { styleMermaidC4 } from './mermaid-c4-colors'

const DARK_BOXES = {
  person: '#062b50',
  system: '#083e70',
  container: '#0d537f',
  component: '#176a96',
  external: '#33383b',
}

/** Mermaid's canonical C4 output: box fills + #FFFFFF labels, #444444 for everything else. */
const c4Svg = () => `
  <svg aria-roledescription="c4">
    <g class="person-man">
      <rect fill="#08427B" stroke="#073B6F"></rect>
      <text fill="#FFFFFF">User</text>
      <text fill="#FFFFFF">&lt;&lt;person&gt;&gt;</text>
    </g>
    <g class="person-man">
      <rect fill="#1168BD" stroke="#3C7FC0"></rect><text fill="#FFFFFF">API</text>
    </g>
    <g class="person-man">
      <rect fill="#438DD5" stroke="#3C7FC0"></rect><text fill="#FFFFFF">Web</text>
    </g>
    <g class="person-man">
      <rect fill="#85BBF0" stroke="#78A8D8"></rect><text fill="#FFFFFF">DB</text>
    </g>
    <g class="person-man">
      <path fill="#999999" stroke="#8A8A8A" d="M0 0h10v10z"></path>
      <text fill="#FFFFFF">Ext</text>
    </g>
    <rect fill="none" stroke="#444444" stroke-dasharray="7.0,7.0"></rect>
    <text fill="#444444">Boundary</text>
    <text fill="#444444">Uses</text>
    <line stroke="#444444"></line>
    <path stroke="#444444" d="M0 0Q5 5 10 0"></path>
    <marker><path></path></marker>
  </svg>
`

const fills = (host: ParentNode) =>
  [...host.querySelectorAll('g rect, g path')].map((el) =>
    el.getAttribute('fill'),
  )
const labelInk = (host: ParentNode, text: string) =>
  [...host.querySelectorAll('text')]
    .find((el) => el.textContent === text)
    ?.getAttribute('fill')

test('dark ramp: remaps every box fill, whitens box labels, palettes the rest', () => {
  const host = document.createElement('div')
  host.innerHTML = `${c4Svg()}<svg aria-roledescription="flowchart-v2"><text fill="#123456">Other</text></svg>`

  styleMermaidC4(host, {
    text: '#bbbebf',
    line: '#48a0c7',
    boxes: DARK_BOXES,
  })

  expect(fills(host)).toEqual([
    '#062b50',
    '#083e70',
    '#0d537f',
    '#176a96',
    '#33383b',
  ])
  // Box labels contrast with their own box, relationship/boundary labels with the page.
  expect(labelInk(host, 'User')).toBe('#ffffff')
  expect(labelInk(host, 'Ext')).toBe('#ffffff')
  expect(labelInk(host, 'Uses')).toBe('#bbbebf')
  expect(labelInk(host, 'Boundary')).toBe('#bbbebf')

  const straight = host.querySelector('line')
  const curved = host.querySelector('path[d^="M0 0Q"]')
  const boundary = host.querySelector('rect[stroke-dasharray]')
  const marker = host.querySelector('marker path')
  expect(straight?.getAttribute('stroke')).toBe('#48a0c7')
  // The curved (BiRel / Rel_Back) relationship path used to keep mermaid's #444444.
  expect(curved?.getAttribute('stroke')).toBe('#48a0c7')
  expect(boundary?.getAttribute('stroke')).toBe('#48a0c7')
  expect(marker?.getAttribute('fill')).toBe('#48a0c7')
  expect(marker?.getAttribute('stroke')).toBe('#48a0c7')
  // Box borders are derived from the (remapped) fill, not left on mermaid's canonical shade.
  expect(host.querySelector('g rect')?.getAttribute('stroke')).toBe('#44607c')

  expect(
    host
      .querySelector('svg[aria-roledescription="flowchart-v2"] text')
      ?.getAttribute('fill'),
  ).toBe('#123456')
})

test('light page: keeps mermaid fills but inks each label against its own box', () => {
  const host = document.createElement('div')
  host.innerHTML = c4Svg()

  styleMermaidC4(host, { text: '#202020', line: '#0069cc' })

  expect(fills(host)).toEqual([
    '#08427B',
    '#1168BD',
    '#438DD5',
    '#85BBF0',
    '#999999',
  ])
  // White stays on the dark boxes (painting them #202020 was 1.6:1); the light blue and grey
  // boxes flip to dark ink — mermaid's white there is 2.0:1 / 2.8:1.
  expect(labelInk(host, 'User')).toBe('#ffffff')
  expect(labelInk(host, 'API')).toBe('#ffffff')
  expect(labelInk(host, 'Web')).toBe('#0d1b2a')
  expect(labelInk(host, 'DB')).toBe('#0d1b2a')
  expect(labelInk(host, 'Ext')).toBe('#0d1b2a')
  expect(labelInk(host, 'Uses')).toBe('#202020')
})

test('every box label clears WCAG AA against its box, on both ramps', () => {
  for (const colors of [
    { text: '#bbbebf', line: '#48a0c7', boxes: DARK_BOXES },
    { text: '#202020', line: '#0069cc' },
  ]) {
    const host = document.createElement('div')
    host.innerHTML = c4Svg()
    styleMermaidC4(host, colors)

    for (const shape of host.querySelectorAll('g rect, g path')) {
      const fill = shape.getAttribute('fill') as string
      for (const label of shape.parentElement?.querySelectorAll('text') ?? []) {
        expect(
          contrastRatio(fill, label.getAttribute('fill') as string),
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  }
})

test('with no palette it still fixes the ink, and leaves non-C4 SVGs alone', () => {
  const host = document.createElement('div')
  host.innerHTML = c4Svg()

  styleMermaidC4(host, null)

  expect(labelInk(host, 'DB')).toBe('#0d1b2a')
  expect(labelInk(host, 'User')).toBe('#ffffff')
  // Nothing to say about the page-background elements without a palette — left as mermaid drew them.
  expect(labelInk(host, 'Uses')).toBe('#444444')
  expect(host.querySelector('line')?.getAttribute('stroke')).toBe('#444444')

  const other = document.createElement('div')
  other.innerHTML =
    '<svg aria-roledescription="flowchart-v2"><text>Other</text></svg>'
  styleMermaidC4(other, { text: '#bbbebf', line: '#48a0c7' })
  expect(other.querySelector('text')?.getAttribute('fill')).toBeNull()
})
