import { describe, it, expect } from 'vitest'
import { __test } from './d2-refine'
import type { Layout, PlacedEdge, PlacedNode } from './d2-render'

const { deOvershoot, deleteBendsEndpoints, bundleSiblings, rerouteBackEdges } =
  __test

// Minimal Layout factory — only the fields the passes read (nodes: id/x/y/w/h/kind; edges: points +
// src/dst/label). Casts keep the synthetic shapes terse while matching the real Layout shape.
const node = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: PlacedNode['kind'] = 'shape',
): PlacedNode => ({ s: { id } as any, x, y, w, h, kind })
const edge = (
  points: number[][],
  extra: Partial<PlacedEdge> = {},
): PlacedEdge =>
  ({
    points: points as PlacedEdge['points'],
    srcArrow: false,
    dstArrow: true,
    ...extra,
  }) as PlacedEdge
const layout = (nodes: PlacedNode[], edges: PlacedEdge[]): Layout => ({
  W: 1000,
  H: 1000,
  nodes,
  edges,
  edgeStyle: 'orthogonal',
})

describe('deOvershoot (task 122 — collapse opposite-direction H-V-H bumps)', () => {
  it('collapses an interior right-then-left bump to a single L corner', () => {
    // Edge descends, jogs RIGHT to x=300, drops, then sweeps back LEFT to x=100 — an x-overshoot whose
    // two horizontals run in opposite directions. deOvershoot should remove the bump (point count drops).
    const e = edge([
      [100, 0], // exit stub
      [100, 100], // V down
      [300, 100], // H right  (h1)
      [300, 200], // V down   (v)
      [100, 200], // H left   (h2, opposite direction → bump)
      [100, 400], // entry stub
    ])
    const lay = layout([], [e])
    const before = e.points.length
    deOvershoot(lay)
    expect(e.points.length).toBeLessThan(before)
    // every remaining segment is axis-aligned (no diagonal introduced)
    for (let i = 0; i + 1 < e.points.length; i++) {
      const a = e.points[i]
      const b = e.points[i + 1]
      const ortho = Math.abs(a[0] - b[0]) < 0.5 || Math.abs(a[1] - b[1]) < 0.5
      expect(ortho).toBe(true)
    }
    // endpoints (stubs) untouched
    expect(e.points[0]).toEqual([100, 0])
    expect(e.points[e.points.length - 1]).toEqual([100, 400])
  })

  it('leaves a monotone staircase alone (not a bump)', () => {
    // both horizontals run RIGHT → monotone staircase, deOvershoot must not touch it
    const e = edge([
      [0, 0],
      [0, 100],
      [100, 100],
      [100, 200],
      [200, 200],
      [200, 400],
    ])
    const lay = layout([], [e])
    const snap = e.points.map((p) => [...p])
    deOvershoot(lay)
    expect(e.points).toEqual(snap)
  })
})

describe('bundleSiblings (task 122 — raise a late jog toward a same-label sibling)', () => {
  it('raises a late monotone jog toward its sibling so the two descend parallel longer', () => {
    // Two edges share the label "q" and descend to ~y=560 near x=300. Sibling A descends from y=200.
    // Edge B jogs late at y=520 then descends — bundleSiblings should RAISE B's jog toward A's descent
    // top (y=200) so the two run parallel for the full descent. (CHANSPACE only guards a collinear
    // HORIZONTAL line; the sibling's descent is vertical, so the jog may rise right up to its top.)
    const sibling = edge(
      [
        [300, 100], // exit
        [300, 200], // descent top (early)
        [300, 560], // descends to target
        [400, 560], // entry stub
      ],
      { src: 'a', dst: 'b', label: 'q' },
    )
    const e = edge(
      [
        [100, 100], // exit stub
        [100, 520], // V before (descends late)
        [300, 520], // H jog at y=520
        [300, 560], // V after (the short descent to target)
        [400, 560], // entry stub
      ],
      { src: 'c', dst: 'b', label: 'q' },
    )
    // the H jog is the segment points[1]→points[2] (V-before is points[0]→points[1])
    const lay = layout([], [sibling, e])
    const yJogBefore = e.points[1][1]
    bundleSiblings(lay)
    const yJogAfter = e.points[1][1]
    // the jog was raised (smaller y) toward the sibling's descent top
    expect(yJogAfter).toBeLessThan(yJogBefore)
    expect(yJogAfter).toBeLessThanOrEqual(206) // reached ~y=200 (sibling top), within one 6px step
    // the moved jog stays horizontal (both ends at the new Y) — route still orthogonal
    expect(e.points[2][1]).toBe(yJogAfter)
  })

  it('keeps ≥CHANSPACE (40) from a blocking collinear horizontal when raising the jog', () => {
    // A third edge parks a long horizontal band at y=240 across the descent column. Raising B's jog up to
    // the sibling's top (y=200) would sit only 40px above that band; bundleSiblings must NOT raise the jog
    // into the CHANSPACE (40) zone around the band, so the jog stays ≥40px from y=240.
    const sibling = edge(
      [
        [300, 100],
        [300, 200],
        [300, 560],
        [400, 560],
      ],
      { src: 'a', dst: 'b', label: 'q' },
    )
    const band = edge(
      [
        [80, 240],
        [520, 240], // long horizontal across the column at y=240
      ],
      { src: 'x', dst: 'y' },
    )
    const e = edge(
      [
        [100, 100],
        [100, 520],
        [300, 520], // H jog at y=520
        [300, 560],
        [400, 560],
      ],
      { src: 'c', dst: 'b', label: 'q' },
    )
    const lay = layout([], [sibling, band, e])
    bundleSiblings(lay)
    const yJogAfter = e.points[2][1]
    // never lands within CHANSPACE (40) of the band at y=240
    expect(Math.abs(yJogAfter - 240)).toBeGreaterThanOrEqual(40 - 0.5)
  })
})

describe('rerouteBackEdges (task 122 — A* the middle, preserve both stubs)', () => {
  it('preserves the first two and last two points of a rerouted back-edge', () => {
    // A back-edge: src "low" (cy≈600) → dst "high" (cy≈100), so it climbs UP (dst.cy < src.cy − 40).
    // The straight ELK route would cut through the obstacle box in the middle; A* must route around it.
    // Whatever it does, the exit stub (points[0..1]) and entry stub (points[n-2..n-1]) stay verbatim.
    const low = node('low', 280, 560, 80, 40)
    const high = node('high', 280, 60, 80, 40)
    const obstacle = node('mid', 240, 300, 160, 80) // sits between, on the straight x≈320 path
    const e = edge(
      [
        [320, 600], // exit stub start (on low's top)
        [320, 540], // exit stub end  (kept)
        [320, 140], // (middle — A* replaces this)
        [320, 100], // entry stub start (kept)
        [320, 60], // entry stub end (on high's bottom)
      ],
      { src: 'low', dst: 'high' },
    )
    const lay = layout([low, high, obstacle], [e])
    const stub0 = [...e.points[0]]
    const stub1 = [...e.points[1]]
    const n = e.points.length
    const ePenult = [...e.points[n - 2]]
    const eLast = [...e.points[n - 1]]
    rerouteBackEdges(lay)
    const m = e.points.length
    // first two points unchanged
    expect(e.points[0]).toEqual(stub0)
    expect(e.points[1]).toEqual(stub1)
    // last two points unchanged
    expect(e.points[m - 2]).toEqual(ePenult)
    expect(e.points[m - 1]).toEqual(eLast)
  })

  it('does not touch a forward (downward) edge', () => {
    const a = node('a', 280, 60, 80, 40)
    const b = node('b', 280, 560, 80, 40)
    const e = edge(
      [
        [320, 100],
        [320, 300],
        [320, 560],
      ],
      { src: 'a', dst: 'b' }, // dst below src → not a back-edge
    )
    const lay = layout([a, b], [e])
    const snap = e.points.map((p) => [...p])
    rerouteBackEdges(lay)
    expect(e.points).toEqual(snap)
  })
})

// task 123 #4 — deleteBendsEndpoints gained a collinear guard. It removes a removable ladder bend only if
// the straightened segment does not land collinear-and-overlapping on ANOTHER edge's line (before, it
// guarded only box-hit + crossing, so a deletion could drop the route onto another edge → edge-on-edge).
describe('deleteBendsEndpoints collinear guard (task 123 #4)', () => {
  // start→corner is vertical (x=0); the removable bend straightens to a new horizontal at y=40.
  const ladder = (): PlacedEdge[] => [
    edge(
      [
        [-40, 40], // before  (horizontal into start)
        [0, 40], // start
        [0, 80], // corner   (start→corner vertical)
        [40, 80], // end
        [40, 140], // after
        [40, 200], // last
      ],
      { src: 'a', dst: 'b' }, // distinct endpoints — else `src === dst` skips the edge
    ),
  ]

  it('removes the bend when the straightened segment is clear', () => {
    const [e] = ladder()
    deleteBendsEndpoints(layout([], [e]))
    expect(e.points.length).toBeLessThan(6) // bend removed
  })

  it('refuses to remove the bend when the result would lie on another edge', () => {
    const [e] = ladder()
    // F runs horizontally along y=40, overlapping the x-range of the straightened segment → collinear.
    const f = edge(
      [
        [0, 40],
        [60, 40],
      ],
      { src: 'c', dst: 'd' },
    )
    const snap = e.points.map((p) => [...p])
    deleteBendsEndpoints(layout([], [e, f]))
    expect(e.points).toEqual(snap) // bend kept — collinear guard refused the straighten
  })
})

// task 123 #4 — deOvershoot gained a container-wall guard. Its old hitsBox tested LEAF interiors only, so a
// collapse could run the new segment collinear along a CONTAINER wall (the "container-wall run slipped" bug).
describe('deOvershoot container-wall guard (task 123 #4)', () => {
  // An opposite-direction H-V-H bump whose only collapse is a straight vertical at x=100.
  const bump = (): PlacedEdge[] => [
    edge([
      [100, 0],
      [100, 100],
      [300, 100],
      [300, 200],
      [100, 200],
      [100, 400],
    ]),
  ]

  it('collapses the bump when no container wall is in the way', () => {
    const [e] = bump()
    const before = e.points.length
    deOvershoot(layout([], [e]))
    expect(e.points.length).toBeLessThan(before)
  })

  it('refuses the collapse when it would hug a container wall', () => {
    const [e] = bump()
    // container whose RIGHT wall sits at x=100 — the collapsed vertical would run along it
    const c = node('box', 0, 0, 100, 400, 'container')
    const snap = e.points.map((p) => [...p])
    deOvershoot(layout([c], [e]))
    expect(e.points).toEqual(snap) // bump kept — wall guard refused the collapse
  })
})

// Task 494 — the straightening passes only reject a change that crosses, hits a box or lands COLLINEAR
// (±2px); a run left 11px from another edge's parallel run passes all three and reads as one thick line.
// spreadCloseRuns pushes them back to the lane ELK itself reserves (24).
describe('spreadCloseRuns (task 494 — restore the parallel-run lane)', () => {
  const { spreadCloseRuns } = __test as unknown as {
    spreadCloseRuns: (l: Layout) => void
  }
  // Two edges whose middle risers run 11px apart for 300px. Both risers are INTERIOR (bends at each end).
  const pair = () => {
    const a = edge(
      [
        [100, 0],
        [100, 100],
        [400, 100],
        [400, 400],
        [700, 400],
        [700, 500],
      ],
      { src: 'a1', dst: 'a2' },
    )
    const b = edge(
      [
        [200, 0],
        [200, 160],
        [411, 160],
        [411, 460],
        [800, 460],
        [800, 560],
      ],
      { src: 'b1', dst: 'b2' },
    )
    return { a, b, lay: layout([], [a, b]) }
  }

  it('pushes one of two 11px-apart parallel risers out to the 24px lane', () => {
    const { a, b, lay } = pair()
    expect(Math.abs(a.points[2][0] - b.points[2][0])).toBe(11)
    spreadCloseRuns(lay)
    const gap = Math.abs(a.points[2][0] - b.points[2][0])
    expect(gap).toBeGreaterThanOrEqual(24)
    // the moved riser stays a riser: both its ends carry the same x, and the route stays orthogonal
    for (const e of [a, b]) {
      expect(e.points[2][0]).toBe(e.points[3][0])
      for (let i = 0; i + 1 < e.points.length; i++) {
        const p = e.points[i]
        const q = e.points[i + 1]
        expect(Math.abs(p[0] - q[0]) < 0.5 || Math.abs(p[1] - q[1]) < 0.5).toBe(
          true,
        )
      }
    }
  })

  it('never moves a port stub — a pair of first/last segments is left alone', () => {
    // Both risers ARE the edges' first segments (they dock into a node port), so neither may move.
    const a = edge(
      [
        [400, 0],
        [400, 400],
        [700, 400],
      ],
      { src: 'a1', dst: 'a2' },
    )
    const b = edge(
      [
        [411, 0],
        [411, 400],
        [800, 400],
      ],
      { src: 'b1', dst: 'b2' },
    )
    const lay = layout([], [a, b])
    const snap = [a, b].map((e) => e.points.map((p) => [...p]))
    spreadCloseRuns(lay)
    expect([a, b].map((e) => e.points.map((p) => [...p]))).toEqual(snap)
  })

  it('moves the movable side when the neighbour is a port stub (the reported shape)', () => {
    // b's riser IS its first segment (a port), so only a can move — exactly the case on the reported
    // document, where the straightened m2.pseudo→vault riser docked into the node it crowded.
    const a = edge(
      [
        [100, 0],
        [100, 100],
        [400, 100],
        [400, 400],
        [700, 400],
        [700, 500],
      ],
      { src: 'a1', dst: 'a2' },
    )
    const b = edge(
      [
        [411, 0],
        [411, 500],
        [800, 500],
      ],
      { src: 'b1', dst: 'b2' },
    )
    const lay = layout([], [a, b])
    spreadCloseRuns(lay)
    expect(b.points[0][0], 'the port stub never moves').toBe(411)
    expect(Math.abs(a.points[2][0] - 411)).toBeGreaterThanOrEqual(24)
  })

  it("respects a container wall — a run may cross a container's interior but not hug its wall", () => {
    // Only a can move (b's riser is a port stub), and the only lane-restoring position for it sits ON a
    // container's right wall — where a line reads as struck through the box edge. So nothing moves.
    const a = edge(
      [
        [100, 0],
        [100, 100],
        [400, 100],
        [400, 400],
        [700, 400],
        [700, 500],
      ],
      { src: 'a1', dst: 'a2' },
    )
    const b = edge(
      [
        [411, 0],
        [411, 500],
        [800, 500],
      ],
      { src: 'b1', dst: 'b2' },
    )
    const lay = layout([node('C', 100, 150, 287, 300, 'container')], [a, b])
    const snap = [a, b].map((e) => e.points.map((p) => [...p]))
    spreadCloseRuns(lay)
    expect([a, b].map((e) => e.points.map((p) => [...p]))).toEqual(snap)
  })

  it('never flips a neighbour jog into a left-then-right bump', () => {
    // Moving a's riser left would keep the adjacent jog's LENGTH (10) but reverse its direction, turning
    // an L into the bump deOvershoot exists to remove — and deOvershoot runs before this pass. So the
    // other run has to be the one that moves.
    const a = edge(
      [
        [0, 0],
        [0, 100],
        [10, 100],
        [10, 300],
        [200, 300],
      ],
      { src: 'a1', dst: 'a2' },
    )
    const b = edge(
      [
        [400, 0],
        [400, 50],
        [14, 50],
        [14, 250],
        [300, 250],
        [300, 400],
      ],
      { src: 'b1', dst: 'b2' },
    )
    const lay = layout([], [a, b])
    spreadCloseRuns(lay)
    expect(a.points[2][0], "a's jog still runs to the RIGHT").toBeGreaterThan(
      a.points[1][0],
    )
    expect(Math.abs(a.points[2][0] - b.points[2][0])).toBeGreaterThanOrEqual(24)
  })

  it('leaves siblings (same source) to the bundling passes', () => {
    const { a, b, lay } = pair()
    b.src = a.src
    const snap = [a, b].map((e) => e.points.map((p) => [...p]))
    spreadCloseRuns(lay)
    expect([a, b].map((e) => e.points.map((p) => [...p]))).toEqual(snap)
  })

  it('keeps a run put when the only way out is through a node box', () => {
    const { a, b, lay } = pair()
    // Box both risers in: either lane-restoring move lands within RUNCLR of a node (and closer than it
    // already was), so the pass must leave the routes exactly as they are.
    lay.nodes = [node('L', 340, 180, 50, 200), node('R', 425, 180, 50, 200)]
    const snap = [a, b].map((e) => e.points.map((p) => [...p]))
    spreadCloseRuns(lay)
    expect([a, b].map((e) => e.points.map((p) => [...p]))).toEqual(snap)
  })
})
