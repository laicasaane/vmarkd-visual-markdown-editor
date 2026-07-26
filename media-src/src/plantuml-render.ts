// Offline PlantUML render + theme-agnostic post-processing (task 87; extracted from a ~75-line
// esbuild patch STRING into a real, typed, unit-tested module by task 144 item 1). Vditor's
// `plantumlRender.ts` is rewritten at bundle time into a thin shim that re-exports `plantumlRender`
// from here (see `patchPlantumlRender` in esbuild-shared.mjs) — so this is the single source of the
// runtime logic, type-checked + linted + covered by `plantuml-render.test.ts`. Deliberately imports
// NO Vditor internals (the adapter's getElements/getCode are one-liners, inlined; script loading uses
// our shared `loadScript`) so the theming logic is testable in jsdom without pulling Vditor's source.

import { renderDiagramError } from './diagram-error'
import { removeDiagramLoading, renderDiagramLoading } from './diagram-loading'
import { appendDiagramNote } from './diagram-note'
import { resolveDiagramPalette } from './diagram-palette'
import { loadScript } from './load-script'
import {
  expandStdlibIncludes,
  hasRemoteInclude,
  needsStdlib,
  type StdlibMap,
} from './plantuml-stdlib'

// PlantUML default-skin colours (snapshot dep `1.2026.7beta3`). Named so a skin change in a future
// PlantUML bump is greppable here, not a silent "renders in the wrong colour" (task 144 item 2): if
// the engine changes its defaults these stop matching and `plantuml-render.test.ts` catches it.
// FOREGROUND = the baked ink (lines, borders, text) we repaint to currentColor so it follows the
// theme. BOX = participant/box fills we flatten to a faint tint. TRANSPARENT = the bg rect we drop.
const PUML_FOREGROUND = new Set(['#181818', '#000000'])
const PUML_BOX_FILL = new Set(['#E2E2F0', '#222222'])
const PUML_TRANSPARENT = '#00000000'
const BOX_FILL_OPACITY = '0.06'

// Dark-theme adaptation of BAKED colours (task 382), for the diagrams we could NOT inject a palette
// into — anything carrying its own skinparam/<style>, which in practice means every stdlib diagram
// (our own inlined C4/awslib/azure carry hundreds of skinparam lines). Those keep the library's
// light-background palette, while themePumlSvg repaints the ink to the theme foreground — so on a
// dark theme a light-grey label landed on a WHITE card (measured 1.87:1 on vscode-dark, 1.18:1 on
// github-dark) and C4's #444444 boundary sat at 1.91:1 on the page.
//
// The rule is chroma-based, not a colour list: NEUTRAL greys are chrome and must follow the theme,
// SATURATED colours are the library's identity (C4 blue, Azure blue, the AWS sprite palette) and are
// never touched. Thresholds are set from the values these libraries actually emit — see the task doc.
const NEUTRAL_SPREAD = 24 // max-min channel distance still counted as grey (#7D8998 = 27 → identity)
const LIGHT_FILL_LUM = 0.75 // #FFFFFF card fills; #999999 (0.32) stays
const DARK_INK_LUM = 0.2 // #444444 (0.06) + #666666 (0.13) lift; #8A8A8A (0.26) stays

function parseRgb(v: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i.exec(v.trim())
  if (!m) return null // none / currentColor / url(#…) / rgb() — nothing to reason about
  // A NON-OPAQUE colour is not ink, whatever its RGB says. PlantUML draws invisible shapes as
  // `#00000000` — transparent black — and reading only the RGB made that look like the darkest
  // possible ink: the adaptation then painted C4's unfilled boundary rect solid, swallowing half the
  // diagram. Caught by rendering it, not by the unit tests, which is why this one has a test now.
  if (m[2] && m[2].toLowerCase() !== 'ff') return null
  const h = m[1]
  const p = (i: number) =>
    h.length === 3
      ? Number.parseInt(h[i] + h[i], 16)
      : Number.parseInt(h.slice(i * 2, i * 2 + 2), 16)
  return [p(0), p(1), p(2)]
}

function isNeutral([r, g, b]: [number, number, number]): boolean {
  return Math.max(r, g, b) - Math.min(r, g, b) <= NEUTRAL_SPREAD
}

// WCAG relative luminance — the same measure the contrast numbers in the task doc are computed with.
function relLuminance([r, g, b]: [number, number, number]): number {
  const c = (v: number) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
}

// A light neutral FILL is a card the library drew for a light page → repaint to the theme surface so
// the (already themed) label on it has something dark to sit on. Text is excluded on purpose: C4
// draws white LABELS on its coloured boxes, and those must stay white.
function adaptedFill(el: Element, surface: string): string | null {
  if (el.tagName.toLowerCase() === 'text') return null
  const rgb = parseRgb(el.getAttribute('fill') ?? '')
  if (!rgb || !isNeutral(rgb)) return null
  return relLuminance(rgb) >= LIGHT_FILL_LUM ? surface : null
}

// Dark neutral ink (label text, arrows, dashed boundary strokes) is invisible on a dark page →
// currentColor, which follows the theme like the rest of the diagram.
function isDarkNeutralInk(v: string | null): boolean {
  const rgb = parseRgb(v ?? '')
  return !!rgb && isNeutral(rgb) && relLuminance(rgb) <= DARK_INK_LUM
}

// PlantUML stdlib (task 136): the `<lib/…>` include prefix → the lazy JS file-map that carries it. Each
// file MERGES its map onto window.__vmarkdPumlStdlib (loaded via loadScript — CSP allows script-src, not
// fetch). The webview pulls ONLY the libs a diagram references, once each.
const STDLIB_FILES: Record<string, string> = {
  c4: 'c4.js',
  awslib: 'awslib.js',
  azure: 'azure.js',
  // task 354 — MIT/Apache icon libs from the plantuml-stdlib aggregator. Keys are the LOWERCASED include
  // prefix (referencedStdlibLibs lowercases before lookup); the map keys inside each .js keep the prefix's
  // real case (e.g. domainstory.js carries `DomainStory/…` — `!include <DomainStory/domainStory>`).
  k8s: 'k8s.js',
  eip: 'eip.js',
  edgy: 'edgy.js',
  domainstory: 'domainstory.js',
  cloudogu: 'cloudogu.js',
  cloudinsight: 'cloudinsight.js',
  kubernetes: 'kubernetes.js',
}
const stdlibLoaded = new Set<string>()

// Cross-lib dependencies: some libs `!include` a DIFFERENT vendored lib internally, which the user's own
// source never names — so we must load the dependency's map too or the transitive include goes missing.
// (task 354) k8s/Common builds on C4 (`!include <C4/C4>`), so a `<k8s/…>` diagram needs c4.js loaded
// alongside k8s.js. (domainstory references material2.1.19 only inside a `!if $icon`-guarded procedure —
// an optional icon feature needing an unvendored 16 MB lib; core DomainStory renders without it, so it is
// deliberately NOT a dependency.)
const STDLIB_DEPS: Record<string, string[]> = {
  k8s: ['c4'],
}

// Close a lib list under STDLIB_DEPS (transitively), so referencing k8s also pulls c4.
function withStdlibDeps(libs: string[]): string[] {
  const out = new Set<string>()
  const add = (lib: string) => {
    if (out.has(lib)) return
    out.add(lib)
    for (const dep of STDLIB_DEPS[lib] ?? []) add(dep)
  }
  for (const lib of libs) add(lib)
  return [...out]
}

// The stdlib libs a source references — the lowercased prefix before the first `/` of each `<lib/…>`,
// closed under STDLIB_DEPS (so a `<k8s/…>` source also names c4). Exported for the unit test.
export function referencedStdlibLibs(source: string): string[] {
  const libs = new Set<string>()
  const re = /^\s*!include(?:_many|_once|url)?\s+<([^/>]+)\//gim
  let m: RegExpExecArray | null = re.exec(source)
  while (m) {
    const lib = m[1].trim().toLowerCase()
    if (STDLIB_FILES[lib]) libs.add(lib)
    m = re.exec(source)
  }
  return withStdlibDeps([...libs])
}

// Lazy-load the referenced stdlib file-maps (once each) and return the merged map they populate.
async function loadStdlib(cdn: string, libs: string[]): Promise<StdlibMap> {
  for (const lib of libs) {
    if (stdlibLoaded.has(lib)) continue
    await loadScript(
      `${cdn}/dist/js/plantuml-stdlib/${STDLIB_FILES[lib]}`,
      `vditorPumlStdlib_${lib}`,
    )
    stdlibLoaded.add(lib)
  }
  return (
    (window as unknown as { __vmarkdPumlStdlib?: StdlibMap })
      .__vmarkdPumlStdlib ?? {}
  )
}

// Repaint a rendered PlantUML SVG to be theme-agnostic: baked foreground → currentColor, box fills →
// a faint currentColor tint, transparent bg rect removed. Pure DOM walk (querySelectorAll +
// setAttribute) — NOT an innerHTML serialize→reparse (task 144 item 3: the old reparse cost a full
// reflow on large diagrams + dropped listeners). Idempotent: a second pass finds currentColor, which
// is in none of the colour sets, so it's a no-op.
export function themePumlSvg(container: HTMLElement, adaptBaked = false): void {
  const svg = container.querySelector('svg')
  if (!svg) return
  // Baked foreground on ANY element (lines/borders/text) → currentColor.
  for (const el of Array.from(svg.querySelectorAll('[fill], [stroke]'))) {
    if (PUML_FOREGROUND.has(el.getAttribute('fill') ?? ''))
      el.setAttribute('fill', 'currentColor')
    if (PUML_FOREGROUND.has(el.getAttribute('stroke') ?? ''))
      el.setAttribute('stroke', 'currentColor')
  }
  // Text with no fill attr (SVG default = black, invisible on dark) → currentColor.
  for (const t of Array.from(svg.querySelectorAll('text'))) {
    if (!t.getAttribute('fill')) t.setAttribute('fill', 'currentColor')
  }
  // Participant/box fills → a faint currentColor tint (like mermaid's themed node backgrounds).
  for (const r of Array.from(svg.querySelectorAll('rect'))) {
    if (PUML_BOX_FILL.has(r.getAttribute('fill') ?? '')) {
      r.setAttribute('fill', 'currentColor')
      r.setAttribute('fill-opacity', BOX_FILL_OPACITY)
    }
  }
  // Drop the fully-transparent background rect (it composites a stray box over the page bg).
  for (const r of Array.from(svg.querySelectorAll('rect'))) {
    const f = r.getAttribute('fill')
    const s = r.getAttribute('stroke')
    if (f === PUML_TRANSPARENT && (s === PUML_TRANSPARENT || !s)) r.remove()
  }
  // Task 382 — the diagrams above are the ones we DID theme at source. A diagram carrying its own
  // skinparam/<style> (every stdlib one) skipped that, so its baked light-page palette is still here:
  // adapt it to a dark theme. Runs LAST so it only ever sees what the passes above left alone.
  if (adaptBaked) adaptBakedColours(svg)
}

// Repaint a light-page palette for a dark theme, leaving the library's identity colours intact.
// Dark themes only: on a light theme the baked palette is already right, and this whole pass is a
// no-op by construction (verified in the real editor — light rendered correctly before the fix).
function adaptBakedColours(svg: SVGElement): void {
  let palette: ReturnType<typeof resolveDiagramPalette>
  try {
    palette = resolveDiagramPalette()
  } catch {
    return // no palette (outside a webview) → leave the diagram exactly as the engine drew it
  }
  if (!palette.dark) return
  for (const el of Array.from(svg.querySelectorAll('[fill], [stroke]'))) {
    const fill = adaptedFill(el, palette.surface)
    if (fill) {
      el.setAttribute('fill', fill)
      // Marked so the sprite pass below can tell "this icon's backdrop was darkened BY US" from
      // "this icon sits on a colour the library chose" — only the former needs compensating.
      el.setAttribute('data-vmarkd-adapted', '1')
    } else if (isDarkNeutralInk(el.getAttribute('fill')))
      el.setAttribute('fill', 'currentColor')
    if (isDarkNeutralInk(el.getAttribute('stroke')))
      el.setAttribute('stroke', 'currentColor')
  }
  backSprites(svg, palette.fg)
}

// Icon sprites are `<image>` elements whose artwork KNOCKS OUT its highlights instead of painting
// them: Azure's SQL lettering, the cylinder rim and two faces of the VM cube are transparent holes
// that assume a white page behind. Darkening the card underneath therefore turned white lettering
// into dark-grey lettering — the sprite itself is untouched (it is a data URI we cannot repaint), the
// backdrop showing through it is what changed. So restore a light tile behind it: opaque artwork (the
// whole AWS set) hides it completely, and knock-outs get a light backing again.
//
// The tile is the LABEL colour, not white, and is INSET from the image box. Pure white at full size
// read as a glaring badge wherever the artwork left margins — Azure's monitor sits in the top of its
// square, so the bottom of the tile showed as a white strip. At the foreground colour it is no
// brighter than the text beside it, and the inset trims the exposed strip. Both were the user's call
// after looking at the render.
//
// ONLY where we darkened the backdrop ourselves. C4's `person` sprite is WHITE artwork on a saturated
// blue box we never touch — tiling that one turned the figure white-on-white, a worse regression than
// the one being fixed. The `data-vmarkd-adapted` marker is what tells the two cases apart.
const SPRITE_TILE_INSET = 0.08 // of the sprite's shorter side
function backSprites(svg: SVGElement, ink: string): void {
  for (const img of Array.from(svg.querySelectorAll('image'))) {
    if (img.previousElementSibling?.hasAttribute('data-vmarkd-sprite-tile'))
      continue
    if (!img.parentElement?.querySelector('[data-vmarkd-adapted]')) continue
    const box = ['x', 'y', 'width', 'height'].map((a) =>
      Number(img.getAttribute(a)),
    )
    // No explicit geometry (or a degenerate box) → nothing safe to size a tile from.
    if (box.some((v) => !Number.isFinite(v)) || box[2] <= 0 || box[3] <= 0)
      continue
    const [x, y, w, h] = box
    const inset = Math.min(w, h) * SPRITE_TILE_INSET
    const tile = svg.ownerDocument.createElementNS(
      'http://www.w3.org/2000/svg',
      'rect',
    )
    tile.setAttribute('data-vmarkd-sprite-tile', '1')
    tile.setAttribute('x', String(x + inset))
    tile.setAttribute('y', String(y + inset))
    tile.setAttribute('width', String(w - inset * 2))
    tile.setAttribute('height', String(h - inset * 2))
    tile.setAttribute('fill', ink)
    // Match the node card's own corner radius so the tile reads as a deliberate icon chip rather
    // than a stray square — it is only ever VISIBLE for artwork with transparent margins.
    tile.setAttribute('rx', '2.5')
    tile.setAttribute('ry', '2.5')
    img.parentNode?.insertBefore(tile, img)
  }
}

// Full palette-pairing (default per ADR-0006): inject a PlantUML modern `<style>` block built from
// the active diagram palette so every diagram type is themed semantically — element fill = surface,
// lines/borders/lifelines = line, text = fg, notes = accent-tinted — pairing PlantUML with the
// content theme like mermaid (was: foreground-monochrome via themePumlSvg only). The `<style>` route
// (not skinparam) is the cross-diagram-type mechanism; verified offline against the bundled TeaVM
// engine on sequence/class/activity/component/state/mindmap/gantt/json/wbs — all theme cleanly with
// no baked default surviving, and none error on the `<style>` (so it's safe to always inject).
// themePumlSvg still runs afterwards as the safety net (drops the transparent bg rect; neutralises
// any baked default in a user-skinned diagram we DON'T inject into).
function plantumlStyleBlock(): string {
  const p = resolveDiagramPalette()
  // `;`-separated declarations inside `{ }` is valid PlantUML <style> syntax (verified).
  return [
    '<style>',
    'document { BackgroundColor transparent }',
    `root { LineColor ${p.line} ; FontColor ${p.fg} ; BackgroundColor ${p.surface} ; HyperLinkColor ${p.accent} }`,
    `element { LineColor ${p.line} ; FontColor ${p.fg} ; BackgroundColor ${p.surface} }`,
    `arrow { LineColor ${p.line} ; FontColor ${p.fg} }`,
    `note { BackgroundColor ${p.note} ; LineColor ${p.accent} ; FontColor ${p.fg} }`,
    `title { FontColor ${p.fg} }`,
    '</style>',
  ].join('\n')
}

// The author already themes the diagram → leave their colours alone (ADR-0006: user directives win).
const HAS_OWN_THEME = /<style>|^\s*(?:skinparam|!theme)\b/im

// Inject our palette `<style>` INSIDE the @start*/@end* wrapper (PlantUML requires <style> within the
// block) right after the opening directive; if the source has no @start* line (PlantUML allows bare
// source) prepend it (the engine wraps implicitly). No-op when the author supplies their own theme.
// Whether this source themes ITSELF, i.e. we must keep our palette out of it. Exported because the
// render path needs the same answer twice: to skip the `<style>` injection, and to know afterwards
// that the SVG still carries a baked light-page palette that a dark theme has to adapt (task 382).
export function plantumlHasOwnTheme(lines: string[]): boolean {
  return HAS_OWN_THEME.test(lines.join('\n'))
}

export function injectPlantumlTheme(lines: string[]): string[] {
  if (plantumlHasOwnTheme(lines)) return lines
  const style = plantumlStyleBlock().split('\n')
  const i = lines.findIndex((l) => /^\s*@start/i.test(l))
  return i >= 0
    ? [...lines.slice(0, i + 1), ...style, ...lines.slice(i + 1)]
    : [...style, ...lines]
}

// Two warm engine instances, one per diagram-type CATEGORY (class vs non-class), to sidestep the
// vendored TeaVM engine's STICKY diagram-TYPE detection: on a single module instance, once it renders a
// class diagram a later VALID non-class source (sequence/C4/activity…) is misclassified as a class
// diagram and never recovers (task 178). That leak is CROSS-TYPE only — two diagrams of the SAME category
// never poison each other (verified: the old fix never re-imported between two class diagrams). The old
// fix re-imported a fresh ~7 MB module on EVERY class<->non-class switch (~550 ms editing lag); instead we
// keep TWO long-lived instances, each dynamic-imported from a DISTINCT cache-busted URL so it gets
// independent module statics, and route every diagram to the instance for ITS category. Each instance
// then only ever renders one category → it never crosses the boundary that poisons it → ZERO re-import
// during editing. Lazy: each is imported on first use of its category, so a document with only non-class
// diagrams (the norm) still loads just one engine. (task 178 follow-up: dual-instance supersedes the
// single-engine re-import-on-switch; root-caused via the multi-agent reproduction.)
type PumlRenderFn = (lines: string[], targetId: string) => void
type EngineKind = 'class' | 'nonClass'
const engines: Record<EngineKind, PumlRenderFn | null> = {
  class: null,
  nonClass: null,
}
// Cache-bust rev per category — bumped ONLY to force a fresh module URL when a poisoned instance is
// discarded (the rare isClassSource misread; see the renderedIsClass safety net in renderPlantumlBlock).
const engineRev: Record<EngineKind, number> = { class: 0, nonClass: 0 }

// Lazy-import (once) the engine instance for a diagram-type category, from a URL made distinct per
// category (and per discard-rev) so the class engine's sticky type-state can never leak into the
// non-class engine — two distinct module URLs are two independent module instances with their own statics.
async function loadPlantumlEngine(
  kind: EngineKind,
  pumlUrl: string,
): Promise<PumlRenderFn> {
  const cached = engines[kind]
  if (cached) return cached
  engineRev[kind] += 1
  const mod = (await import(
    `${pumlUrl}?engine=${kind}&rev=${engineRev[kind]}`
  )) as { render: PumlRenderFn }
  engines[kind] = mod.render
  // Test/diagnostic observability: count engine module instantiations so an e2e can prove a class<->non-
  // class type switch does NOT re-import (the dual-instance guarantee) — the whole-document total is ≤2
  // (one per category), whereas the old single-engine fix re-imported once per switch (≥4 on 3 switches).
  const w = window as unknown as { __vmarkdPumlEngineLoads?: number }
  w.__vmarkdPumlEngineLoads = (w.__vmarkdPumlEngineLoads ?? 0) + 1
  return mod.render
}

// Cheap probe: does this PlantUML source render as a CLASS diagram? (used only to decide engine resets,
// not to drive rendering; `engineLastClass` is also corrected from the actual render below as a safety
// net). Class markers: class/interface/enum/abstract/annotation keywords; class relations
// (`<|--`/`--|>`/`*--`/`o--`/…); or a connector between two names that is NOT a plain sequence message.
// Sequence message arrows are dashes + an arrowhead (`->`, `-->`, `->>`, `<-`, …) — they carry `>`/`<`
// and NEVER a `.`. So a connector that (a) contains a `.` (dotted: `.->`, `..>`) or (b) has NO
// arrowhead (a bare association: `A - B`, `A -- B`, `A .. B`) is class-diagram syntax. Pure + unit-
// tested; it only needs to FLIP when class<->non-class flips so the engine is reset across that switch.
export function isClassSource(src: string): boolean {
  if (/^\s*(?:abstract\s+)?(?:class|interface|enum|annotation)\b/im.test(src))
    return true
  if (/<\|--|--\|>|\*--|--\*|o--|--o|<\.\.|\.\.>/.test(src)) return true
  for (const line of src.split(/\r\n|\r|\n/)) {
    // capture the connector token (run of arrow/relation chars) between two identifiers
    const m = /^\s*\w[\w.]*\s+([-.<>|*o]+)\s+\w/.exec(line)
    if (!m) continue
    const conn = m[1]
    if (conn.includes('.')) return true // dotted connector (.->, ..>) = class/dependency
    if (!/[<>]/.test(conn)) return true // no arrowhead = bare association = class
  }
  return false
}

// Did the engine ACTUALLY render a class/object diagram? PlantUML draws a circled type icon — a
// standalone single-letter <text> "C"/"I"/"E"/"A" (class/interface/enum/abstract); sequence/activity/
// etc. have none. Used as the safety net for engineLastClass: if isClassSource misreads an exotic arrow
// form, the rendered output corrects it, so the next type switch is still detected (worst case: one
// extra reset = a brief lag, never a stuck wrong diagram). A class literally named "C" would false-
// positive → harmless (an unnecessary reset).
function renderedIsClass(el: HTMLElement): boolean {
  const svg = el.querySelector('svg')
  if (!svg) return false
  for (const t of Array.from(svg.querySelectorAll('text'))) {
    if (/^[CIEA]$/.test((t.textContent ?? '').trim())) return true
  }
  return false
}

// Count the top-level PlantUML diagram OPENERS (`@startuml`/`@startmindmap`/`@startgantt`/…) in one
// fence. The TeaVM engine's render() draws only the FIRST diagram when a source holds several
// `@start…@end` pairs (verified, task 140 Step 0) → the rest would vanish silently, so >1 triggers a
// note. `newpage` is NOT an opener (it paginates WITHIN one `@startuml`, which the engine renders in
// full), so it correctly counts as 1. Anchored to line starts to avoid matching `@start…` inside a
// note/label. Pure + unit-tested.
export function countPlantumlDiagrams(src: string): number {
  return (src.match(/^[ \t]*@start[a-z]+/gim) ?? []).length
}

// task 347: PlantUML render() calls must be SERIALISED across the whole document. Vditor calls
// plantumlRender once PER BLOCK, so opening a multi-diagram doc runs several invocations concurrently —
// which would race the shared TeaVM engine (a render dropped → a block never draws, or a mis-parse). This
// module-level promise chain funnels every block's engine-touching work through one at a time, regardless
// of how many invocations are in flight. (The `loadScript` in-flight dedup fixes the concurrent stdlib-
// map race separately — without it a block reads an unpopulated map and its `!include` fails to expand.)
let renderQueue: Promise<void> = Promise.resolve()

// The per-block critical section (engine reset + render + theme), run one-at-a-time via `renderQueue`.
// `text`/`targetId` + the placeholder are set up synchronously by the caller so a block still queued
// behind others shows "Rendering…" immediately; here we do the engine work once it's this block's turn.
async function renderPlantumlBlock(
  e: HTMLElement,
  text: string,
  targetId: string,
  cdn: string,
  pumlUrl: string,
): Promise<void> {
  try {
    // Drop an obsolete queued render: a later edit's Lute re-spin rebuilds the block's DOM, detaching the
    // element THIS job was enqueued for. Rendering into a detached node wastes a full ~seconds engine pass
    // AND clogs the serialised queue behind the fresh render the re-spin already enqueued — so on a rapid
    // C4 edit the diagram falls tens of seconds behind (measured: 6 spaced keystrokes queued 6 full renders).
    // Skipping detached targets collapses that to the one live render. (Marked with data-processed by the
    // caller, so the fresh element is a distinct node — this never skips the current render.)
    if (!e.isConnected) return
    // Route to the warm engine instance for this diagram's CATEGORY (class vs non-class); each instance
    // only ever renders its own category, so the sticky-type leak (task 178) never triggers → no re-import
    // during editing. isClassSource runs on the ORIGINAL source (expanded C4 macros confuse the probe).
    const wantClass = isClassSource(text)
    const engineKind: EngineKind = wantClass ? 'class' : 'nonClass'
    const renderFn = await loadPlantumlEngine(engineKind, pumlUrl)
    // Resolve stdlib `!include <C4/…>` / `<awslib/…>` / `<azure/…>` OFFLINE (task 136): our engine ships
    // no stdlib + no include hook, so lazy-load the referenced lib file-map(s) and inline the .puml text
    // before render(). loadScript now dedups concurrent loads (task 347) so the map is fully populated.
    // isClassSource above intentionally ran on the ORIGINAL source (expanded C4 macros confuse the probe).
    let pumlText = text
    if (needsStdlib(text) || hasRemoteInclude(text)) {
      const map = await loadStdlib(cdn, referencedStdlibLibs(text))
      pumlText = expandStdlibIncludes(text, map).source
    }
    // Inject the palette `<style>` (unless the author themed it); themePumlSvg runs after as the net.
    // A self-themed source gets NO palette — and after stdlib expansion that is every C4/AWS/Azure
    // diagram, since our own inlined libraries carry hundreds of skinparam lines. Remember it here so
    // the post-pass knows to adapt the baked light-page colours to a dark theme (task 382).
    const pumlLines = pumlText.split(/\r\n|\r|\n/)
    const ownTheme = plantumlHasOwnTheme(pumlLines)
    renderFn(injectPlantumlTheme(pumlLines), targetId)
    // If the fence holds several @startuml diagrams the engine renders only the first (task 140) — flag
    // the dropped ones with a note. From the ORIGINAL source, before stdlib/theme.
    const diagramCount = countPlantumlDiagrams(text)
    let themed = false
    const themeOnce = () => {
      if (themed) return
      themed = true
      removeDiagramLoading(e) // drop the "Rendering…" placeholder if the engine appended (vs replaced)
      themePumlSvg(e, ownTheme)
      if (diagramCount > 1) {
        appendDiagramNote(
          e,
          `Only the first of ${diagramCount} PlantUML diagrams is shown — put each @startuml…@enduml in its own code block.`,
        )
      }
    }
    // TeaVM render() has no completion promise → observe the DOM for the <svg>, and AWAIT it so the queue
    // doesn't release the next block until this one has drawn (the serialization that fixes the race).
    await new Promise<void>((resolve) => {
      let settled = false
      let detachPoll = 0
      let fallback = 0
      const finish = () => {
        if (settled) return
        settled = true
        if (detachPoll) clearInterval(detachPoll)
        if (fallback) clearTimeout(fallback)
        resolve()
      }
      const check = () => {
        if (!e.querySelector('svg')) return
        obs.disconnect()
        themeOnce()
        // Safety net for an isClassSource MISREAD: if the engine actually rendered the OTHER category
        // (detected from the C/I/E/A class icon), THIS instance is now primed for the wrong category and
        // its next same-category render would be poisoned → discard it so that category re-imports fresh
        // next time. Normally the probe is right, so this never fires and no re-import happens.
        if (renderedIsClass(e) !== wantClass) engines[engineKind] = null
        finish()
      }
      const obs = new MutationObserver(check)
      obs.observe(e, { childList: true, subtree: true })
      check() // insurance: the engine may have written the svg before we observed
      // Abandon early if a later edit's re-spin detaches this target MID-render: no svg will ever land in
      // a removed node, and holding the serialised queue for the full fallback stalls the fresh render the
      // re-spin already enqueued (the ~2 s residual on a rapid C4 edit). A MutationObserver on a detached
      // node stops firing, so poll isConnected. (The start-of-render isConnected guard catches jobs already
      // detached when they dequeue; this catches the one that detaches while running.)
      detachPoll = window.setInterval(() => {
        if (!e.isConnected) {
          obs.disconnect()
          finish()
        }
      }, 150)
      // Fallback: never let one block wedge the queue — theme + release after a grace window.
      fallback = window.setTimeout(() => {
        obs.disconnect()
        themeOnce()
        finish()
      }, 5000)
    })
  } catch (error) {
    // HARD infra throw only (engine boot / encode) — PlantUML renders its OWN error SVG for bad source,
    // so this box never fights that; it surfaces the rare infra failure (task 178).
    renderDiagramError(e, 'plantuml', error)
  }
}

// Render every `.language-plantuml` block under `element` via the local TeaVM engine, then theme the
// SVG. Lazy-loads the engine once (no main-bundle cost). element/cdn come from Vditor's previewRender
// through the shim; getElements/getCode are the (trivial) inlined adapter.
export function plantumlRender(
  element: Document | HTMLElement = document,
  cdn = '',
): void {
  const plantumlElements =
    element.querySelectorAll<HTMLElement>('.language-plantuml')
  if (plantumlElements.length === 0) return

  // viz-global.js lives in its own dir (task 144 item 6) — shared with graphviz; plantuml.js stays.
  const vizUrl = `${cdn}/dist/js/viz/viz-global.js`
  const pumlUrl = `${cdn}/dist/js/plantuml/plantuml.js`

  loadScript(vizUrl, 'vditorVizGlobalScript').then(async () => {
    for (const e of Array.from(plantumlElements)) {
      if (
        e.parentElement?.classList.contains('vditor-wysiwyg__pre') ||
        e.parentElement?.classList.contains('vditor-ir__marker--pre')
      ) {
        continue
      }
      if (e.getAttribute('data-processed') === 'true') continue
      const text = (e.getAttribute('data-code') || e.textContent || '').trim()
      if (!text) continue
      // Claim + show the placeholder SYNCHRONOUSLY so a block still queued behind others signals
      // "Rendering…" immediately (task 139); the actual render is serialised on renderQueue (task 347).
      e.setAttribute('data-code', text)
      const targetId = `vmarkd-puml-${Math.random().toString(36).slice(2, 10)}`
      e.id = targetId
      renderDiagramLoading(e, 'plantuml')
      e.setAttribute('data-processed', 'true')
      // Chain onto the shared queue (serialises across concurrent invocations), then await this block's
      // turn. The assignment + await run in one synchronous stretch, so no other invocation can slip
      // between them — `renderQueue` here is this block's promise.
      renderQueue = renderQueue
        .then(() => renderPlantumlBlock(e, text, targetId, cdn, pumlUrl))
        .catch(() => {})
      await renderQueue
    }
  })
}
