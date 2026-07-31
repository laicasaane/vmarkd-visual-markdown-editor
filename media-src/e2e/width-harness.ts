import '../src/boot/preload'
import Vditor from 'vditor'
import { applyBodyOptions } from '../src/boot/live-config'

// Narrow-width centring harness (full-width OFF). Mirrors how main.ts drives the
// body-attribute layout: applyBodyOptions sets data-full-width / data-heading-markers,
// which main.css keys off to centre the 800px text column. The spec measures that the
// IR editor, the Preview pane, and markers-on vs markers-off all centre identically
// (equal left/right margins, no Edit↔Preview horizontal shift).
//
// Task 453 — also carries the echarts width-parity contract migrated from
// test/vscode-e2e/preview-width.spec.ts: the Preview content column (and therefore an echarts
// chart's CONTAINER) must be the same width as the edit column, never wider. echarts is a
// Vditor-native fenced-block renderer (same mechanism as mermaid/abc/graphviz/flowchart — no
// installDiagramRuntime wiring needed, confirmed working in echarts-harness.ts, task 89/90), so
// a plain `echarts` block in this harness's existing document renders a real canvas without any
// extra setup; the real spec's theme-pairing calls (resolveEchartsTheme/applyEchartsTheme) were
// about COLOUR, not geometry, so they're not needed for this width-only contract.
const echartsOption = {
  xAxis: { type: 'category', data: ['A', 'B', 'C', 'D', 'E'] },
  yAxis: { type: 'value' },
  series: [{ type: 'bar', data: [5, 20, 36, 10, 12] }],
}
const head = [
  '# First heading',
  '',
  'Paragraph under the first heading with enough text to span a good part of the column so its box width is meaningful to measure.',
  '',
  '## Second heading',
  '',
  'A reference link to [CommonMark][cm] and more body text here.',
  '',
  '[cm]: https://spec.commonmark.org/ "CommonMark spec"',
  '',
  '```echarts',
  JSON.stringify(echartsOption),
  '```',
  '',
]
// Pad the document tall enough to force a vertical scrollbar in BOTH the editor and
// the preview pane — the Edit↔Preview shift is a scrollbar-position artefact, so a
// short doc (no scrollbar) hides it.
const filler: string[] = []
for (let i = 0; i < 80; i++) {
  filler.push(
    `### Section ${i}`,
    '',
    `Body paragraph number ${i} with some text.`,
    '',
  )
}
const value = [...head, ...filler].join('\n')

// The two layout flags are INDEPENDENT: __setMarkers must not reset the width mode (it
// used to, via a defaulted parameter, so "markers off in full width" was untestable —
// the very state whose gutter regressed).
let markers = true
let fullWidth = false
function setLayout() {
  applyBodyOptions({ enableFullWidth: fullWidth, showHeadingMarkers: markers })
}

// Start narrow + markers on.
setLayout()
;(window as any).__setMarkers = (on: boolean) => {
  markers = on
  setLayout()
}
;(window as any).__setFullWidth = (on: boolean) => {
  fullWidth = on
  setLayout()
}

const editor = new Vditor('app', {
  cache: { enable: false },
  mode: 'ir',
  cdn: `${location.origin}/vditor`,
  value,
  // A real Preview toolbar button so the spec can toggle the preview pane.
  toolbar: ['preview'],
  customWysiwygToolbar: () => {},
  after() {
    ;(window as any).vditor = editor
    ;(window as any).__ready = true
  },
})
