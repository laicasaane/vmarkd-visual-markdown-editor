import { describe, expect, it } from 'vitest'
import { d2Theme, type Paint, renderD2Graph, type Sizer } from './d2-render'
import { makeSketch } from './d2-sketch'

// Deterministic label sizer (no Canvas), mirroring d2-render.test.ts.
const sizer: Sizer = (t, fs = 16) => {
  const lines = String(t).split('\n')
  return {
    w: Math.max(1, ...lines.map((l) => l.length * (fs / 2))),
    h: lines.length * fs * 1.25,
  }
}
const empty = () => ({ isSequence: false, isGrid: false })
const shape = (
  id: string,
  shp = 'rectangle',
  extra: Record<string, unknown> = {},
) => ({
  id,
  idVal: id,
  label: id,
  shape: shp,
  special: empty(),
  ...extra,
})
const g = (shapes: any[], edges: any[] = []) =>
  ({ shapes, edges, sequence: false }) as any
const mono: Paint = {
  fill: 'transparent',
  stroke: 'currentColor',
  strokeWidth: 2,
}

describe('d2-sketch — makeSketch primitives', () => {
  it('emits rough <path>s (not the crisp primitive) for every shape method', () => {
    const sk = makeSketch()
    for (const out of [
      sk.rect(0, 0, 100, 50, mono, 1),
      sk.ellipse(50, 25, 50, 25, mono, 2),
      sk.polygon(
        [
          [0, 0],
          [100, 0],
          [50, 50],
        ],
        mono,
        3,
      ),
      sk.path('M0,0 L100,0 L50,50 Z', mono, 4),
      sk.edge('M0,0 L100,100', mono, 5),
    ]) {
      expect(out).toContain('<path')
      expect(out).not.toContain('<rect')
      expect(out).not.toContain('<ellipse')
      expect(out).not.toContain('<polygon')
      // a rough path is a real path (≥ M + one draw command), never a crisp primitive
      expect((out.match(/[MLCQ]/g) || []).length).toBeGreaterThanOrEqual(2)
    }
    // a filled/closed shape genuinely WOBBLES → many bezier segments (not a 4-corner rectangle)
    const rect = sk.rect(0, 0, 100, 50, mono, 1)
    expect((rect.match(/[LC]/g) || []).length).toBeGreaterThan(6)
  })

  it('threads currentColor onto the outline stroke (mono follows the theme)', () => {
    const out = makeSketch().rect(0, 0, 80, 40, mono, 9)
    expect(out).toContain('stroke="currentColor"')
    expect(out).not.toContain('fill="currentColor"') // mono = no fill, just the wobbly outline
  })

  it('a hachure fill carries the FILL colour on its stroke lines + the outline the STROKE colour', () => {
    const filled: Paint = { fill: '#ff0000', stroke: '#0000ff', strokeWidth: 2 }
    const out = makeSketch().rect(0, 0, 120, 60, filled, 11)
    expect(out).toContain('stroke="#ff0000"') // hachure lines are drawn with the fill colour
    expect(out).toContain('stroke="#0000ff"') // outline
  })

  it('wraps a shape opacity in a <g opacity>', () => {
    const out = makeSketch().rect(0, 0, 50, 50, { ...mono, opacity: '0.5' }, 12)
    expect(out).toContain('<g opacity="0.5">')
  })

  it('an edge carries the extra presentation attrs (mask / dash / class) on each path', () => {
    const out = makeSketch().edge('M0,0 L50,50', mono, 13, ' mask="url(#m)"')
    expect(out).toContain('<path')
    expect(out).toContain('mask="url(#m)"')
    expect(out).toContain('fill="none"')
  })

  it('is DETERMINISTIC — a fixed seed yields byte-identical output across generators', () => {
    expect(makeSketch().rect(0, 0, 100, 50, mono, 42)).toBe(
      makeSketch().rect(0, 0, 100, 50, mono, 42),
    )
    expect(makeSketch().path('M0,0 C10,10 20,0 30,10 Z', mono, 7)).toBe(
      makeSketch().path('M0,0 C10,10 20,0 30,10 Z', mono, 7),
    )
    // a different seed reshuffles the wobble
    expect(makeSketch().rect(0, 0, 100, 50, mono, 1)).not.toBe(
      makeSketch().rect(0, 0, 100, 50, mono, 2),
    )
  })
})

describe('d2-sketch — toSVG integration', () => {
  it('sketch OFF keeps the crisp <rect>; sketch ON replaces it with wobbly <path>s', () => {
    const graph = g([shape('a')])
    const crisp = renderD2Graph(graph, sizer)
    const sketchy = renderD2Graph(graph, sizer, undefined, makeSketch())
    expect(crisp).toContain('<rect')
    expect(sketchy).not.toContain('<rect') // the lone leaf box is now a path
    expect(sketchy).toContain('<path')
  })

  it('sketchifies a bespoke path shape (cylinder) + the edge, not just basic boxes', () => {
    const graph = g(
      [shape('db', 'cylinder'), shape('svc', 'rectangle')],
      [{ src: 'svc', dst: 'db', srcArrow: false, dstArrow: true }],
    )
    const sketchy = renderD2Graph(graph, sizer, undefined, makeSketch())
    // cylinder + rect + edge all routed through rough → several wobbly paths, no crisp primitives
    expect((sketchy.match(/<path/g) || []).length).toBeGreaterThan(3)
    expect(sketchy).not.toContain('<rect')
    expect(sketchy).not.toContain('<ellipse')
  })

  it('the whole sketched diagram is deterministic (re-render is byte-identical)', () => {
    const graph = g(
      [shape('a'), shape('b', 'circle'), shape('c', 'diamond')],
      [{ src: 'a', dst: 'b', srcArrow: false, dstArrow: true }],
    )
    expect(renderD2Graph(graph, sizer, undefined, makeSketch())).toBe(
      renderD2Graph(graph, sizer, undefined, makeSketch()),
    )
  })

  it('sketch keeps the palette colours (drawing changes, colour does not)', () => {
    const graph = g([shape('a')])
    const style = d2Theme('d2-original') // leafFill #F7F8FE, leafStroke #0D32B2
    const sketchy = renderD2Graph(graph, sizer, style, makeSketch())
    expect(sketchy).toContain('#0D32B2') // outline stroke = palette line
    expect(sketchy).toContain('#F7F8FE') // hachure fill lines = palette leaf fill
  })

  it('every leaf shape kind routes through rough (no crisp primitive leaks)', () => {
    // one node per shape kind → exercises every sketch branch in toSVG (ellipse / polygon / path / rect
    // + the seed2 detail strokes on cylinder/queue/page).
    const kinds = [
      'rectangle',
      'square',
      'circle',
      'oval',
      'diamond',
      'hexagon',
      'cylinder',
      'queue',
      'cloud',
      'parallelogram',
      'document',
      'page',
      'stored_data',
      'package',
      'step',
      'callout',
      'person',
    ]
    const graph = g(kinds.map((k, i) => shape(`n${i}`, k)))
    const sketchy = renderD2Graph(graph, sizer, undefined, makeSketch())
    expect(sketchy).not.toContain('<rect')
    expect(sketchy).not.toContain('<ellipse')
    expect(sketchy).not.toContain('<polygon')
    expect((sketchy.match(/<path/g) || []).length).toBeGreaterThanOrEqual(
      kinds.length,
    )
  })

  it('text + sql_table stay crisp in v1 (not routed through rough)', () => {
    const graph = g([
      shape('t', 'text', { label: 'hello' }),
      shape('u', 'sql_table', {
        columns: [{ name: 'id', type: 'int', constraint: 'primary_key' }],
      }),
    ])
    const sketchy = renderD2Graph(graph, sizer, undefined, makeSketch())
    expect(sketchy).toContain('<text') // text shape label
    expect(sketchy).toContain('<rect') // sql_table panel stays a crisp rect (v1 scope)
  })
})
