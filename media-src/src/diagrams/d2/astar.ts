// Back-edge A* router (task 122/123). A "back-edge" climbs UP (its destination sits above its source);
// ELK routes those poorly. d2-refine's rerouteBackEdges A*-routes only the MIDDLE of such an edge on a
// Hanan grid (PRESERVING both ELK port stubs verbatim), then greedily accepts the reroute only if it
// doesn't increase the total crossing count. This module is the router itself (grid build + binary-heap
// A*); the clearance maths it needs (segHitsABox/boxDist/wallDist/parDist/segsCross + ASTAR_M) live in the
// shared leaf module. Extracted from d2-refine.ts so the router is independently testable and the
// rerouteBackEdges → astar → (geometry, not refine) dependency stays acyclic. Ported from
// tmp/d2-compare/run67.mjs.
import { clamp } from '../../../../src/shared/clamp'
import {
  ASTAR_M,
  type ABox,
  boxDist,
  parDist,
  type Pt,
  segHitsABox,
  segsCross,
  wallDist,
} from './d2-geometry'

const COMFORT = 40 // below this clearance to an obstacle, pay a penalty
const COMFW = 6 // penalty weight per px short of COMFORT / EDGECLR
const EDGECLR = 20 // below this parallel-proximity to another edge, pay a penalty
const ASTAR_PAD = 64 // pad the clearance-object bbox so lanes exist outside peripheral boxes/walls
const ASTAR_STEP = 24 // densify grid lines to this resolution

interface ANode {
  i: number
  j: number
  g: number
  f: number
  di: number | null
  dj: number | null
  prev: ANode | null
  seq: number // push order — the open-set tie-break (see astar's heap)
}

interface AGrid {
  X: number[]
  Y: number[]
  Yl: number
  si: number
  sj: number
  gi: number
  gj: number
  ok: Uint8Array
}

interface EdgeIndex {
  eRows: number
  eCols: number
  eMinX: number
  eMinY: number
  eBuckets: number[][]
  eStamp: Int32Array
  eQid: number
  eCol: (x: number) => number
  eRow: (y: number) => number
}

interface AHeap {
  nodes: ANode[]
  pushSeq: number
}

interface SearchContext {
  grid: AGrid
  boxes: ABox[]
  edgeSegs: [Pt, Pt][]
  edgeIndex: EdgeIndex
  clearObs: ABox[]
  heap: AHeap
}

const ASTAR_DIRECTIONS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

// Densify each gap so A* can place a lane at any clearance, not just at walls.
function densify(set: Set<number>): Set<number> {
  const a = [...set].sort((p, q) => p - q)
  const r = new Set<number>(a)
  for (let i = 0; i + 1 < a.length; i++) {
    const gap = a[i + 1] - a[i]
    if (gap > ASTAR_STEP * 1.5) {
      const n = Math.round(gap / ASTAR_STEP)
      for (let k = 1; k < n; k++) r.add(a[i] + (gap * k) / n)
    }
  }
  return r
}

// Mark blocked cells from inflated boxes; this preserves the old strict interval test while keeping grid setup
// separate from the A* search.
function markBoxCells(
  X: number[],
  Y: number[],
  Yl: number,
  B: ABox,
  ok: Uint8Array,
): void {
  const x1 = B.x - ASTAR_M
  const x2 = B.x + B.w + ASTAR_M
  const y1 = B.y - ASTAR_M
  const y2 = B.y + B.h + ASTAR_M
  let i0 = 0
  while (i0 < X.length && X[i0] <= x1) i0++
  let i1 = i0
  while (i1 < X.length && X[i1] < x2) i1++
  let j0 = 0
  while (j0 < Yl && Y[j0] <= y1) j0++
  let j1 = j0
  while (j1 < Yl && Y[j1] < y2) j1++
  for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) ok[i * Yl + j] = 0
}

function markBlockedCells(
  X: number[],
  Y: number[],
  Yl: number,
  boxes: ABox[],
  ok: Uint8Array,
): void {
  for (const B of boxes) markBoxCells(X, Y, Yl, B, ok)
}

// Build the Hanan grid, including clearance lanes, padded bounds, and the walkable-cell bitmap used by A*.
function buildGrid(
  start: Pt,
  goal: Pt,
  boxes: ABox[],
  clearObs: ABox[],
): AGrid {
  const xs = new Set<number>([start[0], goal[0]])
  const ys = new Set<number>([start[1], goal[1]])
  // grid lines from ALL clearance objects (leaf boxes + containers) so lanes exist just outside walls
  for (const B of clearObs) {
    xs.add(B.x - ASTAR_M)
    xs.add(B.x + B.w + ASTAR_M)
    ys.add(B.y - ASTAR_M)
    ys.add(B.y + B.h + ASTAR_M)
  }
  // pad the bbox of all clearance objects (incl. CONTAINERS) + endpoints so lanes exist outside them
  let minX = Math.min(start[0], goal[0])
  let maxX = Math.max(start[0], goal[0])
  let minY = Math.min(start[1], goal[1])
  let maxY = Math.max(start[1], goal[1])
  for (const B of clearObs) {
    minX = Math.min(minX, B.x)
    maxX = Math.max(maxX, B.x + B.w)
    minY = Math.min(minY, B.y)
    maxY = Math.max(maxY, B.y + B.h)
  }
  xs.add(minX - ASTAR_PAD)
  xs.add(maxX + ASTAR_PAD)
  ys.add(minY - ASTAR_PAD)
  ys.add(maxY + ASTAR_PAD)
  const X = [...densify(xs)].sort((a, b) => a - b)
  const Y = [...densify(ys)].sort((a, b) => a - b)
  // Numeric cell index i*Yl+j (was a `${i}_${j}` string key) — hot map/set lookups, identical semantics.
  const Yl = Y.length
  const si = X.indexOf(start[0])
  const sj = Y.indexOf(start[1])
  const gi = X.indexOf(goal[0])
  const gj = Y.indexOf(goal[1])
  // Walkable grid. Build by MARKING the cells each inflated box covers (O(boxes × box-cells)), instead of
  // testing every cell against every box (O(cells × boxes)). Identical result: the same strict intervals.
  const ok = new Uint8Array(X.length * Yl).fill(1)
  markBlockedCells(X, Y, Yl, boxes, ok)
  ok[si * Yl + sj] = 1
  ok[gi * Yl + gj] = 1
  return { X, Y, Yl, si, sj, gi, gj, ok }
}

// Add one segment to every uniform-grid bucket its bounding box spans, preserving the old edge proximity index.
function bucketSegment(index: EdgeIndex, s: [Pt, Pt], idx: number): void {
  const c0 = index.eCol(Math.min(s[0][0], s[1][0]))
  const c1 = index.eCol(Math.max(s[0][0], s[1][0]))
  const r0 = index.eRow(Math.min(s[0][1], s[1][1]))
  const r1 = index.eRow(Math.max(s[0][1], s[1][1]))
  for (let c = c0; c <= c1; c++)
    for (let r = r0; r <= r1; r++) index.eBuckets[c * index.eRows + r].push(idx)
}

interface EdgeBounds {
  eMinX: number
  eMinY: number
  eMaxX: number
  eMaxY: number
}

function segmentBounds(s: [Pt, Pt]): EdgeBounds {
  return {
    eMinX: s[0][0] < s[1][0] ? s[0][0] : s[1][0],
    eMaxX: s[0][0] > s[1][0] ? s[0][0] : s[1][0],
    eMinY: s[0][1] < s[1][1] ? s[0][1] : s[1][1],
    eMaxY: s[0][1] > s[1][1] ? s[0][1] : s[1][1],
  }
}

function edgeBounds(edgeSegs: [Pt, Pt][]): EdgeBounds {
  const bounds: EdgeBounds = {
    eMinX: Number.POSITIVE_INFINITY,
    eMinY: Number.POSITIVE_INFINITY,
    eMaxX: Number.NEGATIVE_INFINITY,
    eMaxY: Number.NEGATIVE_INFINITY,
  }
  for (const s of edgeSegs) {
    const segment = segmentBounds(s)
    if (segment.eMinX < bounds.eMinX) bounds.eMinX = segment.eMinX
    if (segment.eMaxX > bounds.eMaxX) bounds.eMaxX = segment.eMaxX
    if (segment.eMinY < bounds.eMinY) bounds.eMinY = segment.eMinY
    if (segment.eMaxY > bounds.eMaxY) bounds.eMaxY = segment.eMaxY
  }
  return bounds
}

// Build the spatial edge index used by each candidate step; querying it avoids changing the exact ec/epp terms.
function buildEdgeIndex(edgeSegs: [Pt, Pt][]): EdgeIndex {
  // A one-grid-step candidate can only interact with edge segments whose bbox is within EDGECLR: a crossing
  // needs bbox overlap, and parDist < EDGECLR needs the segment within EDGECLR and overlapping in extent.
  const ESCELL = 48
  const { eMinX, eMinY, eMaxX, eMaxY } = edgeBounds(edgeSegs)
  const eCols = edgeSegs.length
    ? Math.max(1, Math.ceil((eMaxX - eMinX) / ESCELL) + 1)
    : 1
  const eRows = edgeSegs.length
    ? Math.max(1, Math.ceil((eMaxY - eMinY) / ESCELL) + 1)
    : 1
  const index: EdgeIndex = {
    eRows,
    eCols,
    eMinX,
    eMinY,
    eBuckets: Array.from({ length: eCols * eRows }, (): number[] => []),
    eStamp: new Int32Array(edgeSegs.length),
    eQid: 0,
    eCol: (x: number) => clamp(Math.floor((x - eMinX) / ESCELL), 0, eCols - 1),
    eRow: (y: number) => clamp(Math.floor((y - eMinY) / ESCELL), 0, eRows - 1),
  }
  for (let idx = 0; idx < edgeSegs.length; idx++)
    bucketSegment(index, edgeSegs[idx], idx)
  return index
}

function hless(a: ANode, b: ANode): boolean {
  return a.f < b.f || (a.f === b.f && a.seq < b.seq)
}

function hpush(heap: AHeap, n: ANode): void {
  n.seq = heap.pushSeq++
  heap.nodes.push(n)
  let c = heap.nodes.length - 1
  while (c > 0) {
    const p = (c - 1) >> 1
    if (!hless(heap.nodes[c], heap.nodes[p])) break
    const t = heap.nodes[c]
    heap.nodes[c] = heap.nodes[p]
    heap.nodes[p] = t
    c = p
  }
}

interface EdgePenalties {
  ec: number
  ep: number
}

function visitEdgeBucket(
  a: Pt,
  b: Pt,
  edgeSegs: [Pt, Pt][],
  index: EdgeIndex,
  bucket: number[],
  penalties: EdgePenalties,
): void {
  for (const idx of bucket) {
    if (index.eStamp[idx] === index.eQid) continue
    index.eStamp[idx] = index.eQid
    const s2 = edgeSegs[idx]
    if (segsCross(a, b, s2[0], s2[1])) penalties.ec++
    const d = parDist(a, b, s2[0], s2[1])
    if (d < penalties.ep) penalties.ep = d
  }
}

function edgePenalties(
  a: Pt,
  b: Pt,
  edgeSegs: [Pt, Pt][],
  index: EdgeIndex,
): EdgePenalties {
  // Query the candidate bbox inflated by EDGECLR; the captured segments are exactly those that can affect ec/epp.
  index.eQid++
  const penalties: EdgePenalties = { ec: 0, ep: 1e9 }
  const qc0 = index.eCol(Math.min(a[0], b[0]) - EDGECLR)
  const qc1 = index.eCol(Math.max(a[0], b[0]) + EDGECLR)
  const qr0 = index.eRow(Math.min(a[1], b[1]) - EDGECLR)
  const qr1 = index.eRow(Math.max(a[1], b[1]) + EDGECLR)
  for (let c = qc0; c <= qc1; c++)
    for (let r = qr0; r <= qr1; r++)
      visitEdgeBucket(
        a,
        b,
        edgeSegs,
        index,
        index.eBuckets[c * index.eRows + r],
        penalties,
      )
  return penalties
}

// Compute one candidate's complete cost in the original order: length, turn, crossings, clearance, and edge proximity.
function stepCost(
  cur: ANode,
  a: Pt,
  b: Pt,
  di: number,
  dj: number,
  edgeSegs: [Pt, Pt][],
  edgeIndex: EdgeIndex,
  clearObs: ABox[],
): number {
  const turn = cur.di !== null && (di !== cur.di || dj !== cur.dj) ? 40 : 0
  const { ec, ep } = edgePenalties(a, b, edgeSegs, edgeIndex)
  let cl = 1e9
  for (const B of clearObs) {
    const d = B.kind === 'container' ? wallDist(a, b, B) : boxDist(a, b, B)
    if (d < cl) cl = d
  }
  const cp = cl < COMFORT ? (COMFORT - cl) * COMFW : 0
  const epp = ep < EDGECLR ? (EDGECLR - ep) * COMFW : 0
  return (
    Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) + turn + ec * 1500 + cp + epp
  )
}

function heuristic(i: number, j: number, grid: AGrid): number {
  return (
    Math.abs(grid.X[i] - grid.X[grid.gi]) +
    Math.abs(grid.Y[j] - grid.Y[grid.gj])
  )
}

function nextNode(
  cur: ANode,
  di: number,
  dj: number,
  context: SearchContext,
): ANode | null {
  const { grid, boxes, edgeSegs, edgeIndex, clearObs } = context
  // di/dj are always set together (paired entry direction) — the null-guard covers both.
  if (cur.di !== null && cur.dj !== null && di === -cur.di && dj === -cur.dj)
    return null // forbid 180° reversal
  const ni = cur.i + di
  const nj = cur.j + dj
  if (ni < 0 || nj < 0 || ni >= grid.X.length || nj >= grid.Y.length)
    return null
  if (!grid.ok[ni * grid.Yl + nj]) return null
  const a: Pt = [grid.X[cur.i], grid.Y[cur.j]]
  const b: Pt = [grid.X[ni], grid.Y[nj]]
  if (boxes.some((B) => segHitsABox(a, b, B))) return null
  const g = cur.g + stepCost(cur, a, b, di, dj, edgeSegs, edgeIndex, clearObs)
  return {
    i: ni,
    j: nj,
    g,
    f: g + heuristic(ni, nj, grid),
    di,
    dj,
    prev: cur,
    seq: 0,
  }
}

function expandNeighbors(cur: ANode, context: SearchContext): void {
  for (const [di, dj] of ASTAR_DIRECTIONS) {
    const next = nextNode(cur, di, dj, context)
    if (next) hpush(context.heap, next)
  }
}

function search(
  grid: AGrid,
  boxes: ABox[],
  inDir: [number, number],
  edgeSegs: [Pt, Pt][],
  forbidDir: [number, number] | null,
  clearObs: ABox[],
  edgeIndex: EdgeIndex,
): ANode | null {
  // Open set = binary min-heap keyed (f, seq). seq preserves the old stable-sort FIFO tie order exactly.
  const heap: AHeap = { nodes: [], pushSeq: 0 }
  // The branching here is the binary-heap invariant; keeping it intact preserves the validated tie-breaking port.
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: binary-heap sift-down after pop; the branching is the heap invariant (task 469 baseline)
  function hpop(): ANode {
    const top = heap.nodes[0]
    const last = heap.nodes.pop() as ANode
    if (heap.nodes.length) {
      heap.nodes[0] = last
      let c = 0
      for (;;) {
        const l = 2 * c + 1
        const r = 2 * c + 2
        let m = c
        if (l < heap.nodes.length && hless(heap.nodes[l], heap.nodes[m])) m = l
        if (r < heap.nodes.length && hless(heap.nodes[r], heap.nodes[m])) m = r
        if (m === c) break
        const t = heap.nodes[c]
        heap.nodes[c] = heap.nodes[m]
        heap.nodes[m] = t
        c = m
      }
    }
    return top
  }
  hpush(heap, {
    i: grid.si,
    j: grid.sj,
    g: 0,
    f: heuristic(grid.si, grid.sj, grid),
    di: inDir[0],
    dj: inDir[1],
    prev: null,
    seq: 0,
  })
  // seen key = cell index folded with the entry direction (di,dj ∈ {-1,0,1} → 0..8). Numeric (was a
  // `${i}_${j}|${di},${dj}` string), identical dedup semantics.
  const seen = new Map<number, number>()
  const context: SearchContext = {
    grid,
    boxes,
    edgeSegs,
    edgeIndex,
    clearObs,
    heap,
  }
  while (heap.nodes.length) {
    const cur = hpop()
    const sk =
      (cur.i * grid.Yl + cur.j) * 9 +
      ((cur.di ?? 0) + 1) * 3 +
      ((cur.dj ?? 0) + 1)
    const prevG = seen.get(sk)
    if (prevG !== undefined && prevG <= cur.g) continue
    seen.set(sk, cur.g)
    if (cur.i === grid.gi && cur.j === grid.gj) {
      // forbid arriving at the goal in a direction that would REVERSE the fixed entry stub (overshoot)
      if (forbidDir && cur.di === forbidDir[0] && cur.dj === forbidDir[1])
        continue
      return cur
    }
    expandNeighbors(cur, context)
  }
  return null
}

// Reconstruct the accepted heap path and remove only collinear interior points, exactly as the old tail did.
function reconstruct(goalNode: ANode, X: number[], Y: number[]): Pt[] {
  const path: Pt[] = []
  let n: ANode | null = goalNode
  while (n) {
    path.unshift([X[n.i], Y[n.j]])
    n = n.prev
  }
  // drop collinear interior points
  const out: Pt[] = [path[0]]
  for (let i = 1; i < path.length - 1; i++) {
    const a = out[out.length - 1]
    const c = path[i]
    const d = path[i + 1]
    if (
      (Math.abs(a[0] - c[0]) < 0.5 && Math.abs(c[0] - d[0]) < 0.5) ||
      (Math.abs(a[1] - c[1]) < 0.5 && Math.abs(c[1] - d[1]) < 0.5)
    )
      continue
    out.push(c)
  }
  out.push(path[path.length - 1])
  return out
}

// A* on a Hanan grid. `boxes` = HARD obstacles; `clearObs` = SOFT clearance set (+ containers). Returns
// the routed middle polyline, or null if no path.
export function astar(
  start: Pt,
  goal: Pt,
  boxes: ABox[],
  inDir: [number, number],
  edgeSegs: [Pt, Pt][],
  forbidDir: [number, number] | null,
  clearObs: ABox[],
): Pt[] | null {
  const grid = buildGrid(start, goal, boxes, clearObs)
  const edgeIndex = buildEdgeIndex(edgeSegs)
  const goalNode = search(
    grid,
    boxes,
    inDir,
    edgeSegs,
    forbidDir,
    clearObs,
    edgeIndex,
  )
  return goalNode ? reconstruct(goalNode, grid.X, grid.Y) : null
}
