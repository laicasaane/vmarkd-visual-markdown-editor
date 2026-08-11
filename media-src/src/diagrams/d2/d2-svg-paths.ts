// Path/arrowhead/label geometry + small SVG emit helpers (task 474 — extracted verbatim from
// d2-render.ts). Pure string builders over coordinates: no layout, no theme state (styles are passed
// in). `labelAnchor` lives here too — d2-refine imports it, which used to create the d2-refine →
// d2-render dependency; with it here, the refine pipeline only imports geometry + guards.
import { CORNER_R, EDGE_FONT_SIZE, LABEL_LH } from './d2-consts'
import type { D2Style } from './d2-style'
import type { D2Shape } from './d2-wasm'

export const esc = (s: unknown) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// task 124 #5 — only make a node clickable for safe link schemes (http/https/mailto, a relative path,
// or an in-doc #/wiki ref). Blocks javascript:/vbscript:/data:/file: (defense in depth; the webview
// link handler + CSP are the other layers). Returns the trimmed href or null.
export function safeLinkHref(link?: string): string | null {
  if (!link) return null
  const t = link.trim()
  if (!t || /^(javascript|vbscript|data|file):/i.test(t)) return null
  return t
}
// Task 134 — d2 in-shape label/icon placement keywords (`label.near`/`icon.near`). Only the 9
// "inside" corner/edge/centre keywords are handled; d2's `outside-*` variants need extra box room in
// dimsToFit (deferred — see task file), so those plus anything unrecognized return null, and every
// caller below falls back to its EXISTING hardcoded position when that happens. That's what keeps
// d2-quality.test.ts byte-stable across its 8 samples (none of which set labelPosition/iconPosition).
export type InsideAnchor = {
  h: 'start' | 'middle' | 'end'
  v: 'start' | 'middle' | 'end'
}
export const INSIDE_POSITIONS: Record<string, InsideAnchor> = {
  'top-left': { h: 'start', v: 'start' },
  'top-center': { h: 'middle', v: 'start' },
  'top-right': { h: 'end', v: 'start' },
  'center-left': { h: 'start', v: 'middle' },
  'center-center': { h: 'middle', v: 'middle' },
  'center-right': { h: 'end', v: 'middle' },
  'bottom-left': { h: 'start', v: 'end' },
  'bottom-center': { h: 'middle', v: 'end' },
  'bottom-right': { h: 'end', v: 'end' },
}
export function insideAnchor(pos?: string): InsideAnchor | null {
  return (pos && INSIDE_POSITIONS[pos]) || null
}

// Label anchor for a shape's box when `label.near` is one of the 9 inside keywords above; null means
// "keep whatever the caller already computes" (unset, outside-*, or an unrecognized keyword).
export function labelAnchorFor(
  pos: string | undefined,
  left: number,
  top: number,
  w: number,
  h: number,
  padX = 8,
  padY = 6,
): { x: number; y: number; anchor: string; baseline: string } | null {
  const a = insideAnchor(pos)
  if (!a) return null
  const x =
    a.h === 'start'
      ? left + padX
      : a.h === 'end'
        ? left + w - padX
        : left + w / 2
  // 'hanging' anchors the glyph TOP at y (exact regardless of font-size); 'central' is the same
  // vertical-centre baseline this file already uses for centred labels. The bottom row deliberately
  // omits dominant-baseline (default alphabetic) — SVG's 'text-after-edge' is the "textbook correct"
  // keyword but has patchy cross-engine support, and the manual y offset already lands close enough.
  const y =
    a.v === 'start' ? top + padY : a.v === 'end' ? top + h - padY : top + h / 2
  const baseline = a.v === 'start' ? 'hanging' : a.v === 'end' ? '' : 'central'
  return { x, y, anchor: a.h, baseline }
}

// Task 129 — `style.text-transform`. SVG's CSS text-transform property is unreliable across
// renderers/exports, so d2 (and we) transform the label STRING itself instead of emitting the CSS.
export function transformLabel(label: string, transform?: string): string {
  switch (transform) {
    case 'uppercase':
      return label.toUpperCase()
    case 'lowercase':
      return label.toLowerCase()
    case 'capitalize':
      return label.replace(/\b\w/g, (c) => c.toUpperCase())
    default:
      return label
  }
}

// task 124 #3 — a small decorative icon badge, positioned at `icon.near` (task 134; default top-left
// when unset/outside-*/unrecognized). CSP gates the URL: data:/blob: always, https only when
// image.allowRemote is on (else it just won't load).
export function nodeIconImage(
  icon: string,
  x: number,
  y: number,
  w: number,
  h: number,
  pos?: string,
): string {
  const s = Math.min(24, w * 0.5, h * 0.5)
  const a = insideAnchor(pos)
  const ix =
    !a || a.h === 'start'
      ? x + 4
      : a.h === 'end'
        ? x + w - s - 4
        : x + (w - s) / 2
  const iy =
    !a || a.v === 'start'
      ? y + 4
      : a.v === 'end'
        ? y + h - s - 4
        : y + (h - s) / 2
  return `<image href="${esc(icon)}" x="${ix.toFixed(1)}" y="${iy.toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>`
}
// task 124 #5 — a transparent hit-rect carrying the <title> tooltip and/or the <a> link, drawn ON TOP
// of a node (post-pass) so hover/click beat the shape's own fill. SVG <a> routes via fixLinkClick.
export function nodeHitOverlay(
  s: Partial<D2Shape>,
  x: number,
  y: number,
  w: number,
  h: number,
): string | null {
  const tip = s.tooltip ? `<title>${esc(s.tooltip)}</title>` : ''
  const href = safeLinkHref(s.link)
  if (!tip && !href) return null
  const rect = `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="transparent" pointer-events="all"${href ? ' style="cursor:pointer"' : ''}>${tip}</rect>`
  return href ? `<a href="${esc(href)}">${rect}</a>` : rect
}

// Faithful D2 lib/shape GetDimensionsToFit. (w,h) = labelDims + INNER_PAD already applied.
export const esc2 = esc

// Task 493 — the d2 compiler keeps a REAL newline inside a label ("a\nb"), and d2 itself draws one row
// per line. SVG <text> does not break on \n, so every label went out as a single run: a 2-line label
// was drawn as one long line, WIDER than the box `canvasMeasure` had already sized for the widest
// line — text spilling out of its shape. This is the one place that turns a label into text content.
//
// `flow` says where `y` sits in the block of rows: 'center' = rows centred on it (dominant-baseline
// central, the usual in-shape label), 'down' = it is the FIRST row's baseline (a top-anchored header),
// 'up' = it is the LAST row's (a bottom-anchored one). Rows carry ABSOLUTE x/y rather than `dy`, which
// composes differently with dominant-baseline across renderers and would have to hold in an export
// too. A single-line label returns the plain escaped string, byte-identical to the pre-493 emit.
export type LabelFlow = 'center' | 'down' | 'up'
export function labelRows(
  text: string,
  x: number,
  y: number,
  fs: number,
  flow: LabelFlow,
): string {
  const lines = String(text).split('\n')
  if (lines.length < 2) return esc2(text)
  const lh = fs * LABEL_LH
  const span = (lines.length - 1) * lh
  const y0 = flow === 'center' ? y - span / 2 : flow === 'up' ? y - span : y
  return lines
    .map(
      (ln, i) =>
        `<tspan x="${x.toFixed(1)}" y="${(y0 + i * lh).toFixed(1)}">${esc2(ln)}</tspan>`,
    )
    .join('')
}

// The flow a `label.near` anchor implies (labelAnchorFor's baseline: 'hanging' = top row at y,
// 'central' = centred, '' = alphabetic/bottom row at y); `fallback` when the shape sets no anchor.
export function anchorFlow(
  baseline: string | undefined,
  fallback: LabelFlow,
): LabelFlow {
  if (baseline === undefined) return fallback
  return baseline === 'hanging'
    ? 'down'
    : baseline === 'central'
      ? 'center'
      : 'up'
}

export function splinePath(pts: number[][]): string {
  if (pts.length < 3)
    return pts
      .map(
        (p, i) =>
          `${(i === 0 ? 'M' : 'L') + p[0].toFixed(1)},${p[1].toFixed(1)}`,
      )
      .join(' ')
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

export function polyPath(pts: number[][]): string {
  return pts
    .map(
      (p, i) => `${(i === 0 ? 'M' : 'L') + p[0].toFixed(1)},${p[1].toFixed(1)}`,
    )
    .join(' ')
}

// Move `from` toward `to` by `dist` (clamped to the segment length). Mirrors D2's
// getArrowheadAdjustments: retract a route endpoint so the stroke meets the arrowhead base / shape
// border cleanly instead of poking through it (task 122).
export function towards(from: number[], to: number[], dist: number): number[] {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const len = Math.hypot(dx, dy) || 1
  const t = Math.min(dist, len) / len
  return [from[0] + dx * t, from[1] + dy * t]
}

// Orthogonal path with ROUNDED corners — mirrors D2's pathData (task 122): straight `L` to just
// before each bend, then a quadratic through the corner (control = the corner point), radius clamped
// to half of each adjacent segment so it never overshoots. < 3 points → plain polyline.
export function roundedPolyPath(pts: number[][], r = CORNER_R): string {
  if (pts.length < 3) return polyPath(pts)
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]
    const cur = pts[i]
    const next = pts[i + 1]
    const inLen = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) || 1
    const outLen = Math.hypot(next[0] - cur[0], next[1] - cur[1]) || 1
    const ru = Math.min(r, inLen / 2, outLen / 2)
    const ix = cur[0] - ((cur[0] - prev[0]) / inLen) * ru
    const iy = cur[1] - ((cur[1] - prev[1]) / inLen) * ru
    const ox = cur[0] + ((next[0] - cur[0]) / outLen) * ru
    const oy = cur[1] + ((next[1] - cur[1]) / outLen) * ru
    d += ` L${ix.toFixed(1)},${iy.toFixed(1)} Q${cur[0].toFixed(1)},${cur[1].toFixed(1)} ${ox.toFixed(1)},${oy.toFixed(1)}`
  }
  const last = pts[pts.length - 1]
  d += ` L${last[0].toFixed(1)},${last[1].toFixed(1)}`
  return d
}

// How far to retract the connection stroke from its endpoint so it meets the arrowhead base cleanly
// instead of poking through the glyph (task 128). Per shape, because a diamond is longer than a
// triangle and a crow's-foot "many" stops at its apex while "one" lets the line run to the entity.
export function arrowheadDepth(shape: string): number {
  switch (shape) {
    case 'none':
    case 'line':
      return 1
    case 'diamond':
    case 'filled-diamond':
      return 16
    case 'circle':
    case 'filled-circle':
    case 'box':
    case 'filled-box':
      return 12
    case 'cross':
    case 'cf-one':
    case 'cf-one-required':
      return 2 // the bar(s) cross the line at the entity; stroke runs to the border
    case 'cf-many':
    case 'cf-many-required':
      return 14 // line stops at the foot's apex
    default:
      return 9 // triangle / unfilled-triangle / arrow
  }
}

// arrowhead: draw the d2 arrowhead `shape` at endpoint (x,y), with the connection arriving along
// `angle` (radians, pointing TOWARD the endpoint). Returns SVG (task 128). Unfilled variants use
// fill="none" — safe because the stroke is retracted (arrowheadDepth) so no line shows through. The
// crow's-foot glyphs (cf-*) draw ER cardinality notation as short strokes at the entity border.
export function arrowhead(
  shape: string,
  x: number,
  y: number,
  angle: number,
  color: string,
): string {
  const bx = -Math.cos(angle) // back along the line, away from the node
  const by = -Math.sin(angle)
  const px = -Math.sin(angle) // perpendicular (≈ the entity border tangent)
  const py = Math.cos(angle)
  // point at (back*b + perp*p) from the endpoint, formatted "x,y"
  const at = (b: number, p: number) =>
    `${(x + bx * b + px * p).toFixed(1)},${(y + by * b + py * p).toFixed(1)}`
  switch (shape) {
    case 'none':
    case 'line':
      return ''
    case 'arrow': {
      // open barbed V (two strokes, no fill)
      const len = 11
      const a1 = angle + Math.PI - 0.4
      const a2 = angle + Math.PI + 0.4
      return `<path d="M${(x + len * Math.cos(a1)).toFixed(1)},${(y + len * Math.sin(a1)).toFixed(1)} L${x.toFixed(1)},${y.toFixed(1)} L${(x + len * Math.cos(a2)).toFixed(1)},${(y + len * Math.sin(a2)).toFixed(1)}" fill="none" stroke="${color}" stroke-width="2"/>`
    }
    case 'unfilled-triangle':
    case 'triangle': {
      const len = 10
      const a1 = angle + Math.PI - 0.4
      const a2 = angle + Math.PI + 0.4
      const pts = `${x.toFixed(1)},${y.toFixed(1)} ${(x + len * Math.cos(a1)).toFixed(1)},${(y + len * Math.sin(a1)).toFixed(1)} ${(x + len * Math.cos(a2)).toFixed(1)},${(y + len * Math.sin(a2)).toFixed(1)}`
      return shape === 'triangle'
        ? `<polygon points="${pts}" fill="${color}"/>`
        : `<polygon points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"/>`
    }
    case 'diamond':
    case 'filled-diamond': {
      const L = 16
      const W = 6
      const pts = `${at(0, 0)} ${at(L / 2, W)} ${at(L, 0)} ${at(L / 2, -W)}`
      const fill = shape === 'filled-diamond' ? color : 'none'
      return `<polygon points="${pts}" fill="${fill}" stroke="${color}" stroke-width="1.5"/>`
    }
    case 'circle':
    case 'filled-circle': {
      const r = 5.5
      const cx = x + bx * r
      const cy = y + by * r
      const fill = shape === 'filled-circle' ? color : 'none'
      return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${fill}" stroke="${color}" stroke-width="1.5"/>`
    }
    case 'box':
    case 'filled-box': {
      const S = 11
      const h = S / 2
      const pts = `${at(0, h)} ${at(0, -h)} ${at(S, -h)} ${at(S, h)}`
      const fill = shape === 'filled-box' ? color : 'none'
      return `<polygon points="${pts}" fill="${fill}" stroke="${color}" stroke-width="1.5"/>`
    }
    case 'cross': {
      // an X straddling the line near the entity (two diagonal ticks)
      const D = 8
      const W = 5
      return (
        `<line x1="${(x + bx * (D - W) + px * W).toFixed(1)}" y1="${(y + by * (D - W) + py * W).toFixed(1)}" x2="${(x + bx * (D + W) - px * W).toFixed(1)}" y2="${(y + by * (D + W) - py * W).toFixed(1)}" stroke="${color}" stroke-width="2"/>` +
        `<line x1="${(x + bx * (D - W) - px * W).toFixed(1)}" y1="${(y + by * (D - W) - py * W).toFixed(1)}" x2="${(x + bx * (D + W) + px * W).toFixed(1)}" y2="${(y + by * (D + W) + py * W).toFixed(1)}" stroke="${color}" stroke-width="2"/>`
      )
    }
    case 'cf-one':
      // a single perpendicular tick across the line near the entity (ER "one")
      return `<line x1="${(x + bx * 11 + px * 7).toFixed(1)}" y1="${(y + by * 11 + py * 7).toFixed(1)}" x2="${(x + bx * 11 - px * 7).toFixed(1)}" y2="${(y + by * 11 - py * 7).toFixed(1)}" stroke="${color}" stroke-width="2"/>`
    case 'cf-one-required':
      // two parallel ticks (ER "exactly one")
      return [9, 15]
        .map(
          (d) =>
            `<line x1="${(x + bx * d + px * 7).toFixed(1)}" y1="${(y + by * d + py * 7).toFixed(1)}" x2="${(x + bx * d - px * 7).toFixed(1)}" y2="${(y + by * d - py * 7).toFixed(1)}" stroke="${color}" stroke-width="2"/>`,
        )
        .join('')
    case 'cf-many':
    case 'cf-many-required': {
      // crow's foot: three prongs fanning from an apex (back along the line) to the entity border
      const foot = 14
      const w = 7
      const apexX = x + bx * foot
      const apexY = y + by * foot
      const prong = (dp: number) =>
        `<line x1="${apexX.toFixed(1)}" y1="${apexY.toFixed(1)}" x2="${(x + px * dp).toFixed(1)}" y2="${(y + py * dp).toFixed(1)}" stroke="${color}" stroke-width="2"/>`
      let g = prong(0) + prong(w) + prong(-w)
      if (shape === 'cf-many-required')
        // a bar behind the foot (ER "one or many")
        g += `<line x1="${(apexX + bx * 5 + px * 7).toFixed(1)}" y1="${(apexY + by * 5 + py * 7).toFixed(1)}" x2="${(apexX + bx * 5 - px * 7).toFixed(1)}" y2="${(apexY + by * 5 - py * 7).toFixed(1)}" stroke="${color}" stroke-width="2"/>`
      return g
    }
    default: {
      // unknown → default filled triangle
      const len = 10
      const a1 = angle + Math.PI - 0.4
      const a2 = angle + Math.PI + 0.4
      return `<polygon points="${x.toFixed(1)},${y.toFixed(1)} ${(x + len * Math.cos(a1)).toFixed(1)},${(y + len * Math.sin(a1)).toFixed(1)} ${(x + len * Math.cos(a2)).toFixed(1)},${(y + len * Math.sin(a2)).toFixed(1)}" fill="${color}"/>`
    }
  }
}

// Resolve the effective arrowhead shape for one end of an edge (task 128): an explicit shape from the
// source wins; otherwise fall back to the legacy boolean (present → triangle, absent → none).
export function endShape(
  head: { shape: string } | undefined,
  hasArrow: boolean,
): string {
  if (head?.shape) return head.shape
  return hasArrow ? 'triangle' : 'none'
}

// Halo behind a connection label so the line does not run THROUGH the text (user report: "labelki na
// diagramach są przecinane linią jakby tło miało przezroczyste"). d2's own renderer draws a
// background rect; we paint the glyph outline in the canvas colour instead and let `paint-order` put
// it UNDER the fill — same visual result with no box geometry to get wrong, and it follows the glyph
// shape where a rect would clip a descender.
// The colour must be the CANVAS colour, and `sty.bg` is undefined for the paired themes (transparent
// canvas that inherits the editor background — see the D2Style.bg note), so fall back to the webview's
// own background variable rather than to a hardcoded colour. Resolved at PAINT time, so a cached SVG
// re-painted under a different editor theme still gets the right halo.
export function labelHalo(sty: D2Style): string {
  // Task 394 — NOT --vscode-editor-background directly: that is the editor UI colour, and a
  // named content theme paints the PAGE a different colour (github-light is #ffffff even on a
  // dark VS Code) while main.css makes the panes transparent so the page shows through. The
  // halo must be whatever is actually BEHIND the glyph, or it stops being invisible and reads
  // as a heavy outline — measured: a dark rgb(30,30,30) halo on a white github-light page.
  // --vmarkd-page-bg is that surface; it falls back to the editor background when no named
  // theme is active, which is exactly right (transparent body -> editor shows through).
  const c =
    sty.bg ??
    'var(--vmarkd-page-bg, var(--vscode-editor-background, transparent))'
  return ` paint-order="stroke" stroke="${c}" stroke-width="4" stroke-linejoin="round"`
}

// arrowheadLabel: ER cardinality / role text (e.g. "1", "*", a role name) beside an arrowhead (task
// 128). Placed just back from the endpoint `p` and offset PERPENDICULAR to the incoming segment
// (p→neighbour `q`) so it sits beside the line rather than on it. Muted, like edge labels.
export function arrowheadLabel(
  text: string,
  p: number[],
  q: number[],
  sty: D2Style,
): string {
  const dx = p[0] - q[0]
  const dy = p[1] - q[1]
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  // back 16px from the endpoint along the line, then 11px to the side (perpendicular = (-uy,ux))
  const bx = p[0] - ux * 16 - uy * 11
  const by = p[1] - uy * 16 + ux * 11
  return `<text x="${bx.toFixed(1)}" y="${by.toFixed(1)}" font-size="${EDGE_FONT_SIZE}" text-anchor="middle" dominant-baseline="middle"${labelHalo(sty)} fill="${sty.textMuted}">${labelRows(text, bx, by, EDGE_FONT_SIZE, 'center')}</text>`
}

// (route simplification — simplifyRoute / straightenEnds + helpers — moved to d2-geometry.ts, task 123)
// Point at half the arc-length of a polyline — where an on-line label sits (D2 INSIDE_MIDDLE_CENTER).
// Candidate label positions on STRAIGHT segments of the route, never across a bend (task 122). Centring a
// label at the arc-length midpoint (the old behaviour) lands it ON a corner whenever a bend sits near
// mid-route (common for L/staircase routes) — the centred, line-masking box then covers the bend. Instead,
// for each straight run long enough to hold the box clear of BOTH corners (label width matters on a
// horizontal run, height on a vertical run), sample positions along its clear band. Results are ordered by
// closeness to the desired arc fraction, so candidates[0] is the most central choice; toSVG walks the list
// to DECONFLICT overlapping labels (try the next position when one collides). Falls back to the longest
// segment's centre if no run is long enough. `frac` lets parallel siblings stagger (1/3, 2/3, …).
export type LSeg = {
  a: number[]
  b: number[]
  len: number
  horiz: boolean
  start: number
}
export function labelCandidates(
  pts: number[][],
  lw: number,
  lh: number,
  frac = 0.5,
): number[][] {
  const n = pts.length
  if (n < 2) return [pts[0] ?? [0, 0]]
  const segs: LSeg[] = []
  let tot = 0
  for (let i = 0; i + 1 < n; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const horiz = Math.abs(a[1] - b[1]) <= Math.abs(a[0] - b[0])
    segs.push({ a, b, len, horiz, start: tot })
    tot += len
  }
  const targetD = tot * frac
  const MARGIN = 8
  const STEP = 12
  const at = (s: LSeg, along: number): number[] => {
    const t = s.len ? along / s.len : 0.5
    return [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t]
  }
  const need = (s: LSeg) => (s.horiz ? lw : lh) / 2 + MARGIN // half-extent to clear a corner along the axis
  const fit = segs.filter((s) => s.len >= 2 * need(s))
  if (!fit.length) {
    // nothing fits → longest segment, centred (minimises corner overlap)
    let s = segs[0]
    for (const c of segs) if (c.len > s.len) s = c
    return [at(s, s.len / 2)]
  }
  // PRIMARY (candidates[0]): the fitting segment whose CENTRE is nearest the target fraction, with the box
  // clamped into that segment's clear band. This is the single most-central, bend-clear spot — used as-is
  // when the label has no conflict, so non-overlapping labels are never disturbed by deconfliction.
  const clamp = (s: LSeg) =>
    Math.max(need(s), Math.min(s.len - need(s), targetD - s.start))
  let pseg = fit[0]
  let bestc = Math.abs(fit[0].start + fit[0].len / 2 - targetD)
  for (const s of fit) {
    const sc = Math.abs(s.start + s.len / 2 - targetD)
    if (sc < bestc) {
      bestc = sc
      pseg = s
    }
  }
  const primary = at(pseg, clamp(pseg))
  // ALTERNATIVES: sample every fitting segment's clear band (+ band ends + each segment's clamped target),
  // ordered by closeness to the target — walked by toSVG's deconfliction only when the primary collides.
  const alt: { pos: number[]; score: number }[] = []
  for (const s of fit) {
    const lo = need(s)
    const hi = s.len - need(s)
    for (let along = lo; along <= hi + 0.01; along += STEP)
      alt.push({
        pos: at(s, along),
        score: Math.abs(s.start + along - targetD),
      })
    alt.push({ pos: at(s, hi), score: Math.abs(s.start + hi - targetD) })
    alt.push({
      pos: at(s, clamp(s)),
      score: Math.abs(s.start + clamp(s) - targetD),
    })
  }
  alt.sort((a, b) => a.score - b.score)
  return [primary, ...alt.map((o) => o.pos)]
}
// single best position (candidates[0]); used by placeLabels for guarded parallel pairs
export function labelAnchor(
  pts: number[][],
  lw: number,
  lh: number,
  frac = 0.5,
): number[] {
  return labelCandidates(pts, lw, lh, frac)[0]
}

// Small deterministic string hash (djb2). `djb2n` → a 32-bit unsigned int, used as a stable per-shape
// rough.js `seed` (task 120) so the sketch wobble is reproducible across re-renders. `djb2` → a base36
// suffix so multiple D2 SVGs on one page don't share a <mask> id. No Math.random — toSVG stays pure.
export function djb2n(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i)
  return h >>> 0
}
export function djb2(s: string): string {
  return djb2n(s).toString(36)
}

