// @vitest-environment jsdom
import { expect, test } from 'vitest'
import { appendDiagramNote, diagramNoteHtml } from './diagram-note'

test('diagramNoteHtml builds the note: icon + message + data-render', () => {
  const html = diagramNoteHtml('Only the first of 3 diagrams is shown')
  expect(html).toContain('class="vmde-diagram-note"')
  expect(html).toContain('data-render="1"') // Lute-invisible (never serialized)
  expect(html).toContain('vmde-diagram-note__icon')
  expect(html).toContain('Only the first of 3 diagrams is shown')
})

test('diagramNoteHtml escapes &/</> in the message', () => {
  const html = diagramNoteHtml('a <b> & c')
  expect(html).not.toContain('<b>')
  expect(html).toContain('a &lt;b&gt; &amp; c')
})

test('appendDiagramNote appends below existing content, leaving the render intact', () => {
  const el = document.createElement('div')
  el.innerHTML = '<svg id="real"></svg>'
  appendDiagramNote(el, 'note one')
  expect(el.querySelector('svg#real')).not.toBeNull() // render untouched
  expect(el.querySelector('.vmde-diagram-note')?.textContent).toContain(
    'note one',
  )
  // the note is a direct child, appended AFTER the svg
  expect(el.lastElementChild?.classList.contains('vmde-diagram-note')).toBe(
    true,
  )
})

test('appendDiagramNote is idempotent — a re-append replaces, never stacks (re-theme safe)', () => {
  const el = document.createElement('div')
  appendDiagramNote(el, 'first')
  appendDiagramNote(el, 'second')
  expect(el.querySelectorAll('.vmde-diagram-note').length).toBe(1)
  expect(el.querySelector('.vmde-diagram-note')?.textContent).toContain(
    'second',
  )
})
