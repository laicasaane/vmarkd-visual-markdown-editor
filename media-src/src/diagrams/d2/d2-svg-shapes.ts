// Bespoke shape drawing (task 474 — extracted verbatim from d2-render.ts). Each shape's SVG
// emission lives here; toSVG dispatches to these + the per-shape leaf drawers (task 474). Grid
// children + sql_table/class rows are laid out here too.
import { CELL_PAD, EDGE_FONT_SIZE, FONT_SIZE, ROW_H } from './d2-consts'
import type { GridInfo } from './d2-layout'
import type { D2Style } from './d2-style'
import type { D2Shape } from './d2-wasm'
import {
  anchorFlow,
  esc2,
  labelAnchorFor,
  labelRows,
  transformLabel,
} from './d2-svg-paths'
import { paintAttrs, textAttrs } from './d2-style'
import { headerBandH, vis } from './d2-layout'

export function drawGrid(
  s: D2Shape,
  gi: GridInfo,
  left: number,
  top: number,
  w: number,
  h: number,
  sty: D2Style,
  // Task 396 — grid labels need to know whether the fills around them are hachure, same as every
  // other shape label; drawGrid is outside toSVG's closure so it has to be handed the flag.
  hachured = false,
): string {
  const out: string[] = []
  const rx = s.borderRadius || 6
  // Grid container = a level-0 container fill (d2 B4); cells are leaves (B6).
  const cfill = sty.mono ? sty.contFill : sty.fills[0]
  out.push(
    `<rect x="${left.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx}" ${paintAttrs(s, cfill, sty.contStroke)} fill-opacity="${s.fill ? '1' : sty.contOpacity}"/>`,
  )
  if (s.label) {
    // Task 134 — `label.near` overrides the default top-left header position when set.
    const gla = labelAnchorFor(s.labelPosition, left, top, w, h)
    const glx = gla ? gla.x : left + 8
    const gly = gla ? gla.y : top + gi.headerH - 6
    const glaAttrs = gla
      ? ` text-anchor="${gla.anchor}"${gla.baseline ? ` dominant-baseline="${gla.baseline}"` : ''}`
      : ''
    out.push(
      // The grid header sits on the BOTTOM of its band (top + headerH - 6), so extra rows grow UP
      // inside the band computeGridInfo already sized from measure(label).h.
      `<text x="${glx.toFixed(1)}" y="${gly.toFixed(1)}"${glaAttrs} ${textAttrs(s, FONT_SIZE, cfill, sty.text, hachured)}>${labelRows(transformLabel(s.label, s.textTransform), glx, gly, FONT_SIZE, anchorFlow(gla?.baseline, 'up'))}</text>`,
    )
  }
  const ox = left + 8
  const oy = top + gi.headerH + 8
  gi.children.forEach((c, i) => {
    const col = i % gi.cols
    const row = Math.floor(i / gi.cols)
    const cw = gi.cellW - 16
    const ch = gi.cellH - 16
    const cx = ox + col * gi.cellW + 8
    const cy = oy + row * gi.cellH + 8
    out.push(
      `<rect x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" rx="${c.borderRadius || 4}" ${paintAttrs(c, sty.leafFill, sty.leafStroke)}/>`,
    )
    out.push(
      `<text x="${(cx + cw / 2).toFixed(1)}" y="${(cy + ch / 2).toFixed(1)}" text-anchor="middle" dominant-baseline="central" ${textAttrs(c, FONT_SIZE, sty.leafFill, sty.text, hachured)}>${labelRows(c.label, cx + cw / 2, cy + ch / 2, FONT_SIZE, 'center')}</text>`,
    )
  })
  return out.join('\n')
}

// Chrome shared by drawSqlTable/drawClass (task 381 — the panel-header colouring already documents the
// token mapping as shared; this is the SVG emission side of that, factored out task 502): body rect +
// solid header band + header title text. Pushes onto the caller's `out` and returns the tokens the
// caller still needs (border for row dividers, hh for row Y offsets). Member/field-row colouring
// (nameC/typeC/etc.) is NOT shared — sql_table and class map those to different D2Style tokens.
export function drawTablePanelHeader(
  s: D2Shape,
  left: number,
  top: number,
  w: number,
  h: number,
  sty: D2Style,
  out: string[],
): { border: string; hh: number } {
  const border = s.stroke || (sty.mono ? 'currentColor' : sty.tableBorder)
  const body = s.fill || (sty.mono ? 'transparent' : sty.paper)
  const headerFill = sty.mono ? 'currentColor' : sty.tableHeaderFill
  const headerOp = sty.mono ? ' fill-opacity="0.12"' : ''
  const headerText =
    s.fontColor || (sty.mono ? 'currentColor' : sty.tableHeaderText)
  out.push(
    `<rect x="${left.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${body}" stroke="${border}" stroke-width="${s.strokeWidth || 2}"/>`,
  )
  const hh = headerBandH(s.label) // taller than HEADER_H only for a multi-line title (task 493)
  out.push(
    `<rect x="${left.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${hh}" rx="4" fill="${headerFill}"${headerOp}/>`,
  )
  out.push(
    `<text x="${(left + w / 2).toFixed(1)}" y="${(top + hh / 2).toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="${FONT_SIZE}" font-weight="700" fill="${headerText}">${labelRows(s.label, left + w / 2, top + hh / 2, FONT_SIZE, 'center')}</text>`,
  )
  return { border, hh }
}

export function drawSqlTable(
  s: D2Shape,
  cols: number[],
  left: number,
  top: number,
  w: number,
  h: number,
  sty: D2Style,
): string {
  const out: string[] = []
  // Faithful d2 sql_table colouring (verified against the binary): NEUTRAL body (N7 fill, N1 border),
  // a SOLID N1 header with N7 title text, dividers in N1, and columns name=B2 / type=N2 /
  // constraint=AA2. The three chrome tokens carry that mapping for the d2-* themes; the editor-paired
  // palettes remap them to muted values (task 381 — see D2Style). In mono there are no fixed colours,
  // so fall back to the original subtle look (transparent body, currentColor border, faint header
  // tint, currentColor text).
  const { border, hh } = drawTablePanelHeader(s, left, top, w, h, sty, out)
  const nameC = sty.mono ? 'currentColor' : sty.accent
  const typeC = sty.mono ? 'currentColor' : sty.textMuted
  const consC = sty.mono ? 'currentColor' : sty.accent2
  const dim = sty.mono ? ' opacity="0.7"' : '' // mono dims type/constraint; themed uses full tokens
  ;(s.columns || []).forEach((c, i) => {
    const ry = top + hh + i * ROW_H
    out.push(
      `<line x1="${left.toFixed(1)}" y1="${ry.toFixed(1)}" x2="${(left + w).toFixed(1)}" y2="${ry.toFixed(1)}" stroke="${border}" stroke-width="1"${sty.mono ? ' stroke-opacity="0.3"' : ''}/>`,
    )
    const ty = ry + ROW_H / 2
    out.push(
      `<text x="${(left + CELL_PAD).toFixed(1)}" y="${ty.toFixed(1)}" dominant-baseline="central" font-size="${FONT_SIZE}" fill="${nameC}">${esc2(c.name)}</text>`,
    )
    if (c.type)
      out.push(
        `<text x="${(left + CELL_PAD * 2 + cols[0]).toFixed(1)}" y="${ty.toFixed(1)}" dominant-baseline="central" font-size="${FONT_SIZE}" fill="${typeC}"${dim}>${esc2(c.type)}</text>`,
      )
    if (c.constraint)
      out.push(
        `<text x="${(left + w - CELL_PAD).toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="end" dominant-baseline="central" font-size="${EDGE_FONT_SIZE}" fill="${consC}"${dim}>${esc2(abbr(c.constraint))}</text>`,
      )
  })
  return out.join('\n')
}

export function abbr(c: string): string {
  return c
    .split(',')
    .map((x) =>
      x === 'primary_key'
        ? 'PK'
        : x === 'foreign_key'
          ? 'FK'
          : x === 'unique'
            ? 'UNQ'
            : x,
    )
    .join(' ')
}

export function drawClass(
  s: D2Shape,
  left: number,
  top: number,
  w: number,
  h: number,
  sty: D2Style,
): string {
  const out: string[] = []
  // Faithful d2 class colouring: NEUTRAL body (N7 fill, N1 border), SOLID N1 header with N7 title,
  // and members coloured per token — visibility marker=B2, name=N1, type=AA2 (via tspans). Chrome goes
  // through the same three tokens drawSqlTable uses (task 381). Mono falls back to the original subtle
  // monochrome look.
  const { border, hh } = drawTablePanelHeader(s, left, top, w, h, sty, out)
  const visC = sty.mono ? 'currentColor' : sty.accent // B2
  const nameC = sty.mono ? 'currentColor' : sty.text // N1
  const typeC = sty.mono ? 'currentColor' : sty.accent2 // AA2
  let i = 0
  const row = (
    visibility: string | undefined,
    name: string,
    type: string | undefined,
    sep: string,
  ) => {
    const ty = top + hh + i * ROW_H + ROW_H / 2
    let spans = `<tspan fill="${visC}">${esc2(vis(visibility))}</tspan> <tspan fill="${nameC}">${esc2(name)}</tspan>`
    if (type)
      spans += `<tspan fill="${nameC}">${esc2(sep)}</tspan><tspan fill="${typeC}">${esc2(type)}</tspan>`
    out.push(
      `<text x="${(left + CELL_PAD).toFixed(1)}" y="${ty.toFixed(1)}" dominant-baseline="central" font-size="${FONT_SIZE}" fill="${nameC}">${spans}</text>`,
    )
    i++
  }
  for (const f of s.fields || []) row(f.visibility, f.name, f.type, ': ')
  if ((s.methods?.length || 0) > 0) {
    const sy = top + hh + i * ROW_H
    out.push(
      `<line x1="${left.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${(left + w).toFixed(1)}" y2="${sy.toFixed(1)}" stroke="${border}" stroke-width="1"${sty.mono ? ' stroke-opacity="0.3"' : ''}/>`,
    )
  }
  for (const m of s.methods || []) row(m.visibility, m.name, m.type, ' ')
  return out.join('\n')
}

// Re-export so the ELK layout (elk-layout.ts) can render through the same path.
