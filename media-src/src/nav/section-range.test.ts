// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  headingPathForIndex,
  sectionRangeForHeading,
  topLevelBlocks,
} from './section-range'

function surface(markup: string): HTMLElement {
  const root = document.createElement('pre')
  root.innerHTML = markup
  return root
}

describe('hierarchical heading sections', () => {
  it('owns blocks until the next heading at the same or higher level', () => {
    const root = surface(
      '<p data-block="0">preamble</p>' +
        '<h1 data-block="0">Chapter</h1>' +
        '<p data-block="0">intro</p>' +
        '<h2 data-block="0">Child</h2>' +
        '<p data-block="0">detail</p>' +
        '<h3 data-block="0">Grandchild</h3>' +
        '<p data-block="0">deep</p>' +
        '<h2 data-block="0">Sibling</h2>' +
        '<p data-block="0">next</p>' +
        '<h1 data-block="0">Next chapter</h1>',
    )
    const blocks = topLevelBlocks(root)

    expect(sectionRangeForHeading(blocks, 3)).toEqual({
      start: 3,
      end: 7,
      level: 2,
    })
    expect(sectionRangeForHeading(blocks, 1)).toEqual({
      start: 1,
      end: 9,
      level: 1,
    })
  })

  it('rejects nested data-block nodes and non-heading start blocks', () => {
    const root = surface(
      '<blockquote data-block="0"><p data-block="0">nested</p></blockquote>' +
        '<p data-block="0">plain</p>',
    )
    const blocks = topLevelBlocks(root)

    expect(blocks).toHaveLength(2)
    expect(sectionRangeForHeading(blocks, 1)).toBeNull()
  })

  it('derives the ancestor breadcrumb path from document order', () => {
    const root = surface(
      '<h1 data-block="0">Architecture</h1>' +
        '<h3 data-block="0">Rendering</h3>' +
        '<p data-block="0">body</p>' +
        '<h2 data-block="0">Cache</h2>' +
        '<h4 data-block="0">Memory</h4>',
    )
    const blocks = topLevelBlocks(root)

    expect(headingPathForIndex(blocks, 4).map((entry) => entry.text)).toEqual([
      'Architecture',
      'Cache',
      'Memory',
    ])
  })
})
