// D2 layout model + metrics + the dagre engine (task 474 — extracted verbatim from d2-render.ts).
// The engine-neutral `Layout` IR (and the Sizer contract), the leaf sizing
// (leafInfo/textShapeBox/…), the classification the engines share
// (classify/buildNearNodes/computeGridInfo), and the DEFAULT dagre engine
// (layoutDagre + renderD2Graph). The ELK engine lives in elk-layout.ts and produces the same Layout;
// toSVG renders either.
import dagre from '@dagrejs/dagre'
import { chopAtRect, type Rect } from './d2-geometry'
import {
  ceil,
  CELL_PAD,
  CODE_CHAR_W,
  CODE_FONT,
  CODE_PAD,
  EDGE_FONT_SIZE,
  FONT_SIZE,
  HEADER_H,
  INNER_PAD,
  LABEL_LH,
  P,
  PROSE_LH,
  ROW_H,
  SQRT2,
  TEXT_PAD,
} from './d2-consts'
import type { D2Edge, D2Graph, D2Shape } from './d2-wasm'

export type Sizer = (
  text: string,
  fontSize?: number,
) => { w: number; h: number } // import to type a custom measure fn

function dimsToFit(
  shape: string,
  w: number,
  h: number,
): { w: number; h: number } {
  switch (shape) {
    case 'square': {
      const s = ceil(Math.max(w + P, h + P))
      return { w: s, h: s }
    }
    case 'circle': {
      const d = ceil(SQRT2 * Math.max(w + P / SQRT2, h + P / SQRT2))
      return { w: d, h: d }
    }
    case 'oval': {
      const t = Math.atan2(h, w)
      return {
        w: ceil(SQRT2 * (w + P * Math.cos(t))),
        h: ceil(SQRT2 * (h + P * Math.sin(t))),
      }
    }
    case 'diamond':
      return { w: ceil(2 * (w + 10)), h: ceil(2 * (h + 20)) }
    case 'hexagon':
      return { w: ceil(1.5 * (w + 20)), h: ceil(1.5 * (h + 20)) }
    case 'cylinder':
      return { w: ceil(w + P), h: ceil(h + 20 + 72) }
    case 'parallelogram':
      return { w: ceil(w + P + 52), h: ceil(h + P) }
    case 'document':
      return { w: ceil(w + P), h: ceil(((h + 29.59) * 18.925) / 14) }
    case 'page':
      return { w: ceil(w + P), h: ceil(h + 60.348) }
    // The cases below match d2 v0.7.1 lib/shape GetDimensionsToFit so labels fit the bespoke
    // geometry the toSVG switch now draws for these shapes (previously they fell through to a
    // plain rectangle box). ARC=24 (defaultArcDepth), wedge constants per shape.
    case 'queue':
      // shape_queue: 1 arc left + 2 arcs right (3*24), padX=20
      return { w: ceil(w + 3 * 24 + 20), h: ceil(h + P) }
    case 'stored_data':
      // shape_stored_data: 2 side wedges (15) + padX=30
      return { w: ceil(w + 2 * 15 + 30), h: ceil(h + P) }
    case 'step':
      // shape_step: 2 wedges (35) + padX=10, padY += wedge
      return { w: ceil(w + 2 * 35 + 10), h: ceil(h + P + 35) }
    case 'callout':
      // shape_callout: a downward tail adds tipHeight (45) below the body
      return { w: ceil(w + P), h: ceil(h + 45 + 20) }
    case 'package':
      // shape_package: a top tab band above the label (≈ measured +52 over the content box)
      return { w: ceil(w + P), h: ceil(h + 52) }
    case 'cloud':
      // shape_cloud: the puffy body needs generous room around the centred label
      return { w: ceil(w * 1.4 + 30), h: ceil(h * 1.6 + 30) }
    case 'person': {
      // shape_person: a square figure with the label rendered BELOW it — reserve a label band
      // under a square figure sized from the label height.
      const band = FONT_SIZE + 8
      const fig = ceil(h + 28)
      return { w: ceil(Math.max(fig, w)), h: fig + band }
    }
    default:
      return { w: ceil(w + P), h: ceil(h + P) } // rectangle/"": (40,40)
  }
}

function shapeBox(shape: string, m: { w: number; h: number }) {
  return dimsToFit(shape, m.w + INNER_PAD, m.h + INNER_PAD)
}

// Box for a multi-line shape:text / shape:code label (task 124 #2). text → proportional Sizer per
// line; code → monospace estimate (the Sizer has no mono font). Returns the FINAL padded box and
// bypasses dimsToFit, whose 40px rectangle padding is wrong for borderless prose / a tight code panel.
export function textShapeBox(
  shape: string,
  label: string,
  measure: Sizer,
): { w: number; h: number } {
  const lines = String(label).split('\n')
  const isCode = shape === 'code'
  const fs = isCode ? CODE_FONT : FONT_SIZE
  const pad = isCode ? CODE_PAD : TEXT_PAD
  let cw = 0
  if (isCode) {
    const cols = lines.reduce((m, l) => Math.max(m, l.length), 1)
    cw = cols * CODE_CHAR_W * CODE_FONT
  } else {
    for (const l of lines) cw = Math.max(cw, measure(l).w)
  }
  return {
    w: ceil(cw + 2 * pad),
    h: ceil(lines.length * fs * PROSE_LH + 2 * pad),
  }
}

// Contrast label colour: with an explicit fill the colour is theme-independent, so pick black/white
// by luminance. Without a fill (transparent), follow the theme via currentColor.
export function headerBandH(label: string): number {
  const lines = String(label || '').split('\n').length
  return lines < 2 ? HEADER_H : ceil(lines * FONT_SIZE * LABEL_LH + 12)
}

function sqlTableSize(
  s: D2Shape,
  measure: Sizer,
): { w: number; h: number; cols: number[] } {
  const cols = [0, 0, 0] // name | type | constraint
  for (const c of s.columns || []) {
    cols[0] = Math.max(cols[0], measure(c.name).w)
    cols[1] = Math.max(cols[1], measure(c.type || '').w)
    cols[2] = Math.max(cols[2], measure(c.constraint || '').w)
  }
  const headerW = measure(s.label).w
  const bodyW = cols[0] + cols[1] + cols[2] + CELL_PAD * 4
  const w = ceil(Math.max(headerW + CELL_PAD * 2, bodyW, 120))
  const h = headerBandH(s.label) + (s.columns?.length || 0) * ROW_H
  return { w, h, cols }
}

function classSize(s: D2Shape, measure: Sizer): { w: number; h: number } {
  const line = (
    m: { name: string; type?: string; visibility?: string },
    method: boolean,
  ) =>
    `${vis(m.visibility)} ${m.name}${m.type ? (method ? ' ' : ': ') + m.type : ''}`
  let maxW = measure(s.label).w
  for (const f of s.fields || [])
    maxW = Math.max(maxW, measure(line(f, false)).w)
  for (const m of s.methods || [])
    maxW = Math.max(maxW, measure(line(m, true)).w)
  const w = ceil(maxW + CELL_PAD * 2)
  const h =
    headerBandH(s.label) +
    ((s.fields?.length || 0) + (s.methods?.length || 0)) * ROW_H +
    (s.methods?.length ? 1 : 0)
  return { w, h }
}

export function vis(v?: string): string {
  return v === 'private' ? '-' : v === 'protected' ? '#' : '+'
}

// ============================================================================
// Engine-neutral layout model. Both the dagre and ELK layout passes produce a
// `Layout`; `toSVG` renders it. This lets the layout engine be swapped (the
// `vmarkd.diagram.d2.layout` setting) without touching the SVG generation.
// ============================================================================
export type NodeKind = 'container' | 'grid' | 'sql' | 'class' | 'shape'
export interface GridInfo {
  cols: number
  cellW: number
  cellH: number
  children: D2Shape[]
  headerH: number
}
export interface PlacedNode {
  s: D2Shape
  x: number // absolute top-left (no margin)
  y: number
  w: number
  h: number
  kind: NodeKind
  sqlCols?: number[]
  grid?: GridInfo
  // Viewport-pinned `near: <constant>` shape (task 126A): excluded from the layout engine, obstacles
  // and the tight bbox; positioned in toSVG relative to the final drawing bounds. Holds the constant.
  near?: string
}
// Explicit connection style (task 124 #1). Absent fields → the renderer keeps the theme default
// (sty.edge stroke / width 2). `animated` flows the dashes via a reduced-motion-safe CSS class.
export interface EdgeStyle {
  stroke?: string
  strokeWidth?: string
  strokeDash?: string
  opacity?: string
  animated?: boolean
}
// Pack a graph edge's explicit style for the renderer; undefined when it set none (keep the default).
export function edgeStyle(e: D2Edge): EdgeStyle | undefined {
  if (!e.stroke && !e.strokeWidth && !e.strokeDash && !e.opacity && !e.animated)
    return undefined
  return {
    stroke: e.stroke,
    strokeWidth: e.strokeWidth,
    strokeDash: e.strokeDash,
    opacity: e.opacity,
    animated: e.animated,
  }
}
export interface PlacedEdge {
  points: [number, number][]
  srcArrow: boolean
  dstArrow: boolean
  style?: EdgeStyle // explicit connection style (task 124 #1)
  // Per-end arrowhead shape + label (task 128); undefined → fall back to srcArrow/dstArrow (triangle/none).
  srcArrowhead?: { shape: string; label?: string }
  dstArrowhead?: { shape: string; label?: string }
  label?: string
  lx?: number
  ly?: number
  lw?: number // label box width (for the on-line mask, task 122)
  lh?: number
  src?: string // endpoint node ids — lets toSVG spot parallel/antiparallel pairs (task 122)
  dst?: string
  // sql_table column-row endpoints (task 133); when set, toSVG attaches the edge end to that
  // column's row of the table node instead of the node-box centre.
  srcColumnIndex?: number
  dstColumnIndex?: number
}
export interface Layout {
  W: number
  H: number
  nodes: PlacedNode[]
  edges: PlacedEdge[]
  edgeStyle: 'spline' | 'orthogonal'
}

// Which shapes are non-grid containers (laid out compound/hierarchically) vs grid containers
// (children placed manually) — shared by both layout engines.
export function classify(graph: D2Graph) {
  const byId = new Map<string, D2Shape>()
  for (const s of graph.shapes) byId.set(s.id, s)
  const parents = new Set<string>()
  for (const s of graph.shapes) if (s.container) parents.add(s.container)
  const gridIds = new Set<string>()
  for (const s of graph.shapes)
    if (s.special.isGrid && parents.has(s.id)) gridIds.add(s.id)
  const containers = new Set<string>()
  for (const id of parents) if (!gridIds.has(id)) containers.add(id)
  const inGrid = (s: D2Shape) => !!s.container && gridIds.has(s.container)
  return { byId, parents, gridIds, containers, inGrid }
}

// The 8 viewport-constant `near:` keys (task 126A). A shape pinned to one of these is pulled OUT of
// the layout flow and placed relative to the final drawing bounds. Any OTHER nearKey is a shape id
// (the relative "near another shape" form) — still unsupported (Phase B), so it stays a fallback.
const NEAR_CONSTANTS = new Set([
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
])
export function isNearConstant(key?: string): boolean {
  return !!key && NEAR_CONSTANTS.has(key)
}

// Build the PlacedNodes for viewport-pinned `near:` shapes (task 126A): sized like normal leaves but
// flagged `near` (= the constant) with x/y left at 0 — toSVG positions them once the drawing bounds
// are known. Shared by both layout engines so the two paths stay in sync.
export function buildNearNodes(
  graph: D2Graph,
  measure: Sizer,
  gridInfo: Map<string, GridInfo>,
): PlacedNode[] {
  const out: PlacedNode[] = []
  for (const s of graph.shapes) {
    if (!isNearConstant(s.special.nearKey)) continue
    const li = leafInfo(s, measure, gridInfo)
    out.push({
      s,
      x: 0,
      y: 0,
      w: li.w,
      h: li.h,
      kind: li.kind,
      sqlCols: li.sqlCols,
      grid: li.grid,
      near: s.special.nearKey,
    })
  }
  return out
}

export function computeGridInfo(
  graph: D2Graph,
  measure: Sizer,
  gridIds: Set<string>,
): Map<string, GridInfo> {
  const out = new Map<string, GridInfo>()
  for (const id of gridIds) {
    const s = graph.shapes.find((x) => x.id === id)!
    const children = graph.shapes.filter((c) => c.container === id)
    const n = children.length || 1
    const gc = s.special.gridColumns ? Number(s.special.gridColumns) : 0
    const gr = s.special.gridRows ? Number(s.special.gridRows) : 0
    const cols = gc || (gr ? ceil(n / gr) : ceil(Math.sqrt(n)))
    let cellW = 0
    let cellH = 0
    for (const c of children) {
      const b = shapeBox(c.shape, measure(c.label))
      cellW = Math.max(cellW, b.w)
      cellH = Math.max(cellH, b.h)
    }
    const headerH = s.label ? measure(s.label).h + 12 : 0
    out.set(id, {
      cols,
      cellW: cellW + 16,
      cellH: cellH + 16,
      children,
      headerH,
    })
  }
  return out
}

// Size + kind of a LEAF (a shape that is not a non-grid container): grid container, sql_table,
// class, or a normal shape. Used by both layout engines to size dagre/ELK nodes.
export function leafInfo(
  s: D2Shape,
  measure: Sizer,
  gridInfo: Map<string, GridInfo>,
): {
  w: number
  h: number
  kind: NodeKind
  sqlCols?: number[]
  grid?: GridInfo
} {
  if (gridInfo.has(s.id)) {
    const gi = gridInfo.get(s.id)!
    const rows = ceil(gi.children.length / gi.cols)
    return {
      w: gi.cols * gi.cellW + 16,
      h: rows * gi.cellH + gi.headerH + 16,
      kind: 'grid',
      grid: gi,
    }
  }
  if (s.shape === 'sql_table') {
    const sz = sqlTableSize(s, measure)
    return { w: sz.w, h: sz.h, kind: 'sql', sqlCols: sz.cols }
  }
  if (s.shape === 'class') {
    const sz = classSize(s, measure)
    return { w: sz.w, h: sz.h, kind: 'class' }
  }
  // |md| markdown text shape (task 154): the box comes from the OFFSCREEN MEASURE of the
  // Lute-rendered HTML (mdSize, attached by custom-diagrams before layout) — the Sizer would
  // measure the RAW markdown lines, not the formatted render. TEXT_PAD here mirrors the
  // foreignObject div's inline padding in toSVG; keep the two in sync.
  if (s.shape === 'text' && s.mdHtml && s.mdSize) {
    return {
      w: ceil(s.mdSize.w + 2 * TEXT_PAD),
      h: ceil(s.mdSize.h + 2 * TEXT_PAD),
      kind: 'shape',
    }
  }
  // text/code carry multi-line prose; size them from line count, not the single-line label box.
  if (s.shape === 'text' || s.shape === 'code') {
    return { ...textShapeBox(s.shape, s.label, measure), kind: 'shape' }
  }
  // Task 129 — an explicit style.font-size must size the box too, else a bigger label clips against
  // a box measured at the default FONT_SIZE. sql_table/class/text/code (above) have their own
  // specialized multi-line sizing and are out of scope; this covers the plain/image leaf paths.
  const fs = s.fontSize ? Number(s.fontSize) : undefined
  // image has no text to size from (label is usually just the id) — floor to a default picture box.
  if (s.shape === 'image') {
    const b = shapeBox(s.shape, measure(s.label, fs))
    return { w: Math.max(b.w, 96), h: Math.max(b.h, 72), kind: 'shape' }
  }
  const box = shapeBox(s.shape, measure(s.label, fs))
  return { w: box.w, h: box.h, kind: 'shape' }
}

export // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dagre graph construction + full node/edge/container placement pass; pre-existing (task 469 baseline) — task 474 decomposes this
function layoutDagre(graph: D2Graph, measure: Sizer): Layout {
  const { gridIds, containers, inGrid } = classify(graph)
  const gridInfo = computeGridInfo(graph, measure, gridIds)
  const g: any = new (dagre as any).graphlib.Graph({
    compound: true,
    multigraph: true,
  })
  g.setGraph({
    // Root direction (task 127): d2 down/up/right/left → dagre TB/BT/LR/RL.
    rankdir:
      (
        { down: 'TB', up: 'BT', right: 'LR', left: 'RL' } as Record<
          string,
          string
        >
      )[graph.direction || 'down'] ?? 'TB',
    nodesep: 60,
    ranksep: 100,
    edgesep: 20,
    marginx: 10,
    marginy: 10,
  })
  g.setDefaultEdgeLabel(() => ({}))

  for (const s of graph.shapes) {
    if (inGrid(s)) continue
    if (isNearConstant(s.special.nearKey)) continue // pinned out of layout (task 126A)
    if (containers.has(s.id)) {
      g.setNode(s.id, {
        src: s,
        kind: 'container',
        headerH: measure(s.label).h + 10,
      })
    } else {
      const li = leafInfo(s, measure, gridInfo)
      g.setNode(s.id, {
        width: li.w,
        height: li.h,
        src: s,
        kind: li.kind,
        sqlCols: li.sqlCols,
        grid: li.grid,
      })
    }
  }
  for (const s of graph.shapes) {
    if (inGrid(s) || gridIds.has(s.id)) continue
    if (s.container && containers.has(s.container) && g.hasNode(s.container))
      g.setParent(s.id, s.container)
  }
  // Task 104 leftover: dagre THROWS ("Cannot set properties of undefined (setting 'rank')") on any
  // edge whose endpoint is a compound node — its rank pass only walks leaves, so a container
  // endpoint has no rank entry. `gateway -> frontend` (an edge to a container) is ordinary D2 and
  // used to take the whole diagram to the LOUD raw-text fallback under the DEFAULT engine, while
  // rendering fine under `elk`. Route such an edge against a representative LEAF inside the
  // container instead, remembering the container so the polyline can be re-chopped at its border
  // after layout (below) — dagre chops at the proxy child's box, which sits inside the container.
  const proxyOf = new Map<string, string>()
  for (const id of containers) {
    // Deepest-first is wrong here: the shallowest leaf keeps the edge visually closest to the
    // container's own border, which is where it gets chopped back to anyway.
    const leaf = graph.shapes.find(
      (s) =>
        s.container === id &&
        !containers.has(s.id) &&
        !gridIds.has(s.id) &&
        g.hasNode(s.id),
    )
    if (leaf) proxyOf.set(id, leaf.id)
  }
  // Container endpoints an edge was actually rerouted through, keyed by dagre's edge name.
  const rerouted = new Map<string, { src?: string; dst?: string }>()
  let ei = 0
  for (const e of graph.edges) {
    if (!g.hasNode(e.src) || !g.hasNode(e.dst)) continue
    const srcIsC = containers.has(e.src)
    const dstIsC = containers.has(e.dst)
    const lsrc = srcIsC ? proxyOf.get(e.src) : e.src
    const ldst = dstIsC ? proxyOf.get(e.dst) : e.dst
    // An empty container has no leaf to stand in for it, and a container edged to its own
    // descendant would collapse to a self-loop — drop the edge rather than crash the diagram.
    if (!lsrc || !ldst || lsrc === ldst) continue
    const name = `e${ei++}`
    if (srcIsC || dstIsC)
      rerouted.set(name, {
        src: srcIsC ? e.src : undefined,
        dst: dstIsC ? e.dst : undefined,
      })
    const el = e.label ? measure(e.label, EDGE_FONT_SIZE) : { w: 0, h: 0 }
    g.setEdge(
      lsrc,
      ldst,
      {
        label: e.label || '',
        width: el.w,
        height: el.h,
        srcArrow: e.srcArrow,
        dstArrow: e.dstArrow,
        style: edgeStyle(e), // task 124 #1
        srcArrowhead: e.srcArrowhead, // task 128
        dstArrowhead: e.dstArrowhead,
        srcColumnIndex: e.srcColumnIndex, // task 133
        dstColumnIndex: e.dstColumnIndex,
      },
      name,
    )
  }
  ;(dagre as any).layout(g)

  const gg = g.graph()
  const nodes: PlacedNode[] = []
  // Rect per node id (container rects included), reused below to chop the rerouted edges back to
  // their container's border (see `proxyOf` above) — same box every PlacedNode is built from here.
  const rectById = new Map<string, Rect>()
  for (const id of g.nodes()) {
    const n = g.node(id)
    const rect = {
      x: n.x - n.width / 2,
      y: n.y - n.height / 2,
      w: n.width,
      h: n.height,
    }
    rectById.set(id, rect)
    nodes.push({
      s: n.src,
      ...rect,
      kind: n.kind,
      sqlCols: n.sqlCols,
      grid: n.grid,
    })
  }
  // Viewport-pinned near shapes — positioned by toSVG, not the engine (task 126A).
  nodes.push(...buildNearNodes(graph, measure, gridInfo))
  const edges: PlacedEdge[] = []
  for (const eo of g.edges()) {
    const e = g.edge(eo)
    let points = e.points.map((p: any): [number, number] => [p.x, p.y])
    const via = rerouted.get(eo.name)
    if (via) {
      const sr = via.src ? rectById.get(via.src) : undefined
      const dr = via.dst ? rectById.get(via.dst) : undefined
      if (sr) points = chopAtRect(points, sr, 'src')
      if (dr) points = chopAtRect(points, dr, 'dst')
    }
    edges.push({
      points,
      srcArrow: e.srcArrow,
      dstArrow: e.dstArrow,
      style: e.style, // task 124 #1
      srcArrowhead: e.srcArrowhead, // task 128
      dstArrowhead: e.dstArrowhead,
      srcColumnIndex: e.srcColumnIndex, // task 133
      dstColumnIndex: e.dstColumnIndex,
      label: e.label,
      lx: e.x,
      ly: e.y,
    })
  }
  return {
    W: ceil(gg.width),
    H: ceil(gg.height),
    nodes,
    edges,
    edgeStyle: 'spline',
  }
}
