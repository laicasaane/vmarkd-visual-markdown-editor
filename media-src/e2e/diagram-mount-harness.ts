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
import '../src/boot/preload'
import Vditor from 'vditor/src/index'

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
    ;(window as any).__ready = true
  },
})
