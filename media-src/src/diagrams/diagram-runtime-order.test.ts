// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest'
import { Disposables } from '../util/disposables'

const { events } = vi.hoisted(() => ({ events: [] as string[] }))

const installer = (event: string) => () => {
  events.push(event)
  return vi.fn()
}

vi.mock('./echarts-fit', () => ({
  installEchartsResize: installer('echarts'),
}))
vi.mock('./smiles-render', () => ({ observeSmiles: installer('smiles') }))
vi.mock('./render-cache-client', () => ({
  installRenderCache: installer('cache'),
}))
vi.mock('./custom-diagrams', () => ({
  observeCustomDiagrams: installer('custom'),
}))
vi.mock('./markmap-fit', () => ({
  installMarkmapResize: installer('markmap'),
}))
vi.mock('./abc-fit', () => ({ observeAbc: installer('abc') }))
vi.mock('./echarts-retheme', () => ({
  observeMindmaps: installer('mindmap'),
}))
vi.mock('./mermaid/mermaid-retheme', () => ({
  disposeMermaidDeferObserver: () => events.push('mermaid:dispose'),
}))

beforeEach(() => {
  events.length = 0
})

it('pins the production adapter installation order', async () => {
  const { installDiagramRuntime } = await import('./diagram-runtime')
  const observers = new Disposables()

  installDiagramRuntime({
    app: document.createElement('div'),
    win: window,
    observers,
    postCacheMessage: vi.fn(),
  })

  expect(events).toEqual([
    'echarts',
    'smiles',
    'cache',
    'custom',
    'markmap',
    'abc',
    'mindmap',
  ])

  observers.disposeAll()
  expect(events.at(-1)).toBe('mermaid:dispose')
})
