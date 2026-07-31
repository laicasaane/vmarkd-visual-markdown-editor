// Spike harness for task 453's "verify-then-migrate" step: does the chromium harness render
// Vditor's NATIVE fenced-block diagram renderers (abc, graphviz, flowchart) faithfully, the way
// it already renders mermaid (mermaid-harness.ts, task 59)? `diagram-width.spec.ts` /
// `diagram-sizing.spec.ts` (real-VS-Code-only today) measure exactly these three plus mermaid —
// if they render here with real content and real geometry, the two sizing specs are migratable
// without needing our custom diagram-runtime wiring (installDiagramRuntime, custom-diagrams-
// harness.ts) at all: abc/graphviz/flowchart/mermaid are all Vditor built-ins, auto-detected by
// fenced-block language the same way mermaid already is — no bespoke mount code needed per
// language, unlike wavedrom/nomnoml/geojson/topojson/stl/vega/d2 (task 101/103/99/100/104,
// which DO need installDiagramRuntime).
//
// Also mounts `echarts` (task 453 `diagram-width` migration) — also a Vditor-native renderer
// (`chartRender`, same family as abc/graphviz/flowchart/mermaid, no installDiagramRuntime), used
// by `diagram-width.spec.ts`'s narrow-viewport shrink check. The 8-note abc tune below renders
// ~770px wide (measured) — wider than the narrow 700px viewport that spec's migration uses, so
// the shrink-to-fit assertion is actually exercised, not vacuously true.
import '../src/boot/preload'
import Vditor from 'vditor/src/index'
import { installEchartsResize } from '../src/diagrams/echarts-fit'

const value = `# diagram mount spike

\`\`\`abc
X:1
T:Spike
M:4/4
L:1/4
K:C
C D E F | G A B c |
\`\`\`

\`\`\`graphviz
digraph G {
  A -> B;
  B -> C;
  C -> A;
}
\`\`\`

\`\`\`flowchart
st=>start: Start
e=>end: End
st->e
\`\`\`

\`\`\`mermaid
graph TD
  A[Start] --> B[End]
\`\`\`

\`\`\`echarts
{"xAxis":{"type":"category","data":["A","B","C","D","E"]},"yAxis":{"type":"value"},"series":[{"type":"bar","data":[5,20,36,10,12]}]}
\`\`\`
`

const editor = new Vditor('app', {
  cache: { enable: false },
  mode: 'wysiwyg',
  height: 700,
  cdn: `${location.origin}/vditor`,
  value,
  customWysiwygToolbar: () => {},
  after() {
    ;(window as any).vditor = editor
    // task 453 `diagram-width` migration — echarts renders its canvas at pixel dimensions set by
    // JS at render time, so shrinking the CSS container alone (unlike the SVG diagrams above)
    // does not resize it; the real editor's finish-init.ts wires this via
    // installDiagramRuntime → installEchartsResize (ResizeObserver + window-resize, both
    // dedupe-guarded, see echarts-fit.ts's own header). Installed directly here (bare Vditor
    // harness, no full finish-init) so the narrow-viewport shrink check below is real, not a
    // silent no-op like `width.spec.ts`'s comments warn about.
    installEchartsResize(window as Parameters<typeof installEchartsResize>[0])
    // Mirrors diagram-width.spec.ts's own measurement shape (`.vditor-wysiwyg__preview >
    // .language-X` / `code.language-X`, first `svg, canvas` inside) so a positive result here
    // is a direct, apples-to-apples stand-in for that spec's real-VS-Code assertion.
    ;(window as any).__measure = (lang: string) => {
      const host = document.querySelector(
        `.vditor-wysiwyg__preview > .language-${lang}, .vditor-wysiwyg__preview > code.language-${lang}`,
      ) as HTMLElement | null
      if (!host) return { found: false }
      const gfx = host.querySelector('svg, canvas')
      if (!gfx)
        return {
          found: true,
          hasGraphic: false,
          html: host.outerHTML.slice(0, 300),
        }
      const rect = gfx.getBoundingClientRect()
      return {
        found: true,
        hasGraphic: true,
        tag: gfx.tagName,
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      }
    }
    // task 453 `diagram-width` migration — the column width every measurement is compared
    // against, same selector the real spec reads.
    ;(window as any).__col = () =>
      Math.round(
        (
          document.querySelector('.vditor-wysiwyg__preview') as HTMLElement
        ).getBoundingClientRect().width,
      )
    ;(window as any).__ready = true
  },
})
