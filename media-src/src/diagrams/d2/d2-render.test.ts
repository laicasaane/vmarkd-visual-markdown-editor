import { describe, it, expect } from 'vitest'
import { simplifyRoute, straightenEnds } from './d2-geometry'
import {
  paletteStyle,
  renderD2Graph,
  textShapeBox,
  toSVG,
  unsupportedReason,
  type Sizer,
} from './d2-render'
import type { D2Graph } from './d2-wasm'

// deterministic label sizer for tests (no Canvas): ~8px/char, 20px tall line
const sizer: Sizer = (t, fs = 16) => {
  const lines = String(t).split('\n')
  return {
    w: Math.max(1, ...lines.map((l) => l.length * (fs / 2))),
    h: lines.length * fs * 1.25,
  }
}

const empty = () => ({ isSequence: false, isGrid: false })
const g = (shapes: any[], edges: any[] = [], sequence = false): D2Graph =>
  ({ shapes, edges, sequence }) as D2Graph

describe('d2-render', () => {
  it('renders a->b to an <svg> with 2 boxes + 1 path', () => {
    const graph = g(
      [
        {
          id: 'a',
          idVal: 'a',
          label: 'a',
          shape: 'rectangle',
          special: empty(),
        },
        {
          id: 'b',
          idVal: 'b',
          label: 'b',
          shape: 'rectangle',
          special: empty(),
        },
      ],
      [{ src: 'a', dst: 'b', srcArrow: false, dstArrow: true }],
    )
    const svg = renderD2Graph(graph, sizer)
    expect(svg).toContain('<svg')
    expect((svg.match(/<rect/g) || []).length).toBeGreaterThanOrEqual(2)
    expect(svg).toContain('<path')
    // currentColor theming (not baked black/white)
    expect(svg).toContain('stroke="currentColor"')
    expect(svg).not.toContain('fill="#ffffff"')
  })

  it('nests a container as a compound node (child carries container)', () => {
    const graph = g([
      {
        id: 'box',
        idVal: 'box',
        label: 'box',
        shape: 'rectangle',
        special: empty(),
      },
      {
        id: 'box.a',
        idVal: 'a',
        label: 'a',
        shape: 'rectangle',
        container: 'box',
        special: empty(),
      },
    ])
    const svg = renderD2Graph(graph, sizer)
    expect(svg).toContain('<svg')
    expect((svg.match(/<rect/g) || []).length).toBeGreaterThanOrEqual(2)
  })

  it('renders a circle as an <ellipse>', () => {
    const svg = renderD2Graph(
      g([
        { id: 'c', idVal: 'c', label: 'c', shape: 'circle', special: empty() },
      ]),
      sizer,
    )
    expect(svg).toContain('<ellipse')
  })

  it('renders a person as a silhouette path (not a plain rect)', () => {
    // d2 v0.7.1 lib/shape person = one head+shoulders outline path with the label below; NOT a rect,
    // and no longer the old crude head-circle + dome.
    const svg = renderD2Graph(
      g([
        { id: 'u', idVal: 'u', label: 'u', shape: 'person', special: empty() },
      ]),
      sizer,
    )
    expect(svg).toContain('<path')
    expect(svg).not.toContain('<rect')
  })

  it('renders a cloud as a path (not a plain rect)', () => {
    const svg = renderD2Graph(
      g([
        { id: 'c', idVal: 'c', label: 'c', shape: 'cloud', special: empty() },
      ]),
      sizer,
    )
    expect(svg).toContain('<path')
    expect(svg).not.toContain('<rect')
  })

  it('renders a queue as a horizontal-cylinder path (not a plain rect)', () => {
    const svg = renderD2Graph(
      g([
        { id: 'q', idVal: 'q', label: 'q', shape: 'queue', special: empty() },
      ]),
      sizer,
    )
    expect(svg).toContain('<path')
    expect(svg).not.toContain('<rect')
  })

  it('applies explicit fill + stroke + stroke-width + opacity (B styles)', () => {
    const svg = renderD2Graph(
      g([
        {
          id: 'x',
          idVal: 'x',
          label: 'x',
          shape: 'rectangle',
          fill: '#ff0000',
          stroke: '#0000ff',
          strokeWidth: '4',
          opacity: '0.5',
          special: empty(),
        },
      ]),
      sizer,
    )
    expect(svg).toContain('fill="#ff0000"')
    expect(svg).toContain('stroke="#0000ff"')
    expect(svg).toContain('stroke-width="4"')
    expect(svg).toContain('opacity="0.5"')
  })

  it('renders a sql_table with header + column rows + constraint abbr (C)', () => {
    const svg = renderD2Graph(
      g([
        {
          id: 't',
          idVal: 't',
          label: 'users',
          shape: 'sql_table',
          columns: [
            { name: 'id', type: 'int', constraint: 'primary_key' },
            { name: 'email', type: 'varchar' },
          ],
          special: empty(),
        },
      ]),
      sizer,
    )
    expect(svg).toContain('users')
    expect(svg).toContain('id')
    expect(svg).toContain('email')
    expect(svg).toContain('PK')
  })

  it('renders a class with fields + methods + visibility tokens (C)', () => {
    const svg = renderD2Graph(
      g([
        {
          id: 'c',
          idVal: 'c',
          label: 'Animal',
          shape: 'class',
          fields: [{ name: 'name', type: 'string', visibility: 'public' }],
          methods: [{ name: 'speak()', type: 'void', visibility: 'private' }],
          special: empty(),
        },
      ]),
      sizer,
    )
    expect(svg).toContain('Animal')
    expect(svg).toContain('name')
    expect(svg).toContain('speak()')
    expect(svg).toContain('-') // private visibility token
  })

  // Characterization (task 502): pins the exact sql_table/class chrome (body rect + header rect +
  // header title text) both in mono (default, no palette) and in a themed palette (fill-opacity drops,
  // fixed tokens replace currentColor) — BEFORE extracting the header-drawing code the two functions
  // share (task 381 comment already documents the token mapping is intentional; the SVG emission
  // wasn't factored out).
  describe('sql_table / class shared header chrome (task 502 characterization)', () => {
    const table = (extra: Record<string, unknown> = {}) =>
      g([
        {
          id: 't',
          idVal: 't',
          label: 'users',
          shape: 'sql_table',
          columns: [{ name: 'id', type: 'int', constraint: 'primary_key' }],
          special: empty(),
          ...extra,
        },
      ])
    const klass = (extra: Record<string, unknown> = {}) =>
      g([
        {
          id: 'c',
          idVal: 'c',
          label: 'Animal',
          shape: 'class',
          fields: [{ name: 'name', type: 'string', visibility: 'public' }],
          special: empty(),
          ...extra,
        },
      ])
    // Only the sql_table/class chrome rects carry rx="4" — filters out the unrelated page-bg <rect>.
    const rects = (svg: string) =>
      [...svg.matchAll(/<rect[^>]*rx="4"[^>]*\/>/g)].map((m) => m[0])
    const headerTexts = (svg: string) =>
      [...svg.matchAll(/<text[^>]*font-weight="700"[^>]*>.*?<\/text>/g)].map(
        (m) => m[0],
      )

    it('sql_table mono: body rect transparent/currentColor, header rect currentColor WITH fill-opacity (the subtle-tint fallback), header text currentColor', () => {
      const svg = renderD2Graph(table(), sizer)
      const [body, header] = rects(svg)
      expect(body).toContain('fill="transparent"')
      expect(body).toContain('stroke="currentColor"')
      expect(header).toContain('fill="currentColor"')
      expect(header).toContain('fill-opacity="0.12"')
      expect(headerTexts(svg)[0]).toContain('fill="currentColor"')
    })

    it('sql_table themed: body/header/text pick the palette tokens, header rect carries NO fill-opacity (solid header)', () => {
      const sty = paletteStyle({
        bg: '#101010',
        fg: '#f0f0f0',
        line: '#48a0c7',
      })
      const svg = renderD2Graph(table(), sizer, sty)
      const [body, header] = rects(svg)
      expect(body).toContain(`fill="${sty.paper}"`)
      expect(body).toContain(`stroke="${sty.tableBorder}"`)
      expect(header).toContain(`fill="${sty.tableHeaderFill}"`)
      expect(header).not.toContain('fill-opacity')
      expect(headerTexts(svg)[0]).toContain(`fill="${sty.tableHeaderText}"`)
    })

    it('sql_table: explicit s.stroke/s.fill/s.fontColor override the chrome tokens', () => {
      const svg = renderD2Graph(
        table({ stroke: '#111111', fill: '#222222', fontColor: '#333333' }),
        sizer,
      )
      const [body] = rects(svg)
      expect(body).toContain('fill="#222222"')
      expect(body).toContain('stroke="#111111"')
      expect(headerTexts(svg)[0]).toContain('fill="#333333"')
    })

    it('class mono/themed chrome matches the sql_table chrome shape (same shared header)', () => {
      const sty = paletteStyle({
        bg: '#101010',
        fg: '#f0f0f0',
        line: '#48a0c7',
      })
      const svgMono = renderD2Graph(klass(), sizer)
      const svgThemed = renderD2Graph(klass(), sizer, sty)
      const [bodyMono, headerMono] = rects(svgMono)
      expect(bodyMono).toContain('fill="transparent"')
      expect(headerMono).toContain('fill-opacity="0.12"')
      const [bodyThemed, headerThemed] = rects(svgThemed)
      expect(bodyThemed).toContain(`fill="${sty.paper}"`)
      expect(headerThemed).not.toContain('fill-opacity')
      expect(headerTexts(svgThemed)[0]).toContain(
        `fill="${sty.tableHeaderText}"`,
      )
    })

    it('a multi-line label grows the header band height (hh) identically for sql_table and class', () => {
      const svgTable = renderD2Graph(table({ label: 'users\nextra' }), sizer)
      const svgClass = renderD2Graph(klass({ label: 'Animal\nextra' }), sizer)
      const hhOf = (svg: string) => {
        const [, header] = rects(svg)
        return Number(/height="([\d.]+)"/.exec(header)![1])
      }
      const svgTableFlat = renderD2Graph(table(), sizer)
      const svgClassFlat = renderD2Graph(klass(), sizer)
      expect(hhOf(svgTable)).toBeGreaterThan(hhOf(svgTableFlat))
      expect(hhOf(svgClass)).toBeGreaterThan(hhOf(svgClassFlat))
    })
  })

  it('lays grid-container children out in a grid (C)', () => {
    const svg = renderD2Graph(
      g([
        {
          id: 'grid',
          idVal: 'grid',
          label: 'grid',
          shape: 'rectangle',
          special: { isSequence: false, isGrid: true, gridColumns: '2' },
        },
        {
          id: 'grid.a',
          idVal: 'a',
          label: 'a',
          shape: 'rectangle',
          container: 'grid',
          special: empty(),
        },
        {
          id: 'grid.b',
          idVal: 'b',
          label: 'b',
          shape: 'rectangle',
          container: 'grid',
          special: empty(),
        },
        {
          id: 'grid.c',
          idVal: 'c',
          label: 'c',
          shape: 'rectangle',
          container: 'grid',
          special: empty(),
        },
      ]),
      sizer,
    )
    expect(svg).toContain('<svg')
    // container + 3 children rects
    expect((svg.match(/<rect/g) || []).length).toBeGreaterThanOrEqual(4)
  })
})

describe('unsupportedReason (faithful-by-construction guard)', () => {
  it('returns null for a plain graph', () => {
    expect(
      unsupportedReason(
        g([
          {
            id: 'a',
            idVal: 'a',
            label: 'a',
            shape: 'rectangle',
            special: empty(),
          },
        ]),
      ),
    ).toBeNull()
  })

  it('detects a top-level sequence_diagram (graph.sequence flag — root is not in shapes)', () => {
    const graph = g(
      [
        {
          id: 'alice',
          idVal: 'alice',
          label: 'alice',
          shape: 'rectangle',
          special: empty(),
        },
        {
          id: 'bob',
          idVal: 'bob',
          label: 'bob',
          shape: 'rectangle',
          special: empty(),
        },
      ],
      [{ src: 'alice', dst: 'bob', srcArrow: false, dstArrow: true }],
      true, // sequence
    )
    expect(unsupportedReason(graph)).toMatch(/sequence_diagram/)
  })

  it('detects a per-shape sequence diagram', () => {
    expect(
      unsupportedReason(
        g([
          {
            id: 's',
            idVal: 's',
            label: 's',
            shape: 'rectangle',
            special: { isSequence: true, isGrid: false },
          },
        ]),
      ),
    ).toMatch(/sequence_diagram/)
  })

  it('now SUPPORTS grid / sql_table / class (rendered, not fallback)', () => {
    expect(
      unsupportedReason(
        g([
          {
            id: 'gr',
            idVal: 'gr',
            label: 'gr',
            shape: 'rectangle',
            special: { isSequence: false, isGrid: true, gridRows: '2' },
          },
        ]),
      ),
    ).toBeNull()
    expect(
      unsupportedReason(
        g([
          {
            id: 't',
            idVal: 't',
            label: 't',
            shape: 'sql_table',
            special: empty(),
          },
        ]),
      ),
    ).toBeNull()
    expect(
      unsupportedReason(
        g([
          { id: 'k', idVal: 'k', label: 'k', shape: 'class', special: empty() },
        ]),
      ),
    ).toBeNull()
  })

  it('supports viewport-constant near, flags only relative near (task 126A)', () => {
    // A viewport constant (top-center, …) is now placed by toSVG → no longer unsupported.
    expect(
      unsupportedReason(
        g([
          {
            id: 'n',
            idVal: 'n',
            label: 'n',
            shape: 'rectangle',
            special: {
              isSequence: false,
              isGrid: false,
              nearKey: 'top-center',
            },
          },
        ]),
      ),
    ).toBeNull()
    // The relative form (near: <shape-id>) is still Phase B → falls back to raw source.
    expect(
      unsupportedReason(
        g([
          {
            id: 'n',
            idVal: 'n',
            label: 'n',
            shape: 'rectangle',
            special: { isSequence: false, isGrid: false, nearKey: 'someShape' },
          },
        ]),
      ),
    ).toMatch(/near/)
  })
})

describe('toSVG connection rendering (task 122 — rounded corners + endpoint trim)', () => {
  const mk = (points: number[][], dstArrow = true) =>
    ({
      W: 200,
      H: 200,
      nodes: [],
      edges: [{ points, srcArrow: false, dstArrow }],
      edgeStyle: 'orthogonal',
    }) as any

  it('rounds an orthogonal bend with a quadratic corner', () => {
    const svg = toSVG(
      mk([
        [0, 0],
        [0, 60],
        [60, 60],
      ]),
    )
    expect(svg).toContain('Q') // bend → rounded corner, not a hard L join
  })

  it('keeps a straight 2-point edge as a plain line (no corner)', () => {
    const svg = toSVG(
      mk([
        [0, 0],
        [80, 0],
      ]),
    )
    expect(svg).not.toContain('Q')
  })

  it('trims the line end back from the arrowhead endpoint', () => {
    // endpoint (60,60)+OFF(10) = 70,70; the stroke must stop SHORT of it (arrow stays at 70,70).
    const svg = toSVG(
      mk([
        [0, 0],
        [0, 60],
        [60, 60],
      ]),
    )
    const pathD = svg.match(/<path d="([^"]+)" fill="none"/)?.[1] ?? ''
    expect(pathD).not.toContain('70.0,70.0') // line was retracted; not drawn to the raw endpoint
    expect(svg).toContain('<polygon') // arrowhead still drawn (at the endpoint)
  })

  it('masks the connection line out from under an on-line label', () => {
    const svg = toSVG({
      W: 200,
      H: 200,
      nodes: [],
      edges: [
        {
          points: [
            [0, 0],
            [0, 100],
          ],
          srcArrow: false,
          dstArrow: true,
          label: 'lbl',
          lx: 0,
          ly: 50,
          lw: 30,
          lh: 16,
        },
      ],
      edgeStyle: 'orthogonal',
    } as any)
    expect(svg).toContain('<mask') // a label mask was emitted
    // the connection path references it (so the line is cut under the centred label)
    expect(svg).toMatch(
      /<path d="[^"]+" fill="none"[^>]*mask="url\(#vmarkd-d2lbl-/,
    )
  })
})

describe('arrowhead shapes (task 128)', () => {
  const edge = (head: any, dstArrow = true) =>
    ({
      W: 200,
      H: 200,
      nodes: [],
      edges: [
        {
          points: [
            [0, 0],
            [100, 0],
          ],
          srcArrow: false,
          dstArrow,
          dstArrowhead: head,
        },
      ],
      edgeStyle: 'orthogonal',
    }) as any

  it('default (no arrowhead object) draws a filled triangle polygon', () => {
    const svg = toSVG(edge(undefined))
    expect(svg).toContain('<polygon')
    expect(svg).toContain('fill="currentColor"')
  })

  it('circle arrowhead draws a <circle> glyph', () => {
    const svg = toSVG(edge({ shape: 'circle' }))
    expect(svg).toContain('<circle')
  })

  it("crow's-foot (cf-many) draws fan <line> strokes, not a triangle", () => {
    const svg = toSVG(edge({ shape: 'cf-many' }))
    expect((svg.match(/<line /g) || []).length).toBeGreaterThanOrEqual(3)
  })

  it('shape: none draws no arrowhead glyph', () => {
    // dstArrow true but arrowhead explicitly none → nothing drawn at the end
    const svg = toSVG(edge({ shape: 'none' }))
    expect(svg).not.toContain('<polygon')
    expect(svg).not.toContain('<circle')
  })

  it('renders the arrowhead cardinality label beside the endpoint', () => {
    const svg = toSVG(edge({ shape: 'cf-many', label: '*' }))
    expect(svg).toContain('>*<')
  })
})

describe('sql_table column FK routing (task 133)', () => {
  // Two side-by-side sql tables; an edge from users.col0 → orders.col1. toSVG must attach the route
  // to the COLUMN ROWS (header + index·rowH + rowH/2), not the table-box centre.
  const sqlNode = (id: string, x: number, cols: string[]) =>
    ({
      s: {
        id,
        idVal: id,
        label: id,
        shape: 'sql_table',
        columns: cols.map((name) => ({ name, type: 'int' })),
        special: { isSequence: false, isGrid: false },
      },
      x,
      y: 0,
      w: 150,
      h: 32 + cols.length * 26,
      kind: 'sql',
      sqlCols: [40, 40, 20],
    }) as any

  const layout = {
    W: 500,
    H: 200,
    nodes: [
      sqlNode('users', 0, ['id', 'name']),
      sqlNode('orders', 300, ['id', 'user_id']),
    ],
    edges: [
      {
        points: [
          [75, 50],
          [375, 50],
        ],
        srcArrow: false,
        dstArrow: true,
        src: 'users',
        dst: 'orders',
        srcColumnIndex: 0,
        dstColumnIndex: 1,
      },
    ],
    edgeStyle: 'orthogonal',
  } as any

  it('routes the FK edge to the destination column row Y (not the box centre)', () => {
    const svg = toSVG(layout)
    const pathD = svg.match(/<path d="([^"]+)" fill="none"/)?.[1] ?? ''
    // orders col1 row centre = y(0)+OFF(10) + HEADER_H(32) + 1*ROW_H(26) + ROW_H/2(13) = 81
    expect(pathD).toContain(',81.0')
    // users col0 row centre = 10 + 32 + 0 + 13 = 55
    expect(pathD).toContain(',55.0')
    // NOT the table-box centre (y = 10 + h/2 = 52 for users / 53 for orders)
    expect(pathD).not.toContain(',52.0')
  })
})

describe('near viewport-constant placement (task 126A)', () => {
  const base = (nearKey: string) =>
    ({
      shapes: [
        {
          id: 'a',
          idVal: 'a',
          label: 'a',
          shape: 'rectangle',
          special: empty(),
        },
        {
          id: 'b',
          idVal: 'b',
          label: 'b',
          shape: 'rectangle',
          special: empty(),
        },
        {
          id: 'title',
          idVal: 'title',
          label: 'Title',
          shape: 'rectangle',
          special: { isSequence: false, isGrid: false, nearKey },
        },
      ],
      edges: [{ src: 'a', dst: 'b', srcArrow: false, dstArrow: true }],
      sequence: false,
    }) as D2Graph

  it('renders the diagram WITH the pinned shape (no unsupported fallback)', () => {
    const svg = renderD2Graph(base('top-center'), sizer)
    expect(svg).toContain('<svg')
    expect(svg).toContain('Title') // the pinned shape is drawn
    expect(svg).toContain('<path') // the a→b edge still drawn
  })

  it('pins a top-center shape ABOVE the laid-out graph', () => {
    // The title must sit at a smaller y than both laid-out nodes (it is excluded from layout and
    // placed above the content bbox).
    const svg = renderD2Graph(base('top-center'), sizer)
    const titleY = Number(
      svg.match(/<text x="-?[\d.]+" y="(-?[\d.]+)"[^>]*>Title</)?.[1] ?? 'NaN',
    )
    const otherYs = [
      ...svg.matchAll(/<text x="-?[\d.]+" y="(-?[\d.]+)"[^>]*>[ab]</g),
    ].map((m) => Number(m[1]))
    expect(Number.isFinite(titleY)).toBe(true)
    expect(otherYs.length).toBeGreaterThan(0)
    expect(titleY).toBeLessThan(Math.min(...otherYs))
  })
})

describe('layout direction (task 127)', () => {
  const chain = (direction?: string) =>
    ({
      shapes: [
        {
          id: 'a',
          idVal: 'a',
          label: 'a',
          shape: 'rectangle',
          special: empty(),
        },
        {
          id: 'b',
          idVal: 'b',
          label: 'b',
          shape: 'rectangle',
          special: empty(),
        },
      ],
      edges: [{ src: 'a', dst: 'b', srcArrow: false, dstArrow: true }],
      sequence: false,
      direction,
    }) as D2Graph

  // dagre path is synchronous + deterministic → assert the relative node geometry flips with direction.
  const centre = (svg: string, id: string) => {
    const m = svg.match(
      new RegExp(`<text x="(-?[\\d.]+)" y="(-?[\\d.]+)"[^>]*>${id}<`),
    )
    return m ? { x: Number(m[1]), y: Number(m[2]) } : null
  }

  it('down (default) stacks a above b vertically', () => {
    const svg = renderD2Graph(chain('down'), sizer)
    const a = centre(svg, 'a')!
    const b = centre(svg, 'b')!
    expect(a.y).toBeLessThan(b.y)
  })

  it('right lays a left of b horizontally (rankdir LR)', () => {
    const svg = renderD2Graph(chain('right'), sizer)
    const a = centre(svg, 'a')!
    const b = centre(svg, 'b')!
    expect(a.x).toBeLessThan(b.x)
    expect(Math.abs(a.y - b.y)).toBeLessThan(10) // same row
  })

  it('up flips the vertical order (a below b, rankdir BT)', () => {
    const svg = renderD2Graph(chain('up'), sizer)
    const a = centre(svg, 'a')!
    const b = centre(svg, 'b')!
    expect(a.y).toBeGreaterThan(b.y)
  })
})

describe('simplifyRoute (task 122 — D2 deleteBends-style straightening)', () => {
  // a staircase: H, V, H, V, H — many interior bends
  const staircase = () => [
    [0, 0],
    [0, 10],
    [20, 10],
    [20, 20],
    [40, 20],
    [40, 30],
  ]

  it('straightens an interior staircase into fewer bends when the space is clear', () => {
    const out = simplifyRoute(staircase(), [])
    expect(out.length).toBeLessThan(staircase().length)
    expect(out[0]).toEqual([0, 0]) // endpoints preserved
    expect(out[out.length - 1]).toEqual([40, 30])
  })

  it('keeps the staircase when an obstacle blocks every straightened L', () => {
    const blocked = simplifyRoute(staircase(), [{ x: 5, y: 5, w: 40, h: 30 }])
    expect(blocked.length).toBe(staircase().length) // nothing removed — guard refused
  })

  it('drops collinear points', () => {
    const out = simplifyRoute(
      [
        [0, 0],
        [0, 10],
        [0, 20],
      ],
      [],
    )
    expect(out).toEqual([
      [0, 0],
      [0, 20],
    ])
  })

  // task 122: ELK routes a labelled edge through a side channel so its inline label clears a parallel
  // edge; an anchor on that channel must stop the straightener from pulling the line back off the label.
  it('keeps a label-bearing channel when an anchor sits on it', () => {
    // mostly-vertical (x=0) with a sideways excursion to x=40 in the middle (the label channel)
    const jog = (): number[][] => [
      [0, 0],
      [0, 40],
      [40, 40],
      [40, 60],
      [0, 60],
      [0, 100],
    ]
    // no anchor → the excursion straightens away to the bare vertical
    expect(simplifyRoute(jog(), []).length).toBeLessThan(6)
    // anchor on the channel → it (and the label's spot) is preserved
    const kept = simplifyRoute(jog(), [], [40, 50])
    expect(kept.length).toBe(6)
    expect(kept).toContainEqual([40, 40])
  })
})

describe('straightenEnds (task 122 — D2 deleteBends source/target S-shape removal)', () => {
  const box = { x: 0, y: 0, w: 40, h: 20 }

  it('straightens an endpoint port-attach S-jog when it stays on the border', () => {
    // attach at (10,20) on the box bottom, steps to channel x=25, then down — a tiny S near the box
    const sJog = [
      [10, 20],
      [10, 40],
      [25, 40],
      [25, 100],
    ]
    const out = straightenEnds(sJog, [box])
    // collapses to a straight vertical at x=25; attach point rides along the border to x=25
    expect(out).toEqual([
      [25, 20],
      [25, 100],
    ])
  })

  it('keeps the S-jog if straightening would slide the attach off the border', () => {
    // c.x=38 is past the box.x+w-10 margin → moving the attach there would detach → left alone
    const sJog = [
      [10, 20],
      [10, 40],
      [38, 40],
      [38, 100],
    ]
    expect(straightenEnds(sJog, [box]).length).toBe(4)
  })

  it('refuses to straighten through another box', () => {
    // blocker lies on the NEW segment (x=25, y≈25-35) that replaces the S, but not on the old S path
    const blocker = { x: 22, y: 25, w: 8, h: 10 }
    const sJog = [
      [10, 20],
      [10, 40],
      [25, 40],
      [25, 100],
    ]
    expect(straightenEnds(sJog, [box, blocker]).length).toBe(4)
  })

  it('keeps a large step (a real routing jog, not a pixel kink) even within the border', () => {
    // wide box: c.x=70 is well inside the border, but the 60px step is a genuine routing move — D2's
    // route-into-orders case. Collapsing it would re-attach near the corner instead of where ELK entered.
    const wide = { x: 0, y: 0, w: 100, h: 20 }
    const sJog = [
      [10, 20],
      [10, 40],
      [70, 40],
      [70, 100],
    ]
    expect(straightenEnds(sJog, [wide]).length).toBe(4)
  })
})

describe('|md| markdown labels via foreignObject (task 154)', () => {
  const mdNode = (extra: Record<string, unknown> = {}) =>
    g([
      {
        id: 'n',
        idVal: 'n',
        label: '# H\n- **b** p',
        shape: 'text',
        language: 'markdown',
        mdHtml: '<h1>H</h1><ul><li><strong>b</strong> p</li></ul>',
        mdSize: { w: 120, h: 64 },
        special: empty(),
        ...extra,
      },
    ])

  it('renders the enriched md shape as a <foreignObject> with the Lute HTML, not flat text', () => {
    const svg = renderD2Graph(mdNode(), sizer)
    expect(svg).toContain('<foreignObject')
    expect(svg).toContain('class="vmarkd-d2-md"')
    // The HTML is embedded RAW (trusted Lute output) — formatted, not escaped.
    expect(svg).toContain('<h1>H</h1>')
    expect(svg).toContain('<strong>b</strong>')
    expect(svg).not.toContain('<tspan')
    // The inner div is pinned to the measured content width so wrapping matches the measure pass.
    expect(svg).toContain('width:120px')
  })

  it('sizes the node from mdSize (+TEXT_PAD), not from the raw md lines', () => {
    const small = renderD2Graph(mdNode(), sizer)
    const large = renderD2Graph(mdNode({ mdSize: { w: 300, h: 200 } }), sizer)
    const fo = (svg: string) =>
      /<foreignObject[^>]*width="([\d.]+)" height="([\d.]+)"/.exec(svg)!
    // TEXT_PAD=4 on each side → measured content box + 8.
    expect(Number(fo(small)[1])).toBe(128)
    expect(Number(fo(small)[2])).toBe(72)
    expect(Number(fo(large)[1])).toBe(308)
    expect(Number(fo(large)[2])).toBe(208)
  })

  it('an UNenriched md shape (Lute unavailable) falls back to the plain-text render', () => {
    const svg = renderD2Graph(
      mdNode({ mdHtml: undefined, mdSize: undefined }),
      sizer,
    )
    expect(svg).not.toContain('<foreignObject')
    expect(svg).toContain('<tspan') // pre-154 behaviour: raw md lines as prose
  })

  it('a STYLED md shape gets the explicit-style box behind the foreignObject', () => {
    const svg = renderD2Graph(mdNode({ fill: '#abcdef' }), sizer)
    expect((svg.match(/<rect/g) || []).length).toBe(1)
    expect(svg).toContain('fill="#abcdef"')
    expect(svg).toContain('<foreignObject')
  })

  it('md shapes are not flagged unsupported', () => {
    expect(unsupportedReason(mdNode())).toBeNull()
  })

  // Characterization (task 502): pins the exact explicit-style-box <rect> markup for the |md| branch —
  // borderRadius-only (no fill/stroke → fill defaults to "transparent", no stroke attr) and opacity —
  // BEFORE extracting the box-drawing code shared with shape:text/code below, so the extraction can't
  // silently change an attribute this test doesn't already pin down.
  it('a borderRadius-only md shape gets a transparent, strokeless, borderRadius-rx box', () => {
    const svg = renderD2Graph(mdNode({ borderRadius: 12 }), sizer)
    const rect = /<rect[^>]*\/>/.exec(svg)![0]
    expect(rect).toContain('rx="12"')
    expect(rect).toContain('fill="transparent"')
    expect(rect).not.toContain('stroke=')
    expect(rect).not.toContain('opacity=')
  })
  it('an opaque-styled md shape carries an explicit opacity attribute on the box', () => {
    const svg = renderD2Graph(mdNode({ fill: '#abcdef', opacity: 0.5 }), sizer)
    const rect = /<rect[^>]*\/>/.exec(svg)![0]
    expect(rect).toContain('opacity="0.5"')
  })
})

describe('shape: text / code (task 124 #2)', () => {
  const node = (shape: string, label: string) =>
    g([{ id: 'n', idVal: 'n', label, shape, special: empty() }])

  it('renders shape:text as borderless prose (no box rect)', () => {
    const svg = renderD2Graph(node('text', 'hello world'), sizer)
    expect(svg).toContain('<text')
    expect(svg).toContain('<tspan')
    expect(svg).toContain('hello world')
    // borderless: a lone text shape draws no <rect>
    expect(svg.match(/<rect/g)).toBeNull()
  })

  it('renders a STYLED text shape with a box (real-d2 parity, not borderless)', () => {
    // d2 assigns shape:text to |md|/text labels with no explicit shape; a bare one is borderless,
    // but an explicit fill/stroke means the user wants a box (real d2 paints one). Regression: md-label
    // nodes with a class fill rendered as text only → invisible on a dark theme.
    const styled = g([
      {
        id: 'n',
        idVal: 'n',
        label: 'x',
        shape: 'text',
        fill: '#abcdef',
        stroke: '#123456',
        special: empty(),
      },
    ])
    const svg = renderD2Graph(styled, sizer)
    expect((svg.match(/<rect/g) || []).length).toBe(1) // a box behind the text
    expect(svg).toContain('fill="#abcdef"')
    expect(svg).toContain('stroke="#123456"')
    expect(svg).toContain('<tspan') // …text still drawn on top
  })

  // Characterization (task 502): mirrors the md-branch pair above for the shape:text explicit-style-box
  // — same borderRadius-only and opacity cases — pinned BEFORE extracting the shared box-drawing helper.
  it('a borderRadius-only text shape gets a transparent, strokeless, borderRadius-rx box', () => {
    const styled = g([
      {
        id: 'n',
        idVal: 'n',
        label: 'x',
        shape: 'text',
        borderRadius: 12,
        special: empty(),
      },
    ])
    const svg = renderD2Graph(styled, sizer)
    const rect = /<rect[^>]*\/>/.exec(svg)![0]
    expect(rect).toContain('rx="12"')
    expect(rect).toContain('fill="transparent"')
    expect(rect).not.toContain('stroke=')
    expect(rect).not.toContain('opacity=')
  })
  it('an opaque-styled text shape carries an explicit opacity attribute on the box', () => {
    const styled = g([
      {
        id: 'n',
        idVal: 'n',
        label: 'x',
        shape: 'text',
        fill: '#abcdef',
        opacity: 0.5,
        special: empty(),
      },
    ])
    const svg = renderD2Graph(styled, sizer)
    const rect = /<rect[^>]*\/>/.exec(svg)![0]
    expect(rect).toContain('opacity="0.5"')
  })

  it('renders shape:code as a monospace panel (one rect + mono font)', () => {
    const svg = renderD2Graph(node('code', 'const x = 1'), sizer)
    expect((svg.match(/<rect/g) || []).length).toBe(1) // the panel
    expect(svg).toContain('font-family="ui-monospace')
    expect(svg).toContain('const x = 1')
  })

  it('splits a multi-line label into one <tspan> per line', () => {
    const svg = renderD2Graph(node('code', 'line1\nline2\nline3'), sizer)
    expect((svg.match(/<tspan/g) || []).length).toBe(3)
    expect(svg).toContain('line1')
    expect(svg).toContain('line3')
  })

  it('text/code are not flagged unsupported', () => {
    expect(unsupportedReason(node('text', 'a'))).toBeNull()
    expect(unsupportedReason(node('code', 'a'))).toBeNull()
  })

  it('textShapeBox grows the box with line count', () => {
    const one = textShapeBox('code', 'x', sizer)
    const three = textShapeBox('code', 'x\nx\nx', sizer)
    expect(three.h).toBeGreaterThan(one.h)
  })

  it('textShapeBox code width scales with the longest line (monospace estimate)', () => {
    const short = textShapeBox('code', 'x', sizer)
    const long = textShapeBox('code', 'x'.repeat(40), sizer)
    expect(long.w).toBeGreaterThan(short.w)
  })
})

describe('connection styles (task 124 #1)', () => {
  const styledEdge = (style: any, dstArrow = true) =>
    ({
      W: 200,
      H: 200,
      nodes: [],
      edges: [
        {
          points: [
            [0, 0],
            [100, 0],
          ],
          srcArrow: false,
          dstArrow,
          style,
        },
      ],
      edgeStyle: 'orthogonal',
    }) as any

  it('applies stroke / width / dash from the edge style', () => {
    const svg = toSVG(
      styledEdge({ stroke: 'red', strokeWidth: '4', strokeDash: '3' }),
    )
    expect(svg).toContain('stroke="red"')
    expect(svg).toContain('stroke-width="4"')
    expect(svg).toContain('stroke-dasharray="3,3"')
  })

  it('keeps the theme default when the edge sets no style', () => {
    const svg = toSVG(styledEdge(undefined))
    expect(svg).toContain('stroke="currentColor"')
    expect(svg).toContain('stroke-width="2"')
    expect(svg).not.toContain('d2-anim')
    expect(svg).not.toContain('@keyframes')
  })

  it('applies opacity', () => {
    expect(toSVG(styledEdge({ opacity: '0.5' }))).toContain('opacity="0.5"')
  })

  it('animated edge marches dashes via a reduced-motion-safe CSS class', () => {
    const svg = toSVG(styledEdge({ animated: true }))
    expect(svg).toContain('class="d2-anim"')
    expect(svg).toContain('@keyframes d2dash')
    expect(svg).toContain('prefers-reduced-motion')
    // a march needs a dash pattern even when the source set none
    expect(svg).toContain('stroke-dasharray="8,4"')
  })

  it('the arrowhead follows the edge stroke colour', () => {
    const svg = toSVG(styledEdge({ stroke: 'red' }))
    expect(svg).toContain('<polygon') // default dst arrowhead = filled triangle
    expect(svg).toContain('fill="red"')
  })
})

describe('shape tooltip / link / icon / image (task 124 #3 + #5)', () => {
  const node = (extra: any) =>
    g([
      {
        id: 'n',
        idVal: 'n',
        label: 'n',
        shape: 'rectangle',
        special: empty(),
        ...extra,
      },
    ])

  it('renders a <title> tooltip', () => {
    expect(renderD2Graph(node({ tooltip: 'hello tip' }), sizer)).toContain(
      '<title>hello tip</title>',
    )
  })

  it('wraps a node in <a href> for a safe link', () => {
    expect(
      renderD2Graph(node({ link: 'https://example.com' }), sizer),
    ).toContain('<a href="https://example.com">')
  })

  it('does NOT make a node clickable for a javascript: link (sanitized)', () => {
    const svg = renderD2Graph(node({ link: 'javascript:alert(1)' }), sizer)
    expect(svg).not.toContain('<a ')
    expect(svg).not.toContain('javascript:')
  })

  it('renders shape:image as a full <image> (no box rect)', () => {
    const svg = renderD2Graph(
      node({ shape: 'image', icon: 'data:image/png;base64,AAAA' }),
      sizer,
    )
    expect(svg).toContain('<image')
    expect(svg).toContain('data:image/png;base64,AAAA')
    expect(svg.match(/<rect/g)).toBeNull()
  })

  it('renders a decorative icon on top of a non-image shape', () => {
    const svg = renderD2Graph(
      node({ icon: 'data:image/png;base64,BBBB' }),
      sizer,
    )
    expect(svg).toContain('data:image/png;base64,BBBB')
    expect(svg).toContain('<rect') // the shape itself still drew; icon is decorative
  })
})

// The connection line used to run straight THROUGH an edge label — the label had no background at
// all, so on any diagram where a route passes under its own (or another) label the text was visibly
// cut in half. d2's own renderer draws a background rect; we paint the glyph outline in the canvas
// colour under the fill, which needs no box geometry and follows descenders.
describe('edge label halo', () => {
  const labelSvg = () => {
    const graph = g(
      [
        {
          id: 'a',
          idVal: 'a',
          label: 'a',
          shape: 'rectangle',
          special: empty(),
        },
        {
          id: 'b',
          idVal: 'b',
          label: 'b',
          shape: 'rectangle',
          special: empty(),
        },
      ],
      [
        {
          src: 'a',
          dst: 'b',
          srcArrow: false,
          dstArrow: true,
          label: 'charge',
        },
      ],
    )
    return renderD2Graph(graph, sizer)
  }

  it('paints a halo UNDER the label text, keeping the muted fill', () => {
    const label = /<text[^>]*>charge<\/text>/.exec(labelSvg())?.[0] ?? ''
    expect(label, 'the edge label was not emitted').not.toBe('')
    expect(label).toContain('paint-order="stroke"')
    expect(label).toContain('stroke-width="4"')
    expect(label).toMatch(/fill="[^"]+"/)
  })

  // Task 421 — a connection label used to paint from d2's N2 token (`textMuted`, a bg->fg 0.6 mix)
  // while the node label inside a box paints from N1 (`text`). That is faithful to d2 itself, but
  // in the editor the connection label read as noticeably dimmer than everything around it. The
  // palette style is load-bearing HERE: in `mono` both tokens collapse to `currentColor`, so this
  // assertion would pass vacuously on the default style and prove nothing.
  it('paints a connection label in the SAME colour as a node label (task 421)', () => {
    const sty = paletteStyle({ bg: '#101010', fg: '#f0f0f0', line: '#48a0c7' })
    expect(
      sty.text,
      'palette fixture is degenerate — text and textMuted must differ for this test to mean anything',
    ).not.toBe(sty.textMuted)

    const graph = g(
      [
        {
          id: 'a',
          idVal: 'a',
          label: 'a',
          shape: 'rectangle',
          special: empty(),
        },
        {
          id: 'b',
          idVal: 'b',
          label: 'b',
          shape: 'rectangle',
          special: empty(),
        },
      ],
      [
        {
          src: 'a',
          dst: 'b',
          srcArrow: false,
          dstArrow: true,
          label: 'charge',
        },
      ],
    )
    const svg = renderD2Graph(graph, sizer, sty)
    const fillOf = (text: string) =>
      /fill="([^"]+)"/.exec(
        new RegExp(`<text[^>]*>${text}</text>`).exec(svg)?.[0] ?? '',
      )?.[1]

    expect(fillOf('charge'), 'connection label').toBe(sty.text)
    expect(
      fillOf('a'),
      'node label — the reference the user compared against',
    ).toBe(sty.text)
  })

  it('uses the PAGE surface when the canvas is transparent (tasks 372, 394)', () => {
    // The paired themes leave D2Style.bg undefined (transparent canvas following the page), so a
    // hardcoded colour would smudge every one of them. It must be --vmarkd-page-bg and not
    // --vscode-editor-background directly: a named content theme paints the page a colour of its
    // own, and painting the halo in the editor UI colour instead put a dark outline on a white
    // github page (task 394). The editor background stays as the fallback for `auto`.
    const label = /<text[^>]*>charge<\/text>/.exec(labelSvg())?.[0] ?? ''
    expect(label).toContain(
      'var(--vmarkd-page-bg, var(--vscode-editor-background, transparent))',
    )
  })
})

// Task 396 — a node with an explicit `style.fill` got its label colour by luminance of that fill
// (`labelColor`), on the premise that the fill is what sits behind the glyph. In SKETCH mode that
// premise is false: d2-sketch draws fills as rough.js hachure (`fillStyle: 'hachure'`,
// hachureGap 6px, fillWeight 1.2), so the fill covers only a fraction of the shape and the PAGE is
// what is actually behind most of the label. Contrasting against the fill therefore picks a colour
// against a backdrop that is barely there — reported as a `Styled` node whose label was plain white
// on a dark theme regardless of its own blue fill.
describe('sketch-mode label colour (task 396)', () => {
  const stubSketch = (): import('./d2-render').Sketch => ({
    rect: () => '<path/>',
    ellipse: () => '<path/>',
    polygon: () => '<path/>',
    path: () => '<path/>',
    edge: () => '<path/>',
  })
  const styledNode = () =>
    g([
      {
        id: 'styled',
        idVal: 'styled',
        label: 'Styled',
        shape: 'rectangle',
        fill: '#2b6cb0',
        special: empty(),
      },
    ])
  const fillOf = (svg: string) =>
    /fill="([^"]+)"/.exec(/<text[^>]*>Styled<\/text>/.exec(svg)?.[0] ?? '')?.[1]

  it('follows the theme text colour when the fill is hachure, not solid', () => {
    const sty = paletteStyle({ bg: '#101010', fg: '#f0f0f0', line: '#48a0c7' })
    const svg = renderD2Graph(styledNode(), sizer, sty, stubSketch())
    expect(
      fillOf(svg),
      'label still contrasted against a fill that barely covers it',
    ).toBe(sty.text)
  })

  it('still contrasts against the fill in CRISP mode, where the fill really is solid', () => {
    const sty = paletteStyle({ bg: '#f0f0f0', fg: '#101010', line: '#48a0c7' })
    const svg = renderD2Graph(styledNode(), sizer, sty)
    // #2b6cb0 is dark -> white text. Unchanged behaviour; sketch must not regress the crisp path.
    expect(fillOf(svg), 'crisp-mode contrast-vs-fill was lost').toBe('#ffffff')
  })
})

// Task 104 leftover — dagre's rank pass only walks LEAF nodes, so an edge whose endpoint is a
// container ("gateway -> frontend") used to throw "Cannot set properties of undefined (setting
// 'rank')" and take the whole diagram to the LOUD raw-text fallback — under the DEFAULT engine,
// while `elk` rendered it fine. layoutDagre now routes such an edge against a proxy leaf inside the
// container and chops the polyline back to the container's border.
describe('d2-render — container as an edge endpoint (dagre)', () => {
  const empty2 = () => ({ isSequence: false, isGrid: false })
  const rect = (id: string, container?: string) => ({
    id,
    idVal: id.split('.').pop(),
    label: id.split('.').pop(),
    shape: 'rectangle',
    container,
    special: empty2(),
  })
  // Last coordinate pair of the first <path> — where the edge actually terminates.
  const pathEnds = (svg: string) => {
    const d = /<path d="([^"]+)"/.exec(svg)?.[1] ?? ''
    const pts = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ])
    return { first: pts[0], last: pts[pts.length - 1] }
  }
  // Geometry of a <rect> by its y/height, matched by draw order (container boxes come first).
  const rects = (svg: string) =>
    [
      ...svg.matchAll(
        /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g,
      ),
    ].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
      w: Number(m[3]),
      h: Number(m[4]),
    }))

  it('renders an edge TO a container, stopping at the container border', () => {
    const graph = g(
      [rect('gateway'), rect('frontend'), rect('frontend.web', 'frontend')],
      [{ src: 'gateway', dst: 'frontend', srcArrow: false, dstArrow: true }],
    )
    const svg = renderD2Graph(graph, sizer)
    expect(svg).toContain('<path')
    const boxes = rects(svg)
    // The container is the tallest box (it wraps a child + header).
    const container = boxes.reduce((a, b) => (b.h > a.h ? b : a))
    const child = boxes.find((b) => b.y > container.y && b.h < container.h)
    const { last } = pathEnds(svg)
    // Chopped at the container's top edge (minus the arrowhead inset), NOT run down to the proxy
    // child it was laid out against.
    expect(last[1]).toBeLessThanOrEqual(container.y)
    expect(last[1]).toBeGreaterThan(container.y - 20)
    expect(child && last[1]).toBeLessThan(child?.y ?? 0)
  })

  it('renders an edge FROM a container, starting at the container border', () => {
    const graph = g(
      [rect('frontend'), rect('frontend.web', 'frontend'), rect('db')],
      [{ src: 'frontend', dst: 'db', srcArrow: false, dstArrow: true }],
    )
    const svg = renderD2Graph(graph, sizer)
    const boxes = rects(svg)
    const container = boxes.reduce((a, b) => (b.h > a.h ? b : a))
    const { first } = pathEnds(svg)
    // Starts on the container's bottom edge, not inside it at the proxy child.
    expect(first[1]).toBeGreaterThanOrEqual(container.y + container.h - 20)
  })

  it('drops — rather than crashes on — an edge to a container with no leaf to stand in for it', () => {
    // `outer` contains only another container, so there is no leaf proxy available.
    const graph = g(
      [
        rect('a'),
        rect('outer'),
        rect('outer.inner'),
        rect('outer.inner.leaf', 'outer.inner'),
      ],
      [{ src: 'a', dst: 'outer', srcArrow: false, dstArrow: true }],
    )
    // outer's only child is a container; the leaf lives one level deeper.
    graph.shapes[2].container = 'outer'
    const svg = renderD2Graph(graph, sizer)
    expect(svg).toContain('<svg')
    expect(svg).not.toContain('<path')
  })

  it('drops an edge from a container to its own descendant instead of self-looping', () => {
    const graph = g(
      [rect('box'), rect('box.a', 'box')],
      [{ src: 'box', dst: 'box.a', srcArrow: false, dstArrow: true }],
    )
    const svg = renderD2Graph(graph, sizer)
    expect(svg).toContain('<svg')
    expect(svg).not.toContain('<path')
  })
})

describe('text styles: font-size / underline / text-transform (task 129)', () => {
  const node = (extra: any) =>
    g([
      {
        id: 'n',
        idVal: 'n',
        label: 'hello world',
        shape: 'rectangle',
        special: empty(),
        ...extra,
      },
    ])
  const boxOf = (svg: string) => {
    const m =
      /<rect x="[\d.-]+" y="[\d.-]+" width="([\d.]+)" height="([\d.]+)"/.exec(
        svg,
      )
    return { w: Number(m?.[1]), h: Number(m?.[2]) }
  }

  it('renders an explicit style.font-size on the <text> AND grows the box (no clip)', () => {
    const base = renderD2Graph(node({}), sizer)
    const big = renderD2Graph(node({ fontSize: '28' }), sizer)
    expect(big).toContain('font-size="28"')
    expect(base).not.toContain('font-size="28"')
    const baseBox = boxOf(base)
    const bigBox = boxOf(big)
    expect(bigBox.w).toBeGreaterThan(baseBox.w)
    expect(bigBox.h).toBeGreaterThan(baseBox.h)
  })

  it('adds text-decoration="underline" only when underline is set', () => {
    expect(renderD2Graph(node({ underline: true }), sizer)).toContain(
      'text-decoration="underline"',
    )
    expect(renderD2Graph(node({}), sizer)).not.toContain('text-decoration')
  })

  it.each([
    ['uppercase', 'HELLO WORLD'],
    ['lowercase', 'hello world'],
    ['capitalize', 'Hello World'],
  ])('applies textTransform=%s to the rendered label string', (transform, expected) => {
    const svg = renderD2Graph(node({ textTransform: transform }), sizer)
    expect(svg).toContain(`>${expected}<`)
  })

  it('leaves an unrecognized/none text-transform unchanged', () => {
    const svg = renderD2Graph(node({ textTransform: 'none' }), sizer)
    expect(svg).toContain('>hello world<')
  })

  it('stays byte-identical to the default render when fontSize/underline/textTransform are unset', () => {
    const a = renderD2Graph(node({}), sizer)
    const b = renderD2Graph(
      node({
        fontSize: undefined,
        underline: undefined,
        textTransform: undefined,
      }),
      sizer,
    )
    expect(b).toBe(a)
    expect(a).not.toContain('text-decoration')
    expect(a).toContain('font-size="16"') // default FONT_SIZE, no per-shape override
  })
})

describe('label / icon positioning: label.near / icon.near (task 134)', () => {
  const node = (extra: any) =>
    g([
      {
        id: 'n',
        idVal: 'n',
        label: 'n',
        shape: 'rectangle',
        special: empty(),
        ...extra,
      },
    ])
  const textPos = (svg: string) => {
    const m = /<text x="([\d.]+)" y="([\d.]+)"([^>]*)>/.exec(svg)
    return { x: Number(m?.[1]), y: Number(m?.[2]), attrs: m?.[3] ?? '' }
  }

  it('anchors label.near="top-center" at the top of the box, not the default centre', () => {
    const centered = textPos(renderD2Graph(node({}), sizer))
    const topCenter = textPos(
      renderD2Graph(node({ labelPosition: 'top-center' }), sizer),
    )
    // default rectangle label is already text-anchor="middle" (horizontally centred) — top-center
    // keeps that anchor but must move OFF the vertical centre and drop dominant-baseline="central".
    expect(topCenter.attrs).toContain('text-anchor="middle"')
    expect(topCenter.attrs).toContain('dominant-baseline="hanging"')
    expect(topCenter.attrs).not.toContain('dominant-baseline="central"')
    expect(topCenter.y).toBeLessThan(centered.y)
  })

  it('anchors label.near="bottom-right" at the bottom-right corner (start-anchor coords increase)', () => {
    const centered = textPos(renderD2Graph(node({}), sizer))
    const bottomRight = textPos(
      renderD2Graph(node({ labelPosition: 'bottom-right' }), sizer),
    )
    expect(bottomRight.attrs).toContain('text-anchor="end"')
    expect(bottomRight.x).toBeGreaterThan(centered.x)
    expect(bottomRight.y).toBeGreaterThan(centered.y)
  })

  it('ignores an outside-* / unrecognized label.near (deferred) and keeps the default centred position', () => {
    const centered = renderD2Graph(node({}), sizer)
    const outside = renderD2Graph(
      node({ labelPosition: 'outside-top-center' }),
      sizer,
    )
    const bogus = renderD2Graph(node({ labelPosition: 'nonsense' }), sizer)
    expect(outside).toBe(centered)
    expect(bogus).toBe(centered)
  })

  it('moves the decorative icon badge to the opposite (top-right) corner from the hardcoded top-left default', () => {
    const icon = 'data:image/png;base64,AAAA'
    const defaultPos = renderD2Graph(node({ icon }), sizer)
    const topRight = renderD2Graph(
      node({ icon, iconPosition: 'top-right' }),
      sizer,
    )
    const xOf = (svg: string) =>
      Number(/<image[^>]*x="([\d.]+)"/.exec(svg)?.[1])
    expect(xOf(topRight)).toBeGreaterThan(xOf(defaultPos))
  })

  it('stays byte-identical to the default render when labelPosition/iconPosition are unset', () => {
    const a = renderD2Graph(node({}), sizer)
    const b = renderD2Graph(
      node({ labelPosition: undefined, iconPosition: undefined }),
      sizer,
    )
    expect(b).toBe(a)
  })
})

// Task 493 — the compiler keeps a real newline inside a label and d2 draws one row per line. SVG
// <text> does not break on \n, so every one of these used to go out as a single (over-wide) run.
describe('multi-line labels (task 493)', () => {
  const shape = (extra: any = {}) => ({
    id: 'n',
    idVal: 'n',
    label: 'Dedicated mailbox\nExchange Online',
    shape: 'rectangle',
    special: empty(),
    ...extra,
  })
  const rowsOf = (svg: string) => [
    ...svg.matchAll(/<tspan x="([\d.]+)" y="([\d.]+)">([^<]*)<\/tspan>/g),
  ]

  it('splits a shape label into one <tspan> per line, x/y absolute (never dy)', () => {
    const svg = renderD2Graph(g([shape()]), sizer)
    const rows = rowsOf(svg)
    expect(rows.map((m) => m[3])).toEqual([
      'Dedicated mailbox',
      'Exchange Online',
    ])
    expect(svg).not.toContain('dy=')
    // Same x on every row (the <text> is centre-anchored), one line-height apart vertically.
    expect(rows[0][1]).toBe(rows[1][1])
    expect(Number(rows[1][2]) - Number(rows[0][2])).toBeCloseTo(16 * 1.25, 5)
  })

  it('centres the block on the label anchor, and leaves a single-line label alone', () => {
    expect(rowsOf(renderD2Graph(g([shape({ label: 'one' })]), sizer))).toEqual(
      [],
    ) // single line keeps the plain (byte-identical) emit
    const svg = renderD2Graph(g([shape()]), sizer)
    // The <text> keeps the anchor the single-line emit used; the rows straddle it.
    const anchorY = Number(
      /<text x="[\d.]+" y="([\d.]+)"[^>]*><tspan/.exec(svg)![1],
    )
    const rows = rowsOf(svg)
    expect(Number(rows[0][2])).toBeLessThan(anchorY)
    expect(Number(rows[1][2])).toBeGreaterThan(anchorY)
  })

  it('grows the box with the line count instead of one long line', () => {
    const hOf = (svg: string) =>
      Number(
        /<rect x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="([\d.]+)"/.exec(
          svg,
        )![2],
      )
    const two = hOf(renderD2Graph(g([shape()]), sizer))
    const one = hOf(
      renderD2Graph(g([shape({ label: 'Dedicated mailbox' })]), sizer),
    )
    expect(two - one).toBeCloseTo(16 * 1.25, 5)
  })

  it('breaks a CONNECTION label too', () => {
    const svg = renderD2Graph(
      g(
        [
          shape({ id: 'a', idVal: 'a', label: 'a' }),
          shape({ id: 'b', idVal: 'b', label: 'b' }),
        ],
        [
          {
            src: 'a',
            dst: 'b',
            srcArrow: false,
            dstArrow: true,
            label: 'needs_info\nask_bradbury\nnothing_new',
          },
        ],
      ),
      sizer,
    )
    expect(rowsOf(svg).map((m) => m[3])).toEqual([
      'needs_info',
      'ask_bradbury',
      'nothing_new',
    ])
  })

  it('grows a container header DOWN from its first row (into the reserved band)', () => {
    const svg = renderD2Graph(
      g([
        shape({ id: 'box', idVal: 'box', label: 'Module 1\nmailbox ingest' }),
        shape({ id: 'box.a', idVal: 'a', label: 'a', container: 'box' }),
      ]),
      sizer,
    )
    const rows = rowsOf(svg)
    expect(rows.map((m) => m[3])).toEqual(['Module 1', 'mailbox ingest'])
    // The FIRST row keeps the header's anchor baseline; the second is one line BELOW it, growing
    // into the band the layout reserved (the opposite of a grid header, which grows upward).
    const anchorY = Number(
      /<text x="[\d.]+" y="([\d.]+)"[^>]*><tspan/.exec(svg)![1],
    )
    expect(Number(rows[0][2])).toBeCloseTo(anchorY, 5)
    expect(Number(rows[1][2]) - Number(rows[0][2])).toBeCloseTo(16 * 1.25, 5)
  })

  it('gives a sql_table with a 2-line title a taller header band, rows pushed down', () => {
    const table = (label: string) =>
      g([
        {
          id: 't',
          idVal: 't',
          label,
          shape: 'sql_table',
          columns: [{ name: 'id', type: 'int' }],
          special: empty(),
        },
      ])
    const firstColumnY = (svg: string) =>
      Number(/<text x="[\d.]+" y="([\d.]+)"[^>]*>id<\/text>/.exec(svg)![1])
    const one = renderD2Graph(table('orders'), sizer)
    const two = renderD2Graph(table('orders\narchive'), sizer)
    expect(rowsOf(two).map((m) => m[3])).toEqual(['orders', 'archive'])
    expect(firstColumnY(two)).toBeGreaterThan(firstColumnY(one))
  })

  it("grows a GRID header UP from its band's bottom edge (the 'up' flow)", () => {
    const grid = (label: string) =>
      g([
        {
          id: 'grid',
          idVal: 'grid',
          label,
          shape: 'rectangle',
          special: { isSequence: false, isGrid: true, gridColumns: '2' },
        },
        {
          id: 'grid.a',
          idVal: 'a',
          label: 'a',
          shape: 'rectangle',
          container: 'grid',
          special: empty(),
        },
      ])
    // The grid header sits on the BOTTOM of its band, so the LAST row keeps the anchor baseline
    // and earlier rows stack ABOVE it — the opposite of a container header, whose first row does.
    const svg = renderD2Graph(grid('panel\nof charts'), sizer)
    const anchorY = Number(
      /<text x="[\d.]+" y="([\d.]+)"[^>]*><tspan/.exec(svg)![1],
    )
    const rows = rowsOf(svg)
    expect(rows.map((m) => m[3])).toEqual(['panel', 'of charts'])
    expect(Number(rows[1][2])).toBeCloseTo(anchorY, 5)
    expect(Number(rows[0][2])).toBeCloseTo(anchorY - 16 * 1.25, 5)
  })

  it('escapes each row (no markup injection through a line)', () => {
    const svg = renderD2Graph(g([shape({ label: '<b>a\n&amp' })]), sizer)
    expect(svg).toContain('&lt;b&gt;a')
    expect(svg).toContain('&amp;amp')
  })

  it('the label line-height matches canvasMeasure — a drifting factor would push rows out of the box', () => {
    // canvasMeasure sizes a label block at lines * fontSize * 1.25; labelRows must space rows the same.
    const rows = rowsOf(renderD2Graph(g([shape()]), sizer))
    const gap = Number(rows[1][2]) - Number(rows[0][2])
    expect(gap).toBe(sizer('a\nb').h - sizer('a').h)
  })
})
