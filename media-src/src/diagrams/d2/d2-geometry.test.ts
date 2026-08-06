import { describe, expect, it } from 'vitest'
import {
  type ABox,
  boxDist,
  chopAtRect,
  parDist,
  segHitsABox,
  segHitsBoxMargined,
  segsCross,
  simplifyRoute,
  straightenEnds,
  wallDist,
} from './d2-geometry'

// Shared geometry primitives extracted in task 123. These were previously untested (internal to d2-render /
// d2-refine); now they're the one home for both, so they get direct unit coverage.

describe('segsCross (proper segment intersection)', () => {
  it('is true for two segments that properly cross', () => {
    // horizontal y=0 crossed by a vertical at x=5
    expect(segsCross([0, 0], [10, 0], [5, -5], [5, 5])).toBe(true)
  })
  it('is false for parallel non-touching segments', () => {
    expect(segsCross([0, 0], [10, 0], [0, 5], [10, 5])).toBe(false)
  })
  it('is false for a T-junction (endpoint touching, not a proper crossing)', () => {
    // the vertical starts ON the horizontal — touching is not a proper crossing
    expect(segsCross([0, 0], [10, 0], [5, 0], [5, 5])).toBe(false)
  })
  it('is false for collinear overlapping segments', () => {
    expect(segsCross([0, 0], [10, 0], [5, 0], [15, 0])).toBe(false)
  })
})

describe('segHitsABox (box inflated by ASTAR_M=10)', () => {
  const B: ABox = { x: 100, y: 100, w: 50, h: 50 } // inflated → x∈(90,160), y∈(90,160)
  it('hits when a vertical segment passes through the inflated box', () => {
    expect(segHitsABox([120, 0], [120, 300], B)).toBe(true)
  })
  it('misses when the vertical runs clear to the right of the inflation', () => {
    expect(segHitsABox([200, 0], [200, 300], B)).toBe(false)
  })
  it('hits when a horizontal segment passes through the inflated box', () => {
    expect(segHitsABox([0, 120], [300, 120], B)).toBe(true)
  })
  it('misses when a vertical is inside x but clear of the y-range', () => {
    expect(segHitsABox([120, 0], [120, 50], B)).toBe(false) // y 0..50 below y1=90
  })
})

// Characterization (task 502): pins segHitsBoxMargined's margin=4 behaviour — the exact case
// d2-refine.ts's deOvershoot/bundleSiblings closures used inline before this consolidation — as a
// distinct boundary check from the ASTAR_M=10 suite above (a segment just outside the M=4 inflation
// must miss even though it would hit at M=10, and vice versa).
describe('segHitsBoxMargined (arbitrary-margin box hit test, task 502)', () => {
  const B: ABox = { x: 100, y: 100, w: 50, h: 50 }
  it('at margin=4: hits a vertical 2px outside the raw box (within the 4px inflation)', () => {
    expect(segHitsBoxMargined([98, 0], [98, 300], B, 4)).toBe(true)
  })
  it('at margin=4: misses a vertical 6px outside the raw box (past the 4px inflation)', () => {
    expect(segHitsBoxMargined([94, 0], [94, 300], B, 4)).toBe(false)
  })
  it('at margin=4: the SAME vertical that misses at margin=4 hits at margin=10 (segHitsABox parity)', () => {
    expect(segHitsBoxMargined([94, 0], [94, 300], B, 4)).toBe(false)
    expect(segHitsABox([94, 0], [94, 300], B)).toBe(true)
  })
  it('margin=0 hits only the raw box, no inflation', () => {
    expect(segHitsBoxMargined([100.5, 0], [100.5, 300], B, 0)).toBe(true)
    expect(segHitsBoxMargined([99, 0], [99, 300], B, 0)).toBe(false)
  })
})

describe('boxDist (perpendicular distance to an un-inflated box)', () => {
  const B: ABox = { x: 0, y: 0, w: 100, h: 100 }
  it('is 0 for a segment inside the box', () => {
    expect(boxDist([50, 50], [60, 50], B)).toBe(0)
  })
  it('is the gap for a segment clear to the right', () => {
    expect(boxDist([200, 50], [200, 60], B)).toBe(100)
  })
})

describe('wallDist (0 on the perimeter, grows inward and outward)', () => {
  const B: ABox = { x: 0, y: 0, w: 100, h: 100 }
  it('is the outside gap when the segment is clear of the box', () => {
    expect(wallDist([200, 50], [200, 60], B)).toBe(100)
  })
  it('is 0 for a segment lying on a wall', () => {
    expect(wallDist([0, 40], [0, 60], B)).toBe(0)
  })
  it('grows toward the interior depth for a segment deep inside', () => {
    // both endpoints at x=50 (50px from either side); min interior depth = 40 (y=60 → 40 from bottom)
    expect(wallDist([50, 50], [50, 60], B)).toBe(40)
  })
})

describe('parDist (gap between parallel overlapping segments, else 1e9)', () => {
  it('returns the perpendicular gap for two overlapping verticals', () => {
    expect(parDist([0, 0], [0, 100], [20, 0], [20, 100])).toBe(20)
  })
  it('returns the perpendicular gap for two overlapping horizontals', () => {
    expect(parDist([0, 0], [100, 0], [0, 15], [100, 15])).toBe(15)
  })
  it('returns 1e9 for parallel segments whose extents do not overlap', () => {
    expect(parDist([0, 0], [0, 50], [20, 60], [20, 100])).toBe(1e9)
  })
  it('returns 1e9 for perpendicular segments', () => {
    expect(parDist([0, 0], [0, 100], [0, 50], [100, 50])).toBe(1e9)
  })
})

describe('simplifyRoute / straightenEnds (route cleanup, now in the geometry module)', () => {
  it('collapses an interior staircase to a single L when it clears all boxes', () => {
    const out = simplifyRoute(
      [
        [0, 0],
        [0, 50],
        [50, 50],
        [50, 100],
        [100, 100],
        [100, 150],
      ],
      [],
    )
    // fewer points than the input staircase, all segments axis-aligned
    expect(out.length).toBeLessThan(6)
    for (let i = 0; i + 1 < out.length; i++) {
      const ortho =
        Math.abs(out[i][0] - out[i + 1][0]) < 0.5 ||
        Math.abs(out[i][1] - out[i + 1][1]) < 0.5
      expect(ortho).toBe(true)
    }
  })
  it('straightenEnds absorbs a tiny port-attach kink at the source', () => {
    const box = { x: 0, y: 0, w: 100, h: 40 } // attach point sits on its bottom border
    const out = straightenEnds(
      [
        [40, 40], // attach on box bottom
        [40, 80], // tiny step
        [50, 80],
        [50, 200],
      ],
      [box],
    )
    // the 3-point S at the source is absorbed → first point moves to align with the kept point's column
    expect(out.length).toBeLessThan(4)
  })
})

// Task 104 leftover: dagre chops an edge at its ENDPOINT node's box, but a container-endpoint edge
// is laid out against a proxy leaf INSIDE the container, so the tail runs through the container's
// own box. chopAtRect re-cuts it at that box.
describe('chopAtRect', () => {
  const r = { x: 100, y: 100, w: 100, h: 100 }

  it('cuts the tail where the polyline enters the rect', () => {
    const out = chopAtRect(
      [
        [150, 0],
        [150, 50],
        [150, 150],
      ],
      r,
      'dst',
    )
    expect(out[out.length - 1]).toEqual([150, 100])
    expect(out).toHaveLength(3)
  })

  it('cuts the head where the polyline leaves the rect', () => {
    const out = chopAtRect(
      [
        [150, 150],
        [150, 250],
        [150, 300],
      ],
      r,
      'src',
    )
    expect(out[0]).toEqual([150, 200])
    expect(out).toHaveLength(3)
  })

  it('finds the crossing on a diagonal segment, not just an axis-aligned one', () => {
    const out = chopAtRect(
      [
        [50, 120],
        [150, 160],
      ],
      r,
      'dst',
    )
    // The segment crosses the rect's LEFT edge (x=100) at y=140 — mid-edge, not a corner.
    expect(out[out.length - 1]).toEqual([100, 140])
  })

  it('leaves a polyline that never enters the rect untouched', () => {
    const pts = [
      [0, 0],
      [50, 50],
    ]
    expect(chopAtRect(pts, r, 'dst')).toEqual(pts)
    expect(chopAtRect(pts, r, 'src')).toEqual(pts)
  })

  it('leaves a polyline entirely inside the rect untouched — nothing sane to chop', () => {
    const pts = [
      [120, 120],
      [140, 140],
    ]
    expect(chopAtRect(pts, r, 'dst')).toEqual(pts)
    expect(chopAtRect(pts, r, 'src')).toEqual(pts)
  })
})
