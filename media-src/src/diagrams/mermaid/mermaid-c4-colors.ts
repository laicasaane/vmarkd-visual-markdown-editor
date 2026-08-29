import {
  contrastRatio,
  mix,
  toHex,
} from '../../../../src/shared/mermaid-palettes'

interface MermaidC4Boxes {
  person: string
  system: string
  container: string
  component: string
  external: string
}

export interface MermaidC4Colors {
  /** Relationship + boundary labels (they sit on the PAGE background). Omit → keep mermaid's. */
  text?: string
  /** Relationship lines, arrowheads, boundary frames. Omit → keep mermaid's. */
  line?: string
  /** Box fill ramp. Omit → keep mermaid's canonical C4 fills (the ink pass still runs). */
  boxes?: MermaidC4Boxes
}

/**
 * In-box ink. Mermaid hard-codes #FFFFFF for EVERY box label, which is 2.0:1 on its own
 * `#85BBF0` component fill (WCAG wants 4.5:1) — unreadable in every theme, ours included.
 * We repaint each box's labels with whichever of these two contrasts better against that
 * box's own fill, so the rule holds for fills we never remap (external, custom `UpdateElementStyle`).
 */
const LIGHT_INK = '#ffffff'
const DARK_INK = '#0d1b2a'

/** Mermaid's canonical C4 fills → the ramp slot they map to (its `class` is always `person-man`). */
const DEFAULT_FILLS: Record<string, keyof MermaidC4Boxes> = {
  '#08427b': 'person',
  '#1168bd': 'system',
  '#438dd5': 'container',
  '#85bbf0': 'component',
  '#999999': 'external',
}

/** Shapes a C4 element can be drawn as — `Container`/`SystemDb`/`Queue` are paths, not rects. */
const SHAPE_SELECTOR = 'rect, path, polygon, circle, ellipse'

const inkFor = (fill: string): string =>
  contrastRatio(fill, LIGHT_INK) >= contrastRatio(fill, DARK_INK)
    ? LIGHT_INK
    : DARK_INK

const isFilled = (fill: string | null): fill is string =>
  !!fill && fill !== 'none' && fill !== 'transparent'

const normalizeRgb = (value: string): string => {
  const match = value.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i)
  return match
    ? toHex(Number(match[1]), Number(match[2]), Number(match[3]))
    : value
}

// Mermaid 11.17 moved C4 box colours from SVG attributes to inline `!important` styles. Read and
// write through the channel Mermaid used so its inline style cannot override our remapped ramp.
const presentationValue = (el: Element, property: string): string | null => {
  const inline = (el as SVGElement).style?.getPropertyValue(property)
  const value = inline || el.getAttribute(property)
  return value ? normalizeRgb(value) : null
}

const setPresentationValue = (
  el: Element,
  property: string,
  value: string,
): void => {
  const style = (el as SVGElement).style
  if (style?.getPropertyValue(property)) {
    style.setProperty(property, value, style.getPropertyPriority(property))
    return
  }
  el.setAttribute(property, value)
}

/** Arrowhead markers are recoloured wholesale from `colors.line`, so skip them in the shape pass. */
const isDecoration = (el: Element): boolean => !!el.closest('marker, defs')

/**
 * Mermaid C4 bypasses themeVariables entirely: relationship labels/lines/boundaries are emitted as
 * #444444 and every in-box label as #FFFFFF, inline on the elements. Recolour only the C4 SVG so
 * other mermaid diagrams keep their renderer-provided styling.
 *
 * Two classes of text, two references: labels INSIDE a box must contrast with that box's fill,
 * everything else with the page background. Painting both from one palette colour is what made
 * dark text land on the dark `person` box (1.6:1) on light palettes.
 */
export function styleMermaidC4(
  container: ParentNode,
  colors: MermaidC4Colors | null,
): void {
  const svg = container.querySelector('svg[aria-roledescription="c4"]')
  if (!svg) return
  const { text, line, boxes } = colors ?? {}

  // Pass 1 — boxes: remap the fill, derive the border from it, ink the labels it contains.
  const boxLabels = new Set<Element>()
  svg.querySelectorAll(SHAPE_SELECTOR).forEach((shape) => {
    const fill = presentationValue(shape, 'fill')
    if (!isFilled(fill) || isDecoration(shape)) return
    const slot = DEFAULT_FILLS[fill.toLowerCase()]
    const nextFill = (slot && boxes?.[slot]) || fill
    const ink = inkFor(nextFill)
    setPresentationValue(shape, 'fill', nextFill)
    // Mermaid's own borders are a hand-picked shade of each canonical fill; derive ours the same
    // way (a step toward the ink) so a remapped box keeps a visible, in-family edge.
    if (presentationValue(shape, 'stroke')) {
      setPresentationValue(shape, 'stroke', mix(nextFill, ink, 0.25))
    }
    // Mermaid 11.17 nests person shapes inside `g.basic.label-container` while keeping their text
    // in a sibling `g.label`; the enclosing semantic node is the stable box-to-label boundary.
    const box = shape.closest('g.node.c4-shape') ?? shape.parentElement
    box?.querySelectorAll('text').forEach((label) => {
      setPresentationValue(label, 'fill', ink)
      boxLabels.add(label)
    })
  })

  if (!line && !text) return

  // Pass 2 — everything drawn on the page background: relationship labels/lines/arrowheads and
  // the dashed boundary frames (fill-less shapes).
  if (text) {
    svg.querySelectorAll('text').forEach((label) => {
      if (!boxLabels.has(label)) setPresentationValue(label, 'fill', text)
    })
  }
  if (!line) return
  // A relationship is a `<line>` when straight and a `<path>` when curved (BiRel, Rel_Back) — the
  // curved ones kept #444444 while their arrowheads were already recoloured. `rect` picks up the
  // dashed boundary frames. Fill-less only, so box shapes drawn as paths are safe.
  svg.querySelectorAll('line, path[stroke], rect[stroke]').forEach((el) => {
    if (isFilled(presentationValue(el, 'fill')) || isDecoration(el)) return
    el.setAttribute('stroke', line)
  })
  svg.querySelectorAll('marker path').forEach((path) => {
    path.setAttribute('fill', line)
    path.setAttribute('stroke', line)
  })
}
