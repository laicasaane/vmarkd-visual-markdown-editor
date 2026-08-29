// @vitest-environment jsdom
import { expect, test } from 'vitest'
import {
  diagramLoadingHtml,
  removeDiagramLoading,
  renderDiagramLoading,
} from './diagram-loading'

test('diagramLoadingHtml builds the placeholder: engine title + spinner + data-render', () => {
  const html = diagramLoadingHtml('plantuml')
  expect(html).toContain('class="vmde-diagram-loading"')
  expect(html).toContain('data-render="1"') // Lute-invisible insurance (never serialized)
  expect(html).toContain('vmde-diagram-loading__spinner')
  expect(html).toContain('Rendering PlantUML…')
})

test('diagramLoadingHtml falls back to the slug for an unknown engine', () => {
  expect(diagramLoadingHtml('something-unknown')).toContain(
    'Rendering something-unknown…',
  )
})

test('renderDiagramLoading replaces the element content with the placeholder', () => {
  const el = document.createElement('div')
  el.innerHTML = '<svg>stale render</svg>'
  renderDiagramLoading(el, 'plantuml')
  expect(el.querySelector('svg')).toBeNull()
  expect(el.querySelector('.vmde-diagram-loading')).not.toBeNull()
  expect(el.querySelector('.vmde-diagram-loading__label')?.textContent).toBe(
    'Rendering PlantUML…',
  )
})

test('removeDiagramLoading clears the placeholder and is idempotent', () => {
  const el = document.createElement('div')
  renderDiagramLoading(el, 'plantuml')
  expect(el.querySelector('.vmde-diagram-loading')).not.toBeNull()
  removeDiagramLoading(el)
  expect(el.querySelector('.vmde-diagram-loading')).toBeNull()
  // idempotent: a second call on already-cleared content is a no-op (engine may have replaced innerHTML)
  expect(() => removeDiagramLoading(el)).not.toThrow()
})

test('removeDiagramLoading leaves a rendered SVG untouched (only strips the placeholder)', () => {
  const el = document.createElement('div')
  // simulate the engine APPENDING its svg alongside the placeholder (vs replacing innerHTML)
  renderDiagramLoading(el, 'plantuml')
  el.insertAdjacentHTML('beforeend', '<svg id="real"></svg>')
  removeDiagramLoading(el)
  expect(el.querySelector('.vmde-diagram-loading')).toBeNull()
  expect(el.querySelector('svg#real')).not.toBeNull()
})
