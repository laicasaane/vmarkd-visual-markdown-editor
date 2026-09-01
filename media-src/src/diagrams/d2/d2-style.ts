// D2 theme/style layer (task 474 — extracted verbatim from d2-render.ts). The palette → D2Style
// mapping (task 119), the named d2-* catalog themes + editor-paired themes, and the shape paint/text
// attribute emitters. Pure: everything is a function of its inputs, no module state.
import {
  MERMAID_PALETTES,
  luminance,
  mix,
} from '../../../../src/shared/mermaid-palettes'
import { pairedPalette } from '../../../../src/shared/theme-registry'
import { FONT_SIZE } from './d2-consts'
import type { D2Shape } from './d2-wasm'

function labelColor(fill?: string): string {
  if (!fill || fill === 'transparent' || fill[0] !== '#') return 'currentColor'
  const hex = fill.replace('#', '')
  if (hex.length < 6) return 'currentColor'
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b < 140 ? '#ffffff' : '#0a0f25'
}

// The resolved paint for one shape: the effective fill/stroke/width plus the raw (unformatted) dash /
// opacity when set. Shared by the crisp attribute string (paintAttrs) AND the sketch emit (d2-sketch),
// so both read exactly the same colours — sketch only changes the DRAWING, never the colour (task 120).
export interface Paint {
  fill: string
  stroke: string
  strokeWidth: number
  dash?: string | number // raw s.strokeDash when > 0 (crisp: stroke-dasharray "d,d")
  opacity?: string | number // raw s.opacity when != 1
}
// The hand-drawn emit surface (task 120, media-src/src/d2-sketch.ts). toSVG stays PURE — when sketch mode
// is on it renders through an INJECTED Sketch and never imports rough.js itself. Each method returns the
// SVG for one shape/edge as wobbly rough.js <path>s; `seed` (djb2 of the shape id) keeps it deterministic.
export interface Sketch {
  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    p: Paint,
    seed: number,
  ): string
  ellipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    p: Paint,
    seed: number,
  ): string
  polygon(points: number[][], p: Paint, seed: number): string
  path(d: string, p: Paint, seed: number): string
  edge(d: string, p: Paint, seed: number, extra?: string): string
}

// Resolve a shape's effective paint (fallback-only defaults, task 119) into the shared Paint struct.
// `defaultStroke`/`defaultFill` are the palette defaults used only when the shape sets none — an explicit
// source `style:{fill/stroke}` always wins. dash/opacity keep their RAW source values so the crisp string
// is byte-identical to the pre-struct code.
export function resolvePaint(
  s: Partial<D2Shape>,
  defaultFill: string,
  defaultStroke = 'currentColor',
): Paint {
  return {
    fill: s.fill || defaultFill,
    stroke: s.stroke || defaultStroke,
    strokeWidth: s.strokeWidth ? Number(s.strokeWidth) : 2,
    dash: s.strokeDash && Number(s.strokeDash) > 0 ? s.strokeDash : undefined,
    opacity: s.opacity && Number(s.opacity) !== 1 ? s.opacity : undefined,
  }
}

// Crisp SVG paint attributes from a resolved Paint (B: strokeWidth/strokeDash/opacity + stroke/fill).
function paintAttrsFrom(p: Paint): string {
  let a = `fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}"`
  if (p.dash != null) a += ` stroke-dasharray="${p.dash},${p.dash}"`
  if (p.opacity != null) a += ` opacity="${p.opacity}"`
  return a
}

// Common shape paint attributes from D2 style — the crisp path (unchanged output; now via resolvePaint).
export function paintAttrs(
  s: Partial<D2Shape>,
  defaultFill: string,
  defaultStroke = 'currentColor',
): string {
  return paintAttrsFrom(resolvePaint(s, defaultFill, defaultStroke))
}

// Task 119 — D2-style auto-colour. A content-paired palette ({bg,fg,line,accent,muted}) → the default
// fill/stroke a shape uses when it has no explicit style. Theme-aware: tints derive from the palette so
// they read on light AND dark (no baked background — the canvas stays transparent over the themed
// surface). No palette → today's monochrome (transparent fill, currentColor stroke).
interface D2Palette {
  bg: string
  fg: string
  line?: string
  accent?: string
  muted?: string
}
export interface D2Style {
  leafFill: string // d2 B6 — leaf shape fill (near-white in light themes)
  leafStroke: string // d2 B1 — every shape + connection stroke
  contFill: string // d2 B4 — level-0 container fill (see `fills` for the nesting cascade)
  contStroke: string // d2 B1
  contOpacity: string
  edge: string // d2 B1 — connection lines + arrowheads
  bg?: string // d2 N7 — page background rect (undefined = transparent canvas, follows the editor)
  mono: boolean
  // Full d2 token map for FAITHFUL sql_table / class / label colouring (verified against the binary).
  // In mono these all collapse to currentColor/transparent so the legacy monochrome look is preserved.
  text: string // d2 N1 — node + container labels
  textMuted: string // d2 N2 — edge labels (italic) + sql column type
  paper: string // d2 N7 — sql_table/class body fill
  accent: string // d2 B2 — sql column name / class +- visibility
  accent2: string // d2 AA2 — sql constraint / class field type
  fills: string[] // d2 [B4,B5,B6,N7] — container fill by nesting depth (index = level, clamped)
  // sql_table / class CHROME (task 381). Split out of text/paper so the d2-* catalog themes keep d2's
  // faithful look (dark N1 ink on white N7 paper) while the editor-paired palettes can mute it: those
  // map N1 to the palette FOREGROUND, so on a dark theme a solid N1 header band plus an N1 border and
  // N1 row dividers turned every table into a near-white slab that outshouted the muted shapes and
  // connectors around it. Only the chrome moved; the body fill and the column text keep their tokens.
  tableBorder: string // box border + row/section dividers (d2 N1)
  tableHeaderFill: string // solid header band (d2 N1)
  tableHeaderText: string // title drawn on that band (d2 N7)
}
export function paletteStyle(p?: D2Palette): D2Style {
  if (!p)
    return {
      leafFill: 'transparent',
      leafStroke: 'currentColor',
      contFill: 'transparent',
      contStroke: 'currentColor',
      contOpacity: '0.04',
      edge: 'currentColor',
      mono: true,
      text: 'currentColor',
      textMuted: 'currentColor',
      paper: 'transparent',
      accent: 'currentColor',
      accent2: 'currentColor',
      fills: ['transparent', 'transparent', 'transparent', 'transparent'],
      tableBorder: 'currentColor',
      tableHeaderFill: 'currentColor',
      tableHeaderText: 'currentColor',
    }
  // Mirror mermaid's palette→theme mapping (paletteToThemeVariables in mermaid-palettes.ts) so D2 and
  // mermaid render the SAME content palette IDENTICALLY on the same editor theme: NEUTRAL surface fills
  // (bg+fg mix) + LINE-coloured borders/edges, with the saturated `accent` reserved for emphasis
  // (sql_table/class accents — mermaid likewise uses accent only for notes). Previously D2 used
  // accent-tinted fills + accent borders, which diverged from mermaid (e.g. purple boxes on
  // material/one-dark where mermaid draws grey). `bg`/`paper` stay the palette bg (pairedTheme sets
  // bg:undefined → transparent; paper still fills sql_table/class bodies).
  const accent = p.accent || p.line || p.fg
  const line = p.line ?? mix(p.bg, p.fg, 0.35)
  const dark = luminance(p.bg) < 0.5
  const surface = mix(p.bg, p.fg, dark ? 0.1 : 0.05) // node fill   (mermaid primaryColor / mainBkg)
  const surface2 = mix(p.bg, p.fg, dark ? 0.16 : 0.09) // container (mermaid clusterBkg / secondBkg)
  return {
    leafFill: surface,
    leafStroke: line,
    contFill: surface2,
    contStroke: line,
    contOpacity: '1',
    edge: line,
    bg: p.bg, // paint the editor background (pairedTheme overrides to undefined = transparent)
    mono: false,
    text: p.fg,
    textMuted: mix(p.bg, p.fg, 0.6),
    paper: p.bg,
    accent,
    accent2: accent,
    fills: [surface2, surface, mix(p.bg, p.fg, dark ? 0.06 : 0.03), p.bg],
    // Chrome at the same weight as every other shape in the diagram: the line-coloured border a plain
    // rectangle already uses, and a header band that is a RAISED SURFACE rather than a slab of
    // foreground. See the D2Style field comments for why the faithful N1 mapping breaks here.
    // The band gets its OWN mix rather than reusing surface/surface2: those are the container fills
    // (`fills` above), so a table nested in a container would paint its header in exactly the parent's
    // background and the band would read as a hole with the title floating in it. This value sits
    // clear of every entry in `fills` at any nesting depth.
    tableBorder: line,
    tableHeaderFill: mix(p.bg, p.fg, dark ? 0.24 : 0.14),
    tableHeaderText: p.fg,
  }
}

// Named colour themes for D2 diagrams, selected via `vmde.diagram.d2Theme`. The `d2-*` themes are
// FAITHFUL ports of d2 v0.7.1's own token mapping (every token + element→token assignment verified
// against the real `d2` binary): leaf fill=B6, every stroke + connection=B1, container fill cascades
// B4→B5→B6→N7 by nesting depth, labels=N1, edge labels=N2 (italic), page=N7; sql_table/class use the
// NEUTRAL tokens (white N7 body, dark N1 border + solid N1 header with N7 text, column name=B2,
// type=N2, constraint=AA2). 'mono' keeps the original currentColor behaviour (no page background).
const d2Catalog = (t: {
  N1: string
  N2: string
  N7: string
  B1: string
  B2: string
  B4: string
  B5: string
  B6: string
  AA2: string
}): D2Style => ({
  leafFill: t.B6,
  leafStroke: t.B1,
  contFill: t.B4,
  contStroke: t.B1,
  contOpacity: '1',
  edge: t.B1,
  bg: t.N7,
  mono: false,
  text: t.N1,
  textMuted: t.N2,
  paper: t.N7,
  accent: t.B2,
  accent2: t.AA2,
  fills: [t.B4, t.B5, t.B6, t.N7],
  tableBorder: t.N1,
  tableHeaderFill: t.N1,
  tableHeaderText: t.N7,
})

// Editor-paired themes (vscode/github light+dark) — mirror the mermaid palette look: SUBTLE accent-
// tinted fills (not d2's saturated tokens), accent borders + edges. Reuses MERMAID_PALETTES.
// NO page background (bg: undefined): these themes sit on the TRANSPARENT webview body, which already
// shows the editor's own background — so painting an opaque page rect in the palette's *assumed* bg
// would clash whenever the user's actual VS Code / content theme differs from it. The palette bg still
// drives the tinted fills (leafFill/contFill/fills/paper); only the page rect is dropped. Contrast:
// the d2-* catalog themes DO bake a page bg on purpose (so they look identical on any editor).
const pairedTheme = (id: string): D2Style => ({
  ...paletteStyle(MERMAID_PALETTES[id]),
  bg: undefined,
})

const D2_THEMES: Record<string, D2Style> = {
  // d2 catalog — full token sets pulled verbatim from `d2 --theme=<id>` (v0.7.1).
  'd2-original': d2Catalog({
    N1: '#0A0F25',
    N2: '#676C7E',
    N7: '#FFFFFF',
    B1: '#0D32B2',
    B2: '#0D32B2',
    B4: '#E3E9FD',
    B5: '#EDF0FD',
    B6: '#F7F8FE',
    AA2: '#4A6FF3',
  }), // Neutral default (0)
  'd2-neutral-grey': d2Catalog({
    N1: '#0A0F25',
    N2: '#676C7E',
    N7: '#FFFFFF',
    B1: '#0A0F25',
    B2: '#676C7E',
    B4: '#CFD2DD',
    B5: '#DEE1EB',
    B6: '#EEF1F8',
    AA2: '#676C7E',
  }), // Neutral Grey (1)
  'd2-cool-classics': d2Catalog({
    N1: '#0A0F25',
    N2: '#676C7E',
    N7: '#FFFFFF',
    B1: '#000536',
    B2: '#0F66B7',
    B4: '#87BFF3',
    B5: '#BCDDFB',
    B6: '#E5F3FF',
    AA2: '#076F6F',
  }), // Cool classics (4)
  'd2-dark-mauve': d2Catalog({
    N1: '#CDD6F4',
    N2: '#BAC2DE',
    N7: '#1E1E2E',
    B1: '#CBA6F7',
    B2: '#CBA6F7',
    B4: '#585B70',
    B5: '#45475A',
    B6: '#313244',
    AA2: '#F38BA8',
  }), // Dark Mauve (200)
  'd2-terminal': d2Catalog({
    N1: '#000410',
    N2: '#0000B8',
    N7: '#FFFFFF',
    B1: '#000410',
    B2: '#0000E4',
    B4: '#E7E9EE',
    B5: '#F5F6F9',
    B6: '#FFFFFF',
    AA2: '#008566',
  }), // Terminal (300)
  // editor-paired (mermaid-style tints)
  'vscode-light': pairedTheme('vscode-light-2026'),
  'vscode-dark': pairedTheme('vscode-dark-2026'),
  'github-light': pairedTheme('github-light'),
  'github-dark': pairedTheme('github-dark'),
}

// 'auto' theme: pair the palette to the active CONTENT theme — the same layer-1 mapping mermaid/echarts
// use (pairedPalette → MERMAID_PALETTES) — so D2 follows the editor environment. When the content theme
// is itself 'auto' (no pinned palette) we fall back to a neutral zinc ramp by the editor's light/dark
// mode, mirroring resolveEchartsTheme. Page bg stays transparent (editor-paired) so it blends in.
function autoPairedStyle(
  contentTheme?: string,
  mode: 'dark' | 'light' = 'light',
): D2Style {
  const fallback = mode === 'dark' ? 'zinc-dark' : 'zinc-light'
  const pal =
    MERMAID_PALETTES[pairedPalette(contentTheme) ?? fallback] ??
    MERMAID_PALETTES[fallback]
  return { ...paletteStyle(pal), bg: undefined }
}

// Resolve a theme NAME to its style. 'auto' → content-theme-paired (needs contentTheme/mode). Unknown /
// 'mono' / undefined → the monochrome currentColor style, so existing diagrams are unchanged unless a
// colour theme is explicitly selected.
export function d2Theme(
  name?: string,
  contentTheme?: string,
  mode?: 'dark' | 'light',
  accessibilityPalette?: D2Palette,
): D2Style {
  if (accessibilityPalette)
    return { ...paletteStyle(accessibilityPalette), bg: undefined }
  if (name === 'auto') return autoPairedStyle(contentTheme, mode)
  return (name && D2_THEMES[name]) || paletteStyle()
}

// Label paint: explicit fontColor > contrast-vs-fill > currentColor; + bold/italic. `effFill` is the
// palette default fill the shape actually got (task 119) — contrast the label against THAT (not the
// undefined source fill) so text stays legible on a coloured tint on light AND dark themes.
export function textAttrs(
  s: Partial<D2Shape>,
  fontSize = FONT_SIZE,
  effFill?: string,
  themeText?: string,
  hachured = false,
): string {
  // d2 paints labels with its N1 token regardless of fill (passed as themeText). An explicit source
  // fontColor still wins; an explicit source fill falls back to contrast-vs-fill; else themeText (N1),
  // else currentColor (mono).
  // Task 396 — `hachured` (sketch mode) disables the contrast-vs-fill branch. d2-sketch paints
  // fills as rough.js hachure (fillStyle 'hachure', 6px gap, 1.2px lines), so an explicit
  // style.fill covers only a fraction of the shape and the PAGE is what is behind most of the
  // glyph. Picking the label colour by that fill's luminance contrasts against a backdrop that is
  // barely there — a dark-blue `Styled` node got white text on a light page. The theme's own text
  // colour is right by construction there, because it already contrasts the page.
  const color =
    s.fontColor ||
    (s.fill && !hachured ? labelColor(s.fill) : themeText) ||
    labelColor(effFill)
  // Task 129 — an explicit `style.font-size` overrides the caller's default (FONT_SIZE / EDGE_FONT_SIZE
  // etc). leafInfo threads the same value into the sizer so the shape's box grows to fit, else a
  // bigger font would clip against a box sized for the default.
  const fs = s.fontSize ? Number(s.fontSize) : fontSize
  let a = `font-size="${fs}" fill="${color}"`
  if (s.bold) a += ' font-weight="700"'
  if (s.italic) a += ' font-style="italic"'
  if (s.underline) a += ' text-decoration="underline"' // task 129
  return a
}
