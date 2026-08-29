import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const readSource = (dir: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(`../../media-src/vendor/${dir}/source.json`, import.meta.url),
      ),
      'utf8',
    ),
  )

describe('remaining renderer vendor pins', () => {
  it.each([
    ['mermaid-layout-elk', '0.2.3'],
    ['elk', '0.12.0'],
    ['vega', '7.1.0'],
    ['threejs', '0.185.1'],
    ['abcjs', '6.7.0'],
    ['smiles-drawer', '2.4.1'],
    ['wavedrom', '3.6.2'],
    ['flowchart.js', '1.18.0'],
    ['plantuml', '1.2026.7'],
  ])('%s is pinned to %s', (dir, version) => {
    expect(readSource(dir).version).toBe(version)
  })

  it('records the exact Vega bundle components', () => {
    expect(readSource('vega').components).toEqual([
      { ecosystem: 'npm', name: 'vega-embed', version: '7.1.0' },
      { ecosystem: 'npm', name: 'vega', version: '6.4.0' },
      { ecosystem: 'npm', name: 'vega-lite', version: '6.4.3' },
    ])
  })

  it('records Viz from the same PlantUML release and its exact nested version', () => {
    const source = readSource('viz')
    expect(source.source).toContain('/tag/v1.2026.7')
    expect(source.artifact).toContain('js-plantuml-1.2026.7.zip')
    expect(source.components).toEqual([
      expect.objectContaining({
        ecosystem: 'npm',
        name: '@viz-js/viz',
        version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
      }),
    ])
  })
})
