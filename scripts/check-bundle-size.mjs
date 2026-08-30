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
    //
    // Raised 430→460 on 2026-08-01 (PR #88), deliberately and with the measurement, not to make a
    // red gate go away. The bundle was 445.6 KB; `main.meta.json` says NO engine leaked, which is
    // the failure this gate exists to catch — the top contributors are Vditor's own source
    // (fixBrowserBehavior 27.7 KB, highlightToolbarWYSIWYG 20.2 KB, wysiwyg/index 10.9 KB) plus
    // diff-match-patch 18.7 KB and plantuml-render.ts 12.3 KB, i.e. diffuse growth over the 6.5
    // weeks this branch ran without a PR (CI only runs on PRs and on main, so the gate had not
    // fired since 2026-06-16 — it was already 444.8 KB before the last three commits, which added
    // 0.8 KB between them). 460 leaves ~14 KB of headroom: enough that ordinary feature work does
    // not trip it, far too little to hide a bundled engine, which is what the 18-line jump from a
    // leaked renderer looks like.
    //
    // Raised 460→480 on 2026-08-27 after the eager bundle reached 464.9 KB. A fresh
    // `main.meta.json` analysis found no engine leak: the largest inputs remain Vditor's browser
    // behaviour/toolbar code and diff-match-patch, while post-PR-88 product UI includes the new
    // responsive toolbar-overflow module (5.8 KB). This is measured cumulative glue growth, not a
    // broken lazy-load boundary. 480 restores ~15 KB of headroom without being large enough to hide
    // an eagerly bundled renderer.
    //
    // Raised 480→482 for task 516 after its final SV contract changed the automatic formatter from
    // a whole-document setValue to a source-offset range splice. The final bundle is 481.0 KB;
    // `main.meta.json` still shows only the two small line-wrapping glue modules (controller and
    // Lute identity wrapper), no renderer/engine leak. The separate engine ceilings are unchanged.
    // Raised 482→484 for task 517's persistent outline viewport controller. The final bundle is
    // 482.5 KB, with `outline-viewport-sync.ts` contributing 1.5 KB; `main.meta.json` shows no new
    // renderer/engine input, and every separate lazy-engine ceiling remains unchanged.
    // Raised 484→490 for task 518's Vditor 3.11.3 trial after stubbing its inaccessible optional
    // image-caption module and duplicate native WaveDrom renderer. That restored the eager-module
    // count to 273; the remaining 487.4 KB is measured core editor growth in list/blockquote/
    // heading/reference behavior, with no engine input in main.meta.json. The ~2.6 KB headroom is
    // intentionally tight and cannot hide a renderer leak.
    // Raised 490→493 for task 520's whole-document rewrap transaction. The final bundle is
    // 492.2 KB; `main.meta.json` attributes the addition to rewrap-command/edit-sync/session glue
    // glue for the host-authoritative flush handshake, native undo fidelity, and cross-mode caret
    // mapping. No renderer or engine entered the eager graph, and every lazy-engine ceiling below
    // is unchanged. The remaining sub-KB headroom cannot hide an engine leak.
    // Raised 493→496 for task 188's direct SV large-document stream. The final bundle is 494.4 KB;
    // `main.meta.json` attributes the addition to the SV chunk assembler, boot-mode routing, and
    // stream lifecycle/metrics glue. It reuses the already-eager Lute/Vditor engine; no renderer or
    // engine entered the graph, and every lazy-engine ceiling below remains unchanged.
    // Raised 496→504 for task 289's view-only section hoisting. The final candidate is 501.9 KB;
    // `main.meta.json` attributes 5.6 KB to the controller and 0.7 KB to the shared pure section-
    // range primitive. No renderer/engine entered the graph, and every lazy-engine ceiling remains
    // unchanged. The ~2 KB headroom stays too small to hide an eager renderer leak.
    // Raised 504→508 for task 524's universal Markdown role classifier and source-safe IR/WYSIWYG
    // reflow. The final eager bundle is 505.7 KB; `main.meta.json` attributes 10.9 KB to
    // rewrap-markdown.ts, while the largest inputs remain Vditor core and diff-match-patch. No
    // renderer or engine entered the eager graph, every lazy-engine ceiling below is unchanged,
    // and the remaining ~2.3 KB headroom cannot hide a renderer leak.
    // Raised 508→520 for task 527's complete callout authoring layer. The measured final candidate
    // was 517.8 KB; task 286's marker controller brought it to 520.3 KB, task 288's shared
    // selection scope reached 523.8 KB, and task 52's inverse source-block scanner/reveal transport
    // reached 527.4 KB. main.meta.json attributes all additions to editor glue inside already-eager
    // modules. Startup stays 275 modules, no renderer/engine entered the graph, and every lazy
    // ceiling below is unchanged; ~1.6 KB headroom cannot hide an engine leak.
    529,
    'eager webview bundle — glue ONLY, every engine must lazy-load (addScript/fetch)',
  ],
  [
    'media/vditor/dist/js/elk/elk-main.js',
    1600,
    'separate ELK layout bundle — lazy, only when vmde.diagram.d2.layout=elk',
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
    // to the shared window.__vmdeElk (elk-bundled-shim.ts) so it must NOT ship here — this ceiling is
    // FAR below elkjs's ~1.4 MB, so a broken alias (elkjs leaking in) fails loudly (task 112).
    110,
    'separate mermaid-ELK layout adapter — lazy, only when vmde.diagram.mermaid.layout=elk',
  ],
  [
    'media/vditor/dist/js/plantuml-stdlib/awslib.js',
    // The AWS icon file-map (task 136) — 827 self-contained sprite .puml files inlined as a window-global
    // map, lazy-loaded ONLY when a diagram does `!include <awslib/…>`. The `all.puml` category aggregators
    // (~3.4 MB, half the tree) are NOT shipped — the expander synthesizes `<lib/Cat/all>` from the
    // individual icons (plantuml-stdlib.ts); this ceiling catches their accidental re-inclusion.
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
