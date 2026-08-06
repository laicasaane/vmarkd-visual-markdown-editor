// Shared theme-agnostic SVG post-processing used by more than one offline renderer. Task 502
// (jscpd) flagged graphviz-render.ts and plantuml-render.ts each carrying a byte-identical copy
// of this loop — same recolor rule (baked foreground ink, and any <text> with no fill attr at
// all — the SVG default black — both follow the theme via currentColor), different renderer,
// different literal colour set per engine's own default skin.

/** Repaint `svg`'s baked foreground ink to currentColor: any element whose `fill`/`stroke`
 *  attribute is in `foreground`, plus any `<text>` with no `fill` attr (SVG's implicit black). */
export function paintForegroundToCurrentColor(
  svg: SVGSVGElement,
  foreground: ReadonlySet<string>,
): void {
  for (const el of Array.from(svg.querySelectorAll('[fill], [stroke]'))) {
    if (foreground.has(el.getAttribute('fill') ?? ''))
      el.setAttribute('fill', 'currentColor')
    if (foreground.has(el.getAttribute('stroke') ?? ''))
      el.setAttribute('stroke', 'currentColor')
  }
  for (const t of Array.from(svg.querySelectorAll('text'))) {
    if (!t.getAttribute('fill')) t.setAttribute('fill', 'currentColor')
  }
}
