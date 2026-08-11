import { contrastRatio, mix } from '../../../../src/shared/mermaid-palettes'

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
    const fill = shape.getAttribute('fill')
    if (!isFilled(fill) || isDecoration(shape)) return
    const slot = DEFAULT_FILLS[fill.toLowerCase()]
    const nextFill = (slot && boxes?.[slot]) || fill
    const ink = inkFor(nextFill)
    shape.setAttribute('fill', nextFill)
    // Mermaid's own borders are a hand-picked shade of each canonical fill; derive ours the same
    // way (a step toward the ink) so a remapped box keeps a visible, in-family edge.
    if (shape.getAttribute('stroke')) {
      shape.setAttribute('stroke', mix(nextFill, ink, 0.25))
    }
    shape.parentElement?.querySelectorAll('text').forEach((label) => {
      label.setAttribute('fill', ink)
      boxLabels.add(label)
    })
  })

  if (!line && !text) return

  // Pass 2 — everything drawn on the page background: relationship labels/lines/arrowheads and
  // the dashed boundary frames (fill-less shapes).
  if (text) {
    svg.querySelectorAll('text').forEach((label) => {
      if (!boxLabels.has(label)) label.setAttribute('fill', text)
    })
  }
  if (!line) return
  // A relationship is a `<line>` when straight and a `<path>` when curved (BiRel, Rel_Back) — the
  // curved ones kept #444444 while their arrowheads were already recoloured. `rect` picks up the
  // dashed boundary frames. Fill-less only, so box shapes drawn as paths are safe.
  svg.querySelectorAll('line, path[stroke], rect[stroke]').forEach((el) => {
    if (isFilled(el.getAttribute('fill')) || isDecoration(el)) return
    el.setAttribute('stroke', line)
  })
  svg.querySelectorAll('marker path').forEach((path) => {
    path.setAttribute('fill', line)
    path.setAttribute('stroke', line)
  })
}
