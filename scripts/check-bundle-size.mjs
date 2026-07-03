// Bundle-size budget gate (task 145 item 3). Fails if the eager webview bundle (or the separate ELK
// bundle) exceeds its budget — catches an engine accidentally BUNDLED into main.js instead of
// lazy-loaded (would balloon it by MBs), plus gradual dependency bloat (main.js + the VSIX doubled
// 5.1→10.3 MB across releases with no gate). Run AFTER `node build.mjs`; wired into CI.
//
// Budgets are a CEILING with headroom over the current size — bump them DELIBERATELY (with a reason)
// when a real addition lands, so an accidental jump fails loudly first.
import { statSync } from 'node:fs'

const BUDGETS = [
  // [ file (relative to repo root), maxKB, what ]
  [
    'media/dist/main.js',
    // Lowered 525→430 when the D2 pipeline was code-split out (task 165: 484→379 KB); keeps the
    // ceiling meaningful so the next eager engine leak fails loudly instead of hiding in old slack.
    430,
    'eager webview bundle — glue ONLY, every engine must lazy-load (addScript/fetch)',
  ],
  [
    'media/vditor/dist/js/elk/elk-main.js',
    1600,
    'separate ELK layout bundle — lazy, only when vmarkd.diagram.d2Layout=elk',
  ],
  [
    'media/vditor/dist/js/d2/d2-main.js',
    // Bumped 150→185 when rough.js (~24 KB) landed for the opt-in hand-drawn sketch mode (task 120):
    // it rides THIS lazy chunk (imported by d2-render/d2-entry), NOT main.js, so a non-D2 doc never
    // fetches it. main.js stayed at 380 KB — proof the code-split boundary held.
    185,
    'separate D2 render+layout bundle (dagre + d2-render + elk-layout + rough.js sketch) — lazy, only when a d2 block renders (task 165/120)',
  ],
  [
    'media/vditor/dist/js/mermaid-layout-elk/mermaid-elk-main.js',
    // ~74 KB thin adapter: the @mermaid-js/layout-elk render chunk + d3's curveLinear. elkjs is ALIASED
    // to the shared window.__vmarkdElk (elk-bundled-shim.ts) so it must NOT ship here — this ceiling is
    // FAR below elkjs's ~1.4 MB, so a broken alias (elkjs leaking in) fails loudly (task 112).
    110,
    'separate mermaid-ELK layout adapter — lazy, only when vmarkd.diagram.mermaidLayout=elk',
  ],
  [
    'media/vditor/dist/js/plantuml-stdlib/awslib.js',
    // The AWS icon file-map (task 136) — 827 self-contained sprite .puml files inlined as a window-global
    // map, lazy-loaded ONLY when a diagram does `!include <awslib/…>`. The `all.puml` category aggregators
    // (~3.4 MB, half the tree) are deliberately dropped; this ceiling catches their accidental return.
    4300,
    'separate AWS PlantUML stdlib icon map — lazy, only for !include <awslib/…> (task 136)',
  ],
]

let failed = false
console.log('Bundle-size budget (task 145 item 3):')
for (const [file, maxKB, what] of BUDGETS) {
  let kb
  try {
    kb = Math.round(statSync(new URL(`../${file}`, import.meta.url)).size / 1024)
  } catch {
    console.error(`  ✖ ${file} — MISSING (run \`node build.mjs\` first)`)
    failed = true
    continue
  }
  const ok = kb <= maxKB
  console.log(`  ${ok ? '✓' : '✖'} ${file}  ${kb} KB / ${maxKB} KB  — ${what}`)
  if (!ok) failed = true
}

if (failed) {
  console.error(
    '\nBundle-size budget EXCEEDED. An engine may have leaked into main.js (engines must lazy-load,\n' +
      'not be bundled), or a dependency bloated the glue. Inspect WHAT grew with esbuild analyze on\n' +
      'media/dist/main.meta.json, then fix the leak — or bump the budget deliberately with a reason.',
  )
  process.exit(1)
}
console.log('All bundles within budget.')
