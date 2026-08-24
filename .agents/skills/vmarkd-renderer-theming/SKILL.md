---
name: vmarkd-renderer-theming
description: Use when work touches vMarkd theme CSS, content themes, renderer palettes, diagram or code-block colors, dark mode, highlight.js pairing, or IR edit-surface styling.
---

# vMarkd renderer theming

How each rendered block gets its colors, and the traps. vMarkd renders Markdown via
**Vditor**; Vditor bundles a separate engine per block type. They do **not** share a
theming mechanism — that's the #1 source of mistakes.

## The three theming models (know which one a renderer uses BEFORE touching it)

1. **DOM + CSS (inherits `currentColor`)** — text, inline code, **KaTeX math**.
   Renders to HTML that inherits `color` from the themed `.vditor-reset`. **Follows the
   content theme for free** — no flag, no re-render. KaTeX (`mathRender.ts`) takes no
   theme/color param at all.

2. **Separate stylesheet, swapped** — code blocks = **highlight.js**.
   A `<link id="vditorHljsStyle">` swapped via `setTheme`. Paired with the content theme
   by `autoCodeStyle()` in `src/shared/theme-registry.ts` (`code` field). One of ~73 hljs styles.

3. **Self-contained SVG/canvas with a baked palette** — every **diagram** renderer.
   The output does NOT inherit page CSS, so it must be told its palette explicitly.
   This is where all the work (and gotchas) live.

## Per-renderer reality (fence token → engine → how it themes)

| ` ```token ` | Engine | Theme input | Reacts to theme? |
|---|---|---|---|
| `mermaid` | Mermaid (vendored 11.15.0) | `initialize({theme, themeVariables})` | ✅ full palette pairing (task 86) |
| `echarts` | Apache ECharts 6.1.0 (vendored) | `registerTheme()` + `init(el, name)` | ✅ full palette pairing + `vmarkd.diagram.echarts.theme` gallery themes (task 89/90) |
| `d2` | D2 (WASM compile + dagre/ELK layout) | `D2_THEMES` / `d2Catalog` + `pairedTheme` (auto) | ✅ full palette-paired + `vmarkd.diagram.d2.theme` (auto, D2-native/editor palettes, mono) (task 119); re-renders on flip |
| `mindmap` | ECharts tree | `init(el, theme)` + hardcoded colors | ◑ partial (some colors baked) |
| `smiles` | smiles-drawer | `draw(code, id, 'dark'\|undefined)` | ◑ binary dark/light |
| `markmap` | markmap | none | ❌ baked palette; no re-render path, so it stays stale until reopen |
| `flowchart` | flowchart.js | `drawSVG(el, {line/element/font-color, fill})` | ✅ foreground-paired, poll on flip (task 91) |
| `vega` `vega-lite` | vega-embed | colours from `getComputedStyle(wrapper).color` | ✅ foreground-paired, poll on flip (task 102) |
| `graphviz` | Viz.js | inject DOT `graph`/`node`/`edge` palette defaults after `{` | ✅ full palette-paired (fill=surface, line, fg, transparent bg) since 2026-06-28; re-renders on flip |
| `abc` | abcjs | SVG post-process → currentColor | ✅ foreground-monochrome; re-renders on flip |
| `wavedrom` | WaveDrom | embedded `<style>` skin recolour → currentColor | ✅ foreground-monochrome; re-renders on flip |
| `nomnoml` | nomnoml | SVG post-process → currentColor | ✅ foreground-monochrome; re-renders on flip |
| `geojson` `topojson` | Leaflet | SVG geometry → currentColor (+ opt-in remote tiles, task 99) | ✅ foreground-monochrome; re-renders on flip |
| `plantuml` | TeaVM offline (vendored) → SVG | inject modern `<style>` block from palette (element/arrow/note) | ✅ offline + full palette-paired (fill=surface, line, fg, note=accent) since 2026-06-28; re-renders on flip |
| `stl` | three.js | fixed neutral material (theme-independent) | — material fixed `#9aa0a6`; registry `retheme: 'none'`, so flips do not rebuild it |
| `$…$` `$$…$$` | KaTeX | none (currentColor) | ✅ inherits CSS |

`previewRender.ts` threads `mergedOptions.mode` (the editor dark/light) to the renderers
that accept a theme arg (`chartRender`, `mindmapRender`, `SMILESRender`, `mermaidRender`).
The rest get nothing.

**flowchart (task 91) — foreground-paired, NOT currentColor.** flowchart.js takes a style-options
object as `drawSVG(el, {…})`'s 2nd arg (`line-color`/`element-color`/`font-color`/`fill`/…). Vditor
called `drawSVG(item)` bare → baked black. Pairing model is #3 but with two HARD gotchas (verified by
real-editor probe, don't relearn): its Raphael color parser turns **`currentColor` into a garbage
`#6688cc`** (so the KaTeX/graphviz currentColor trick does NOT work here) and **`fill:"transparent"`
renders BLACK** — so pass an EXPLICIT colour (the themed foreground from `getComputedStyle(item).color`,
an rgb() string Raphael parses fine) for line/element/font + `fill:"none"` for transparent boxes. One
foreground suffices (monochrome line-art — no palette mapping needed). esbuild `patchFlowchartTheme`
rewrites the bare call; `media-src/src/diagrams/flowchart-retheme.ts` `reRenderFlowchart` re-renders
on a live flip, scheduled by `reThemeFlowchart` (`media-src/src/diagrams/diagram-retheme.ts`) which
POLLS until the foreground settles (the content-theme
`<link>` applies LATE — a fixed-delay re-render bakes a stale colour).

## How mermaid theming actually works — THREE distinct layers (don't conflate them)

The mistake to avoid: "mermaid pairs via the registry mapping." The mapping only *picks a
palette*; the *style* is applied by mermaid's own engine. Three separate steps:

1. **Mapping (renderer-agnostic)** — `src/shared/theme-registry.ts`: `ThemeDef.palette` holds a
   palette id; `pairedPalette(contentTheme)` returns `themeDef(contentTheme)?.palette`. It selects
   *which* palette: github-light/dark pair with the same-named palettes, material-dark pairs with
   one-dark, and vscode-light-2026/vscode-dark-2026 pair with their same-named 2026 palettes.
   `auto` has no registry row, so it returns `undefined` and the renderer follows its editor-mode
   fallback.
2. **Translation (mermaid-specific)** — `resolveMermaidInit()` (`media-src/src/diagrams/mermaid/mermaid-theme.ts`)
   takes the id → `MERMAID_PALETTES[id]` (`{bg,fg,line,accent,muted}`, in
   `src/shared/mermaid-palettes.ts`) → `paletteToThemeVariables()` → `{theme:'base', themeVariables}`.
3. **Application (mermaid-specific)** — `applyMermaidTheme()` wraps `mermaid.initialize(cfg)`
   to merge `{theme:'base', themeVariables}`. **Mermaid's own theme engine** consumes
   `themeVariables`.

**Reusable across diagram renderers:** only layer 1 (`ThemeDef.palette` + `pairedPalette`) and the
palette DATA (`MERMAID_PALETTES`). Layers 2 + 3 are per-engine:
ECharts wants `registerTheme` with `{color:[…], backgroundColor, textStyle, axisLine…}`, NOT
`themeVariables`.

## ECharts theming (task 89/90) — the second renderer that adopted the pattern

Mirrors mermaid's 3 layers but with ECharts gotchas:
- **Setting:** `vmarkd.diagram.echarts.theme` enum [auto, light, dark, + 6 gallery + vintage-dark]. `auto`
  follows the content theme (layer-1 `pairedPalette`); the rest are explicit ECharts themes.
- **Resolve:** `resolveEchartsTheme(setting, contentTheme, mode, vscodePalette?)` in
  `src/shared/echarts-theme.ts` (host-isomorphic). `auto` first uses content-specific baked overrides
  for material-dark and vscode-light-2026/vscode-dark-2026, then `pairedPalette` →
  `MERMAID_PALETTES`; with an `auto` content theme it uses VS Code chart colors from
  `readVscodePalette(window)` or the neutral mode fallback.
- **Apply:** `media-src/src/diagrams/echarts-apply.ts` (`applyEchartsTheme` registers a theme object at
  point-of-use via `win.__vmarkdEchartsResolve(ec)`) + `echarts-retheme.ts` (`reRenderEcharts` —
  sync re-init capturing width/height BEFORE dispose to avoid 0×0 collapse + the async addScript race).
- **ECharts gotchas:**
  - ECharts 6 core has **no usable by-name `light`/`dark`** you can apply cleanly (default `light`
    bg = transparent; gallery themes omit `backgroundColor`). So ALWAYS register a theme OBJECT
    with an explicit `backgroundColor` (back-fill `#ffffff` for gallery themes).
  - One esbuild **onLoad runs per file** — so the `?v=5.5.1`→`6.1.0` version bump AND the theme-init
    rewrite for `chartRender.ts` must live in ONE registry transform (the echarts `VDITOR_TS_PATCHES`
    entry chains `patchEchartsVersion` then `patchEchartsThemeInit`), not two onLoads.
  - VS Code dark themes share VS Code's DEFAULT chart palette (most themes don't customize
    `--vscode-charts-*`); accepted = charts use the editor's own chart colors.

## Gotchas (the expensive-to-rediscover ones)

- **Vditor hardcodes asset cache-busters.** `mermaidRender.ts` loads `mermaid.min.js?v=11.6.0`,
  `chartRender.ts` loads `echarts.min.js?v=5.5.1`. If you vendor a newer asset, ALSO bump the
  `?v=` via an esbuild patch (`media-src/esbuild-shared.mjs`, see `patchMermaidVersion` in the
  `VDITOR_TS_PATCHES` registry), else a
  cached webview serves the old bytes across an extension update.
- **Overriding a Vditor-bundled asset = register it for overwrite AFTER sync.** `build.mjs`
  `syncVditorAssets()` copies Vditor's whole `dist/` into `media/`, then iterates `VENDORED_ASSETS`
  from `media-src/vendor/vendored-assets.mjs` through `syncVendored(entry)`. Each entry sha-checks
  `media-src/vendor/<x>/source.json`, copies the pinned bytes and required licenses into
  `media/vditor/dist/js/<x>/…`, and fails loudly on drift. The dependency's bundled copy remains only
  in gitignored `node_modules/vditor`; the registered vendored bytes overwrite generated output.
- **CSP is the boundary** (`src/webview-host/html-builder.ts`): `default-src 'none'`, `object-src 'none'`
  (kills PlantUML's remote `<object>`), `img-src … data: blob:` (so PNG/inline data renders),
  `style-src 'unsafe-inline'` (so inline SVG `<style>` works), and `script-src 'unsafe-eval'`.
  `'unsafe-eval'` permits the current WASM engines as well as JavaScript `eval`/`new Function`;
  `'wasm-unsafe-eval'` is a narrower future alternative for WASM compilation, but cannot replace
  `'unsafe-eval'` while WaveDrom and Vega require JavaScript evaluation. No external host is allowed
  — any CDN-loading engine (e.g. CheerpJ → `leaningtech.com`) breaks offline + needs a CSP hole.
- **Theme-responsive renderers re-render on a LIVE theme flip through ONE authority.** `rethemeDiagrams()`
  (`media-src/src/diagrams/diagram-retheme.ts`, task 152 item 3) is the single re-theme entry both flip sites
  route through: `handleSetTheme` (a VS Code mode flip → every flag on) and `handleConfigChanged` (the
  changed-flag subset). It drives code/hljs (stylesheet swap), mermaid + echarts (palette + offscreen
  re-render), flowchart + vega (foreground-poll — they bake colour from `getComputedStyle`, which
  settles late, so it polls for ~2s and re-renders on change), the monochrome SVG group
  (plantuml/graphviz/abc/wavedrom/nomnoml), geo maps (geojson/topojson), and D2 (deferred rAF+400ms;
  D2 deduped to ONE fire so a content+layout change can't double-render it), and smiles
  (bg-luminance). The flip
  wiring used to live inline in `handleConfigChanged` + a misnamed `reThemePlantumlGraphviz`; it now
  lives in `diagram-retheme.ts` (`media-src/src/boot/main.ts` injects `lastInitMsg` options/cdn + the code-theme applier via
  `configureDiagramRetheme`). `reRenderMermaid` (task 59, `mermaid-retheme.ts`) renders OFFSCREEN then
  swaps the SVG in atomically (an in-place re-render collapses the diagram to source text → shrinks the
  doc → scrolls to top, the reported bug); that offscreen-swap pattern is now SHARED by the other
  re-render helpers. **Markmap** stays baked and stale until reopen. **STL** also has no flip re-render,
  intentionally: its fixed neutral material is theme-independent, so rebuilding the three.js scene
  would change nothing. KaTeX follows CSS `currentColor` without a re-render. (This skill previously
  claimed "only mermaid re-renders" — false since the offline-renderer set landed.)
- **The mermaid e2e harness calls the functions directly**, not via the host message path
  (`media-src/e2e/mermaid-harness.ts` exposes `__applyTheme`/`__reTheme`). So `handleConfigChanged`
  wiring is covered by unit + code inspection, not e2e. Don't claim message-path e2e coverage.
- **PlantUML offline: TeaVM, not CheerpJ.** `plantuml-core`/`plantuml.js` use CheerpJ (runtime
  CDN-locked, ~17 MB, not self-hostable). The main `plantuml/plantuml` repo has a **TeaVM**
  build (`teavm.sh` → `./gradlew teavm`) = self-hostable plain JS, SVG output, reuses Viz.js
  (which we already bundle). See task 87.
- **PlantUML stdlib offline (`!include <C4/…>` / `<awslib/…>` / `<azure/…>`, task 136).** The TeaVM
  engine ships NO stdlib + NO include hook, so C4/AWS/Azure diagrams get a "Fatal parsing error". Fix =
  a JS textual `!include` EXPANDER (`media-src/src/diagrams/plantuml/plantuml-stdlib.ts`) that inlines the vendored `.puml`
  before `render()`. TWO gotchas: (1) the stdlib files guard relative includes with `!if
  %variable_exists("RELATIVE_INCLUDE") … !else <remote> … !endif` — you MUST strip that guard
  STRUCTURALLY (keep the relative branch), else the engine takes the remote `!else` and the lib's `?=`
  defaults never run. (2) awslib/azure per-category `all.puml` aggregators (~3.4 MB) are NOT shipped —
  the expander SYNTHESIZES `<lib/Cat/all>` by concatenating the vendored `<lib/Cat/*>` icons (each is
  exactly a concat of its category, verified). Vendored via `fetch-plantuml-stdlib.mjs`, loaded via
  `loadScript` (window global — CSP blocks `fetch`).
- **PlantUML multi-block concurrency (task 347, fixed).** Vditor invokes `plantumlRender` once per
  block, so a multi-diagram document starts concurrent work. Preserve both guards: shared
  `media-src/src/util/load-script.ts` makes callers for the same script id share its in-flight promise,
  so none reads a half-loaded stdlib map; and
  `media-src/src/diagrams/plantuml/plantuml-render.ts` funnels engine work through a module-level
  `renderQueue`, awaiting each block's SVG before releasing the next. The earlier diagram-type
  stickiness diagnosis and fresh-engine-per-block experiment were wrong; task 178's separate
  class/non-class engine routing remains a distinct invariant. Verification lives in
  `media-src/src/util/load-script.test.ts` and `test/vscode-e2e/plantuml-multiblock.spec.ts`, whose
  five-block C4/AWS/Azure fixture must render every distinct label with no error SVG.
- **Palette data is MIT and renderer-agnostic.** `MERMAID_PALETTES` are the 15 Beautiful
  Mermaid palettes (`lukilabs/beautiful-mermaid`, MIT, © Craft Docs) — just `{bg,fg,line,
  accent,muted}` hex. `muted` is currently parsed but unused by `paletteToThemeVariables`.

## IR edit surface: editing a special block must MATCH its render (not just the render)

Everything above is about the RENDERED block. But in IR mode each special block is a **dual-node**:
Lute emits `<div class="vditor-ir__node" data-type="code-block"><pre class="vditor-ir__marker--pre">
<code class="language-X">…(editable source)</code></pre><pre class="vditor-ir__preview"><code class="hljs">
…(render)</code></pre></div>`. Vditor toggles `vditor-ir__node--expand` on the node as the caret
enters/leaves (via `expandMarker`); collapsed shows the preview, expanded shows the source. The
editing surface (`.vditor-ir__marker--pre`) is its OWN element — it does NOT automatically get the
render's theming, so editing a block can look completely different from its render. Gotchas:

- **content-theme/hljs rules LEAK onto the editable source.** github-markdown-css styles
  `.markdown-body pre`/`code`/`pre code` for its RENDERED output, but those selectors also match the
  IR `.vditor-ir__marker--pre > code` — so editing showed a wrong panel/box, the ` ```lang ` fence
  running into the first code line (`display:inline`), and a font compounded to ~72% (85%×85%).
- **WINNING FIX = tag the source `<code>` with `.hljs`** so the highlight.js theme styles it
  identically to the render (size/padding/bg/base colour; only token colours are absent, correct for
  raw source). `media-src/src/editing/code-source.ts` `observeCodeSource()` does this via a MutationObserver
  (synchronous, watches childList/characterData NOT attributes → before-paint, no flash, no loop;
  re-tags after every Vditor rebuild). Wired in `media-src/src/boot/main.ts` `runFinishInit` next to
  `observeCallouts`.
  The `.hljs` class is invisible to Lute's serializer → markdown round-trips byte-identical. **Do NOT
  hand-match each CSS property in main.css** (I tried bg-var/padding/font-size one by one — the
  render is hljs-theme-driven and the hand-values never tracked it). Let the theme own both.
- **An inline element can't carry a block panel bg.** Vditor tags the source `pre` with
  `vditor-ir__marker` → `display:inline` on expand; an inline pre paints its bg across line-boxes
  (incl. the marker line above), not as a rectangle → "clashing" bleed. Force
  `.vditor-ir__node--expand > pre.vditor-ir__marker--pre { display:block }`. Its panel COLOUR then
  comes free from the content theme's own `.markdown-body pre` (same rule that paints the preview pre).
- **Hide the render while editing — scoped to REAL code.** `.vditor-ir__node--expand >
  .vditor-ir__preview:has(> code.hljs) { display:none }`. The `:has(> code.hljs)` is load-bearing:
  mermaid/echarts/math share `data-type="code-block"` but their preview holds a `div.language-*`/svg,
  not `code.hljs` — a blanket hide regressed their editing.
- **Dark-theme specificity trap.** `.vditor--dark .vditor-reset code:not(.hljs)` (0,4,1) paints
  inline-code with `--vmarkd-code-bg`; it also hit the source code → a lighter box inside the panel
  (github-dark only; light themes lack `.vditor--dark`). Override needs ≥(0,4,2):
  `.vditor-reset pre.vditor-ir__marker--pre > code:not(.hljs):not(.highlight-chroma)`.
- **Code-block BOTTOM padding = hljs `1em`, no dark trim.** task-05 once trimmed the IR rendered
  code's bottom to a fixed `padding-bottom:9.9px` on `.vditor--dark` (for first-paint parity). That
  trim hit `.vditor-ir__preview` but NOT the standalone Preview pane (`.vditor-preview`), which kept
  the hljs `1em` → on dark the IR render sat ~4px shorter at the bottom than the same block in Preview
  (font-size dependent: `1em` scales, `9.9px` didn't). REMOVED both dark trims (settled + un-highlighted
  first-paint) so render + `.hljs` source + first-paint box all use `1em` bottom on every theme —
  still mutually equal (no first-paint jump, no expand resize) AND matching the Preview pane. **Don't
  re-add a dark bottom trim.** Guard: blockbg.spec.ts "dark IR code render has symmetric (1em) vertical
  padding" (`paddingBottom===paddingTop` after `.vditor--dark` + atom-one-dark).
- **Collapsed code block must equal Preview height — kill the node's phantom line boxes.** The IR
  dual-node wraps its block render BETWEEN inline content: the node's own `::before`/`::after
  {content:" "}` pseudos + the h:0 fence/info `.vditor-ir__marker` spans. Each inline run forms an
  anonymous line box = the node's line-height STRUT (~2 lines ≈ 40px phantom above+below) → collapsed
  block ~40px taller than Preview, "jumps" on Edit↔Preview / caret enter-leave. CAN'T fix via the
  node's line-height (unitless → inherits into `code.hljs` → squishes the render; a forced value
  mismatches themes that set their own code line-height). FIX (collapsed only, `:not(--expand)`):
  `content:none` on the pseudos + `display:block` on the markers (they're h:0 + overflow:hidden →
  invisible, stay in flow → no scroll-jump) → node holds only the block render, height == Preview,
  ZERO impact on the render's line-height/font (theme-agnostic). Scoped `:has(> .vditor-ir__preview >
  code.hljs)` so diagrams keep their geometry. Guard: blockbg.spec.ts "collapsed code block has no
  phantom height". When `--expand` is set the rule stops matching → source panel + gaps return (the
  user wants the editing room then).
- **`blurEvent` collapses `--expand` on EVERY blur** (Vditor `util/editorCommonEvent.ts`). A click in
  the webview = transient blur→refocus → the render flashed mid-click. Fix = esbuild patch
  `patchIrBlurExpand`: wrap the `expandElement.classList.remove(...)` in `requestAnimationFrame` + a
  `document.activeElement` recheck (skip collapse if focus returned; genuine blur still collapses a
  frame later).
- **META-GOTCHA: these edit-surface bugs reproduce ONLY in the real VS Code webview**, not the
  Playwright harness — the harness doesn't load the real github theme + hljs theme, and doesn't fire
  a blur on an in-editor click. Reproduce by (a) loading the REAL theme files via `addStyleTag` in a
  throwaway spec + measuring computed styles / screenshotting + reading PNGs, and (b) reading the
  Vditor source for the event that fires. Verify the final fix WITH THE USER (like the focus-scroll
  class of bugs). The dual-node + edit-surface fixes are unit/e2e-tested in
  `media-src/e2e/{codeedit,blockbg,callout-ir}.spec.ts` (blockbg-harness loads/simulates the real
  theme + runs `observeCodeSource`) and `test/backend/vditor-source-patches.test.ts`.

(Callouts use the same dual-node idea by hand: `media-src/src/editing/callouts.ts` tags `[!TYPE]` blockquotes
`vditor-ir__node` + injects a `contenteditable=false` `.vditor-ir__preview` Lute ignores.)

## File map

- Engine behavior registry: `media-src/src/diagram-kit/engine-registry.ts` (`RethemeStrategy`,
  per-engine `retheme`; STL is `'none'`). Live dispatch: `media-src/src/diagrams/diagram-retheme.ts`
  (STL is absent from the registry-derived retheme groups).
- Vditor engines: `media-src/node_modules/vditor/src/ts/markdown/{mermaid,chart,mindmap,markmap,flowchart,graphviz,plantuml,abc,SMILES,math}Render.ts` + `previewRender.ts` (the dispatcher).
- Our theming: `src/shared/theme-registry.ts` (mapping + `autoCodeStyle`/`pairedPalette`),
  `src/shared/mermaid-palettes.ts` (palettes + `paletteToThemeVariables` + exported `parseHex/toHex/mix/…`),
  `media-src/src/diagrams/mermaid/mermaid-theme.ts` (`resolveMermaidInit`, `applyMermaidTheme`),
  `media-src/src/diagrams/mermaid/mermaid-retheme.ts` (`reRenderMermaid`),
  `src/shared/echarts-theme.ts` (`resolveEchartsTheme`, palettes), `src/shared/echarts-gallery.ts` (generated),
  `media-src/src/diagrams/echarts-apply.ts` + `media-src/src/diagrams/echarts-retheme.ts`.
- IR edit surface: `media-src/src/editing/code-source.ts` (`observeCodeSource` — `.hljs` on editable source),
  `media-src/src/editing/callouts.ts` (callout dual-node), the edit-surface CSS in `media-src/src/main.css`
  (search `vditor-ir__marker--pre`, `--expand`).
- Build/patches: `build.mjs` (`syncVditorAssets`, the `VENDORED_ASSETS` → `syncVendored` loop,
  `varifyVditorPalette`, `patchVditorIndexCss` — index.css is patched HERE only, not bundled; ADR-0004),
  `media-src/vendor/vendored-assets.mjs` (declarative asset copies, hashes, and licenses),
  `media-src/esbuild-shared.mjs` (vditor TS source patches: the `VDITOR_TS_PATCHES` registry +
  `vditorSourcePatches` engine; e.g. `patchMermaidVersion`, `patchEchartsThemeInit`, `patchIrBlurExpand`).
  Patch unit tests: `test/backend/vditor-source-patches.test.ts`.
- CSP: `src/webview-host/html-builder.ts`. Vendored assets: `media-src/vendor/<engine>/` (+ `source.json` sha guard).
- Related tasks: 82/84/85 (content themes + registry), 86 (mermaid palettes), 87 (PlantUML/TeaVM),
  89 (ECharts bump 6.1.0), 90 (ECharts theming), 106 (callouts dual-node).

## When adding theming to a new diagram renderer

**Policy (ADR-0006):** a new renderer SHOULD be **palette-paired** (full colour from the content
theme). Foreground-monochrome (`currentColor`) is the accepted fallback ONLY for engines whose output
can't be palette-mapped without disproportionate per-engine work — and when you take it, **record why**
(in the task + the table above). Add a `vmarkd.theme.<engine>` picker ONLY if the engine ships several
first-class theme families worth choosing (echarts gallery, D2 native); otherwise follow the content
theme implicitly. Two palette data models coexist deliberately — mermaid-family uses 5-field
`MERMAID_PALETTES`, D2 uses its richer token catalog; don't unify them (ADR-0006 §3).

1. Identify its model (#1 CSS-inherit, #2 swapped stylesheet, #3 self-contained SVG/canvas).
2. **Prefer palette-pairing:** reuse layer 1 (`pairedPalette`) + `MERMAID_PALETTES` data. Only fall
   back to monochrome `currentColor` post-processing if the engine genuinely can't be palette-mapped.
3. Write a per-engine translation (palette → that engine's theme format).
4. Apply it the engine's way (init param / register API) — patch Vditor's `*Render.ts` via
   esbuild if it hardcodes the theme.
5. Wire a live re-render into the single authority **`rethemeDiagrams()`
   (`media-src/src/diagrams/diagram-retheme.ts`)** —
   add a flag for it, gate on `contentThemeChanged` (+ its own setting if it has one), and mirror
   `reRenderMermaid`'s offscreen-swap. Both flip sites (`handleSetTheme` / `handleConfigChanged`) route
   through that one function — do NOT add wiring at the call sites (task 152 item 3).
6. Test: unit (mapping + translation) + e2e (renders with the palette colors; reacts to a flip).
