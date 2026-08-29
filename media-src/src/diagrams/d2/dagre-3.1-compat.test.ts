import { describe, expect, it } from 'vitest'
import { layoutDagre, type Sizer } from './d2-layout'
import type { D2Graph } from './d2-wasm'

const measure: Sizer = (text, fontSize = 16) => ({
  w: Math.max(1, String(text).length * (fontSize / 2)),
  h: fontSize * 1.25,
})
const special = () => ({ isSequence: false, isGrid: false })
const shape = (id: string, container?: string) => ({
  id,
  idVal: id.split('.').at(-1) as string,
  label: id.split('.').at(-1) as string,
  shape: 'rectangle',
  container,
  special: special(),
})

const graph: D2Graph = {
  direction: 'right',
  sequence: false,
  shapes: [
    shape('left'),
    shape('left.alpha', 'left'),
    shape('left.beta', 'left'),
    shape('right'),
    shape('right.alpha', 'right'),
    shape('right.beta', 'right'),
  ],
  edges: [
    {
      src: 'left.alpha',
      dst: 'right',
      srcArrow: false,
      dstArrow: true,
    },
    {
      src: 'left.beta',
      dst: 'right.beta',
      srcArrow: false,
      dstArrow: true,
    },
  ],
} as D2Graph

describe('Dagre 3.1 compound-layout compatibility', () => {
  it('keeps finite compound geometry, container-bound edges, and stable sibling order', () => {
    const first = layoutDagre(graph, measure)
    const second = layoutDagre(graph, measure)

    for (const node of first.nodes) {
      expect([node.x, node.y, node.w, node.h].every(Number.isFinite)).toBe(true)
    }
    expect(second.nodes.map(({ s, x, y }) => ({ id: s.id, x, y }))).toEqual(
      first.nodes.map(({ s, x, y }) => ({ id: s.id, x, y })),
    )

    const siblingOrder = (container: string) =>
      first.nodes
        .filter((node) => node.s.container === container)
        .sort((a, b) => a.y - b.y)
        .map((node) => node.s.id)
    expect(siblingOrder('left')).toEqual(['left.alpha', 'left.beta'])
    expect(siblingOrder('right')).toEqual(['right.alpha', 'right.beta'])

    const right = first.nodes.find((node) => node.s.id === 'right')!
    const edgeToContainer = first.edges[0]
    const [endX, endY] = edgeToContainer.points.at(-1)!
    const onVerticalBoundary =
      (Math.abs(endX - right.x) <= 20 ||
        Math.abs(endX - (right.x + right.w)) <= 20) &&
      endY >= right.y - 20 &&
      endY <= right.y + right.h + 20
    const onHorizontalBoundary =
      (Math.abs(endY - right.y) <= 20 ||
        Math.abs(endY - (right.y + right.h)) <= 20) &&
      endX >= right.x - 20 &&
      endX <= right.x + right.w + 20
    expect(onVerticalBoundary || onHorizontalBoundary).toBe(true)
  })
})
