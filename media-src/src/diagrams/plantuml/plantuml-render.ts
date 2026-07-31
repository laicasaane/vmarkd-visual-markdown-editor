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
import { mix } from '../../src/mermaid-palettes'
import {
  expandStdlibIncludes,
  hasRemoteInclude,
  needsStdlib,
  type StdlibMap,
} from './plantuml-stdlib'
import {
  PumlTiming,
  pumlTimingEnabled,
  recordPumlTiming,
} from './plantuml-timing'

// PlantUML default-skin colours (snapshot dep `1.2026.7beta3`). Named so a skin change in a future
// PlantUML bump is greppable here, not a silent "renders in the wrong colour" (task 144 item 2): if
// the engine changes its defaults these stop matching and `plantuml-render.test.ts` catches it.
// FOREGROUND = the baked ink (lines, borders, text) we repaint to currentColor so it follows the
// theme. BOX = participant/box fills we flatten to a faint tint. TRANSPARENT = the bg rect we drop.
const PUML_FOREGROUND = new Set(['#181818', '#000000'])
const PUML_BOX_FILL = new Set(['#E2E2F0', '#222222'])
const PUML_TRANSPARENT = '#00000000'
const BOX_FILL_OPACITY = '0.06'

// The vendored libraries that read the mode variable and carry their OWN dark palette (task 384 —
// measured across all ten, the other eight ignore it entirely). Once `injectPumlMode` tells them the
// page is dark they theme themselves BETTER than our compensation can: domainstory picks a light
// icon ink (the only way to fix it — the ink is baked into a sprite data URI), awslib picks black
// cards with white labels. So for these two we must ALSO step out of the way, because our passes are
// written for a light-page palette and actively fight a dark one: awslib's `#000000` card matches the
// baked-ink rule and becomes `currentColor`, i.e. a near-white card under white text (measured,
// `tmp/icons/probe-compon/block-8.png`). Which libraries those are is a per-library FACT, so it lives
// with the rest of each library's metadata in `STDLIB` below (`modeAware`), not in a second list
// keyed on the same names.
export function usesModeAwareStdlib(source: string): boolean {
  return referencedStdlibLibs(source).some((l) => STDLIB[l]?.modeAware)
}

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
// A wider bar than NEUTRAL_SPREAD, for a DIFFERENT question: not "is this basically grey" but "is
// this a clearly-saturated identity hue" (task 383's k8s border, #3C7FC0, spread 132). AWS/Azure's
// grey-blue chrome (#7D8998, spread 27) sits just past NEUTRAL_SPREAD and must stay untouched — it
// reads as chrome, not a brand colour, and the border-mute pass below would otherwise catch it too.
const IDENTITY_STROKE_SPREAD = 60

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
//
// ONE descriptor per library rather than three parallel tables keyed on the same name (`file` +
// `deps` + `modeAware`): the split versions had to be edited in lockstep by hand, with only a comment
// enforcing it — the very failure mode `engine-registry.ts` was built to end for diagram engines.
interface StdlibLib {
  /** the lazy JS file-map that carries this library's sources */
  file: string
  /** libs this one `!include`s internally, which the user's source never names */
  deps?: string[]
  /** reads PUML_MODE and themes ITSELF for a dark page (task 384) */
  modeAware?: boolean
}
const STDLIB: Record<string, StdlibLib> = {
  c4: { file: 'c4.js' },
  // task 384 — awslib picks its own dark palette (black card, white labels) once told the mode, so
  // the light-page compensation must NOT also run on it.
  awslib: { file: 'awslib.js', modeAware: true },
  azure: { file: 'azure.js' },
  // task 354 — MIT/Apache icon libs from the plantuml-stdlib aggregator. Keys are the LOWERCASED include
  // prefix (referencedStdlibLibs lowercases before lookup); the map keys inside each .js keep the prefix's
  // real case (e.g. domainstory.js carries `DomainStory/…` — `!include <DomainStory/domainStory>`).
  // `deps` = a lib this one `!include`s internally, which the user's own source never names — without
  // loading it too, the transitive include goes missing. (task 354) k8s/Common builds on C4
  // (`!include <C4/C4>`), so a `<k8s/…>` diagram needs c4.js alongside k8s.js.
  k8s: { file: 'k8s.js', deps: ['c4'] },
  eip: { file: 'eip.js' },
  edgy: { file: 'edgy.js' },
  // (task 384) domainstory ships NO sprites — it pulls each one with `!include <material2.1.19/$icon>`,
  // a key our textual expander can never resolve because `$icon` is a procedure parameter. It does not
  // need to: the include is not load-bearing (the library's `%set_variable_value($var, "$ma_" + $icon)`
  // runs regardless), so an icon draws as soon as its sprite EXISTS. We therefore load the trimmed
  // material map alongside and let the expander inline it whole — see the variable-key branch in
  // plantuml-stdlib.ts. Task 354 recorded material as "an unvendored 16 MB lib" and skipped it; that
  // figure is material7.4.47. The set domainstory includes is material2.1.19, and the 15 icons it names
  // by default are 15 KB packed.
  //
  // It also bakes its icon ink under `PUML_MODE ?= "light"` into a sprite data URI no post-pass can
  // repaint (task 384) — hence modeAware.
  domainstory: {
    file: 'domainstory.js',
    deps: ['material2.1.19'],
    modeAware: true,
  },
  cloudogu: { file: 'cloudogu.js' },
  cloudinsight: { file: 'cloudinsight.js' },
  kubernetes: { file: 'kubernetes.js' },
  // task 384 — the 15 icons domainstory names by default, recompressed (15 KB). NOT a general
  // material set: the key is the include prefix domainstory writes, version and all.
  'material2.1.19': { file: 'material.js' },
}
const stdlibLoaded = new Set<string>()

// Close a lib list under each lib's `deps` (transitively), so referencing k8s also pulls c4.
function withStdlibDeps(libs: string[]): string[] {
  const out = new Set<string>()
  const add = (lib: string) => {
    if (out.has(lib)) return
    out.add(lib)
    for (const dep of STDLIB[lib]?.deps ?? []) add(dep)
  }
  for (const lib of libs) add(lib)
  return [...out]
}

// The stdlib libs a source references — the lowercased prefix before the first `/` of each `<lib/…>`,
// closed under each lib's `deps` (so a `<k8s/…>` source also names c4). Exported for the unit test.
export function referencedStdlibLibs(source: string): string[] {
  const libs = new Set<string>()
  const re = /^\s*!include(?:_many|_once|url)?\s+<([^/>]+)\//gim
  let m: RegExpExecArray | null = re.exec(source)
  while (m) {
    const lib = m[1].trim().toLowerCase()
    if (STDLIB[lib]) libs.add(lib)
    m = re.exec(source)
  }
  return withStdlibDeps([...libs])
}

// Lazy-load the referenced stdlib file-maps (once each) and return the merged map they populate.
async function loadStdlib(cdn: string, libs: string[]): Promise<StdlibMap> {
  for (const lib of libs) {
    if (stdlibLoaded.has(lib)) continue
    await loadScript(
      `${cdn}/dist/js/plantuml-stdlib/${STDLIB[lib].file}`,
      `vditorPumlStdlib_${lib}`,
    )
    stdlibLoaded.add(lib)
  }
  return (
    (window as unknown as { __vmarkdPumlStdlib?: StdlibMap })
      .__vmarkdPumlStdlib ?? {}
  )
}

// The engine emits a fully-transparent backdrop rect; left in place it composites a stray box over
// the page background.
function dropTransparentBgRect(svg: SVGElement): void {
  for (const r of Array.from(svg.querySelectorAll('rect'))) {
    const f = r.getAttribute('fill')
    const s = r.getAttribute('stroke')
    if (f === PUML_TRANSPARENT && (s === PUML_TRANSPARENT || !s)) r.remove()
  }
}

// Repaint a rendered PlantUML SVG to be theme-agnostic: baked foreground → currentColor, box fills →
// a faint currentColor tint, transparent bg rect removed. Pure DOM walk (querySelectorAll +
// setAttribute) — NOT an innerHTML serialize→reparse (task 144 item 3: the old reparse cost a full
// reflow on large diagrams + dropped listeners). Idempotent: a second pass finds currentColor, which
// is in none of the colour sets, so it's a no-op.
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: recolors every PlantUML SVG element kind against the paired palette, idempotently; pre-existing (task 469 baseline)
export function themePumlSvg(
  container: HTMLElement,
  adaptBaked = false,
  nativeDark = false,
): void {
  const svg = container.querySelector('svg')
  if (!svg) return
  // The library already themed itself for a dark page (task 384 — it read PUML_MODE, which we set
  // from the palette). Every pass below assumes a LIGHT-page palette, so running them here inverts a
  // correct render: keep only the transparent-backdrop removal, which is a rendering artefact and not
  // a colour choice.
  if (nativeDark) {
    dropTransparentBgRect(svg)
    return
  }
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
  dropTransparentBgRect(svg)
  // Task 382 — the diagrams above are the ones we DID theme at source. A diagram carrying its own
  // skinparam/<style> (every stdlib one) skipped that, so its baked light-page palette is still here:
  // adapt it to a dark theme. Runs LAST so it only ever sees what the passes above left alone.
  if (adaptBaked) adaptBakedColours(svg)
}

/**
 * Re-apply the sprite backing to already-rendered PlantUML SVGs under `container`, without going
 * anywhere near the engine.
 *
 * The render cache paints stored markup verbatim — no render, so no theming pass. But the sprite
 * composite is ASYNCHRONOUS (canvas decode), and the cache snapshots `innerHTML` on a childList
 * observer that never sees the later href swap, so the bytes it stores can be the raw artwork. A
 * cache HIT would then serve icons with their highlights knocked out — task 382's defect, back via
 * the cache. Running this after a cached paint makes the warm result converge on the cold one
 * whichever bytes were stored; already-backed sprites carry `data-vmarkd-sprite-filled` and are
 * skipped, so it costs nothing when the cache did hold the final markup.
 */
export function backSpritesIn(container: ParentNode | null | undefined): void {
  if (!container) return
  const svgs = Array.from(container.querySelectorAll('svg'))
  if (!svgs.length) return
  let palette: ReturnType<typeof resolveDiagramPalette>
  try {
    palette = resolveDiagramPalette()
  } catch {
    return
  }
  // Same gate as the render path: only a dark theme darkens the card, and only a darkened card
  // needs the icon backed (the markers left by adaptBakedColours are what backSprites keys off).
  if (!palette.dark) return
  for (const svg of svgs) backSprites(svg as SVGElement, palette.fg)
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
      // The library's own (chromatic, non-grey) border stroke was tuned to sit on the light card
      // it drew — full-brightness identity blue read as a bright frame once we darkened the fill
      // underneath it (measured: k8s.js's #3C7FC0 border, luminance 0.20, against our #23272d
      // surface at 0.02 — a 10x jump). Muting it toward the new fill keeps the hue (still
      // recognisably "this library's blue") while it stops popping like a fresh outline. Scoped to
      // elements WE darkened, same as the sprite backing below — a border the library drew on its
      // own saturated identity colour (cloudogu's PRIMARY_COLOR fill) is untouched.
      const stroke = parseRgb(el.getAttribute('stroke') ?? '')
      if (
        stroke &&
        Math.max(...stroke) - Math.min(...stroke) > IDENTITY_STROKE_SPREAD
      )
        el.setAttribute(
          'stroke',
          mix(el.getAttribute('stroke') as string, fill, 0.5),
        )
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
// Backing the whole image box is the crude version of this: a rectangle is not the icon's shape, so
// it shows as a badge wherever the artwork leaves margins (Azure's monitor sits in the top of its
// square, so the bottom of the tile was a visible strip). The right backing is the icon's OWN outline
// filled in — flood-fill the transparent pixels from the border, and everything the fill cannot reach
// is inside the artwork. Paint that region white, draw the artwork over it, and nothing extra is
// visible: the knock-outs get their white back and the margins stay transparent. Audited over all 687
// vendored sprites — 473 carry such holes, up to 88% of the icon's area in the `eip` set.
//
// `compositeSprite` does that per sprite and swaps the image's own href, so no element is added to the
// SVG at all. It needs a canvas, so when there is none (a test DOM, a decode failure) we fall back to
// the inset rectangle rather than leaving the icon with no backing.
//
// ONLY where we darkened the backdrop ourselves. C4's `person` sprite is WHITE artwork on a saturated
// blue box we never touch — backing that one turned the figure white-on-white, a worse regression than
// the one being fixed. The `data-vmarkd-adapted` marker is what tells the two cases apart.
const SPRITE_TILE_INSET = 0.08 // of the sprite's shorter side, for the fallback rectangle
function backSprites(svg: SVGElement, ink: string): void {
  for (const img of Array.from(svg.querySelectorAll('image'))) {
    if (
      img.previousElementSibling?.hasAttribute('data-vmarkd-sprite-tile') ||
      img.hasAttribute('data-vmarkd-sprite-filled')
    )
      continue
    if (!img.parentElement?.querySelector('[data-vmarkd-adapted]')) continue
    if (fillSpriteShape(img, ink)) continue // preferred path; falls through to the rectangle if unavailable
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

// Alpha at or below this is "not artwork". NOT zero, and that is a measured value rather than a
// guess: the 216 `kubernetes` sprites encode their knock-outs at grey level 1 of 15 (~7% alpha), so a
// strict ==0 test found holes in 148 of them instead of 214 and would have skipped the whole library
// while looking clean in the numbers.
const SPRITE_ALPHA_FLOOR = 40 // of 255

// The icon's shape: flood-fill the transparent pixels inward from the border; every pixel the fill
// cannot reach is inside the artwork's outline — the artwork itself plus the holes it encloses.
// Exported for the unit test; pure, so it needs no canvas.
export function filledShapeMask(
  rgba: Uint8ClampedArray | number[],
  w: number,
  h: number,
): Uint8Array {
  const outside = new Uint8Array(w * h)
  const stack: number[] = []
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const i = y * w + x
    if (outside[i] || rgba[i * 4 + 3] > SPRITE_ALPHA_FLOOR) return
    outside[i] = 1
    stack.push(i)
  }
  for (let x = 0; x < w; x++) {
    push(x, 0)
    push(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    push(0, y)
    push(w - 1, y)
  }
  while (stack.length) {
    const i = stack.pop() as number
    const x = i % w
    const y = (i / w) | 0
    push(x + 1, y)
    push(x - 1, y)
    push(x, y + 1)
    push(x, y - 1)
  }
  const inside = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) if (!outside[i]) inside[i] = 1
  return inside
}

// Shrink the paintable region by one ring so the ink sits STRICTLY behind the artwork's opaque
// core rather than reaching all the way to its outline. `filledShapeMask`'s outer boundary is the
// artwork's OWN edge, which is anti-aliased (partial alpha) rather than a hard cutoff, so ink
// painted right up to it shows THROUGH that semi-transparent fringe and lightens it.
//
// NOTE, so nobody re-derives this the hard way: eroding does NOT fix the reported white rim
// ("na brzegach ikon wystaje"). That rim is baked into the artwork — see `bleedOuterFringe`, which
// is the actual fix. Erosion only stops OUR ink from adding to it, and is kept because the two
// compose: bleed makes the fringe the icon's own colour, erosion keeps light ink from sitting
// behind it. A pixel keeps its "paint ink here" status only if all 4 neighbours are ALSO in the
// mask, so this only ever pulls back from a boundary against genuine margin — an ENCLOSED hole
// (the whole reason the ink pass exists, task 382) is entirely surrounded by other in-mask pixels
// and never touches that boundary, so its own backing is untouched. Kept separate from
// `filledShapeMask` itself (unchanged contract, still used bare by anything that wants the true
// silhouette) — this is a paint-only adjustment. ONE ring is not enough on its own (measured: 24%
// of the k8s fringe still had ink under it); `erodeInkClearOfFringe` is what `compositeSprite`
// actually calls, and it repeats this until the ink clears the fringe.
export function erodeInward(
  mask: Uint8Array,
  w: number,
  h: number,
): Uint8Array {
  const out = new Uint8Array(w * h)
  const on = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue
      out[y * w + x] =
        on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1) ? 1 : 0
    }
  }
  return out
}

// The artwork's anti-aliased OUTER edge: a flood fill from the border that stops at FULLY OPAQUE
// pixels — unlike `filledShapeMask`, which stops at the alpha floor and so treats the whole fringe
// as "inside". Reaching into the fringe but halting at the solid body is what makes everything
// ENCLOSED by artwork (the `pod`/`api` lettering, gear glyphs, the knock-out holes task 382 backs)
// excluded by construction. Two passes need exactly this region, from opposite sides: the bleed
// below recolours it, `erodeInkClearOfFringe` keeps our ink out from under it.
export function outerFringeMask(
  rgba: Uint8ClampedArray | number[],
  w: number,
  h: number,
): Uint8Array {
  const fringe = new Uint8Array(w * h)
  const stack: number[] = []
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const p = y * w + x
    if (fringe[p] || rgba[p * 4 + 3] === 255) return
    fringe[p] = 1
    stack.push(p)
  }
  for (let x = 0; x < w; x++) {
    push(x, 0)
    push(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    push(0, y)
    push(w - 1, y)
  }
  while (stack.length) {
    const p = stack.pop() as number
    const x = p % w
    const y = (p / w) | 0
    push(x + 1, y)
    push(x - 1, y)
    push(x, y + 1)
    push(x, y - 1)
  }
  return fringe
}

// A fringe wider than this is not anti-aliasing any more; stop before erosion eats a thin glyph.
const MAX_INK_EROSION = 4

/**
 * Pull the ink backing back until it sits under NO partial-alpha pixel of the outer fringe.
 *
 * A single `erodeInward` ring was not enough, and the shortfall was measured rather than guessed:
 * on the k8s sprites the fringe is 328 px, of which **80 (24.4%) still had ink underneath** — and
 * that ink is `palette.fg` (`#e6edf3` on github-dark, near-white), so those pixels composited as
 * `a*icon + (1-a)*near-white` instead of against the card. Average lift **+26.6**, peak **+77** per
 * channel: the pale line still visible along the edge after `bleedOuterFringe` fixed the colour
 * bleeding through it. Two rings clear it on k8s; the loop measures instead of hard-coding, since
 * fringe width varies with the sprite (azure 70x70, awslib 64x64, cloudinsight 48x48).
 *
 * Chosen over the alternative — pre-compositing the fringe over the card colour ourselves and
 * making it opaque — because that bakes the theme's surface colour into a CACHED sprite, so the
 * `spriteBackings` key and the render cache would both have to learn about it or a theme flip would
 * show a halo in the previous theme's colour. This keeps alpha untouched and lets the browser do
 * the compositing it was already doing correctly; the two look identical (modelled side by side at
 * 22x on the real sprites before choosing).
 *
 * Erosion only ever shrinks the mask's boundary against genuine margin, so an ENCLOSED hole — the
 * whole reason the ink pass exists — is surrounded by in-mask pixels and keeps its backing however
 * many rings this takes. Pure (no canvas) so the unit test can drive it directly.
 */
export function erodeInkClearOfFringe(
  mask: Uint8Array,
  rgba: Uint8ClampedArray | number[],
  w: number,
  h: number,
): Uint8Array {
  const fringe = outerFringeMask(rgba, w, h)
  // The first ring is unconditional: it is what keeps ink off the artwork's own outline, and an
  // opaque sprite with no fringe at all (the whole `kubernetes` set) still needs it.
  let out = erodeInward(mask, w, h)
  for (let ring = 1; ring < MAX_INK_EROSION; ring++) {
    let clashes = false
    for (let p = 0; p < w * h && !clashes; p++)
      clashes = !!(out[p] && fringe[p])
    if (!clashes) break
    out = erodeInward(out, w, h)
  }
  return out
}

// The fringe is at most a couple of pixels wide; this only bounds a pathological sprite.
const BLEED_PASSES = 12

/**
 * Repair the white rim these sprites carry on a dark page.
 *
 * MEASURED, not assumed: the stdlib sprites are anti-aliased against a WHITE page, so their
 * semi-transparent edge pixels hold white-contaminated RGB. Proof from a real k8s sprite — the
 * edge pixel `(128,185,227)` at alpha 212, un-composited from white, is exactly `(102,171,221)`,
 * the icon's own dominant blue, on all three channels. On the white page PlantUML drew for, that
 * fringe is invisible; on ours it reads as a light halo just outside the silhouette. It is in the
 * ARTWORK, which is why neither the ink backing nor `erodeInward` could touch it.
 *
 * The fix: give every pixel of the OUTER fringe the colour of the nearest fully-opaque pixel,
 * leaving alpha alone — so the silhouette stays exactly as smooth as the engine drew it, only the
 * colour bleeding through it changes.
 *
 * "Outer fringe" is a second flood fill from the border, this one stopping at FULLY OPAQUE pixels
 * (`filledShapeMask` stops at the alpha floor instead). That reaches into the anti-aliased edge and
 * halts at the solid body, so anything enclosed by artwork is excluded BY CONSTRUCTION — the `pod`
 * lettering, a gear glyph, and the knock-out holes task 382 exists to back are all interior and are
 * never touched. That distinction is load-bearing and was found by rendering: bleeding every
 * partial-alpha pixel instead (the obvious cheap version) erased the white `pod` lettering, since
 * its own anti-aliasing is partial-alpha sitting on solid blue.
 *
 * Sprites with no fully transparent pixel at all have no outer fringe and are returned untouched —
 * that is the whole `kubernetes` set (opaque + inverted, task 383's still-open half), which this
 * pass must not touch: verified 0 pixels changed there.
 *
 * Pure (no canvas) so the unit test can drive it directly, like `filledShapeMask`.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: per-pixel fringe-bleed mask over rows/columns/neighbour checks; pre-existing (task 469 baseline)
export function bleedOuterFringe(
  rgba: Uint8ClampedArray | number[],
  w: number,
  h: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length)
  out.set(rgba)
  let hasTransparent = false
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] === 0) {
      hasTransparent = true
      break
    }
  }
  if (!hasTransparent) return out

  const fringe = outerFringeMask(rgba, w, h)

  // Grow the opaque colour outward one ring per pass. Updates are collected and applied at the end
  // of each pass so a pixel never reads a value written in the same ring (which would smear one
  // side's colour along the edge instead of spreading evenly from the body).
  const known = new Uint8Array(w * h)
  for (let p = 0; p < w * h; p++) if (rgba[p * 4 + 3] === 255) known[p] = 1
  for (let pass = 0; pass < BLEED_PASSES; pass++) {
    const newly: [number, number, number, number][] = []
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x
        if (known[p] || !fringe[p]) continue
        if (rgba[p * 4 + 3] === 0) continue // fully transparent — nothing renders, nothing to fix
        let r = 0
        let g = 0
        let b = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
            const q = ny * w + nx
            if (!known[q]) continue
            r += out[q * 4]
            g += out[q * 4 + 1]
            b += out[q * 4 + 2]
            n++
          }
        }
        if (!n) continue
        newly.push([p, Math.round(r / n), Math.round(g / n), Math.round(b / n)])
      }
    }
    if (!newly.length) break
    for (const [p, r, g, b] of newly) {
      out[p * 4] = r
      out[p * 4 + 1] = g
      out[p * 4 + 2] = b
      known[p] = 1
    }
  }
  return out
}

const spriteBackings = new Map<string, string>()
// Sprites whose composite is in flight — see fillSpriteShape for why this is NOT a DOM attribute.
const spritesInFlight = new WeakSet<Element>()

// Probed ONCE and remembered: jsdom ships the element but no 2d context, and every probe there logs a
// "not implemented" line, so asking per sprite would spam the test output for no new information.
let canvasOk: boolean | null = null
function canvasAvailable(): boolean {
  if (canvasOk === null) {
    try {
      canvasOk = !!document.createElement('canvas').getContext('2d')
    } catch {
      canvasOk = false
    }
  }
  return canvasOk
}

const setHref = (img: Element, url: string) => {
  img.setAttribute('href', url)
  if (img.hasAttribute('xlink:href')) img.setAttribute('xlink:href', url)
}

// Start (or reuse) the composite for one sprite. Returns false when this environment cannot do it, so
// the caller falls back to the rectangle instead of leaving the icon unbacked. Marks the element up
// front, so a re-theme never composites the same sprite twice.
function fillSpriteShape(img: Element, ink: string): boolean {
  const href = img.getAttribute('href') ?? img.getAttribute('xlink:href')
  if (!href || typeof document === 'undefined') return false
  if (!canvasAvailable()) return false
  // Keyed by colour too: a theme flip re-themes with a different ink, and the old composite would be
  // the previous theme's grey baked into the icon.
  const key = `${ink}|${href}`
  const cached = spriteBackings.get(key)
  if (cached) {
    setHref(img, cached)
    img.setAttribute('data-vmarkd-sprite-filled', '1')
    return true
  }
  // The done-marker goes on ONLY once the href is actually swapped. It used to be set here, before
  // the (asynchronous) composite — and the render cache snapshots `innerHTML` on its own schedule,
  // so it could store a sprite that carried the marker but still had the RAW artwork. On the next
  // open the cached bytes were painted, `backSprites` saw the marker and skipped, and the icon kept
  // its knocked-out highlights for good: the exact defect task 382 exists to fix, silently
  // reintroduced by a cache hit. In-flight bookkeeping is a WeakSet rather than an attribute so it
  // can never be serialised into the cache the same way.
  if (spritesInFlight.has(img)) return true
  spritesInFlight.add(img)
  void compositeSprite(href, ink).then((url) => {
    spritesInFlight.delete(img)
    if (!url) return
    spriteBackings.set(key, url)
    setHref(img, url)
    img.setAttribute('data-vmarkd-sprite-filled', '1')
  })
  return true
}

// Paint the icon's filled outline, then the artwork over it, and hand back a new data URI. The source
// is a data URI, so the canvas is never tainted and toDataURL is allowed.
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: canvas compositing with load/draw/encode error-handling branches; pre-existing (task 469 baseline)
async function compositeSprite(
  href: string,
  ink: string,
): Promise<string | null> {
  try {
    const src = new Image()
    src.src = href
    await src.decode()
    const w = src.naturalWidth
    const h = src.naturalHeight
    if (!w || !h) return null
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(src, 0, 0)
    const pixels = ctx.getImageData(0, 0, w, h).data
    const mask = erodeInkClearOfFringe(
      filledShapeMask(pixels, w, h),
      pixels,
      w,
      h,
    )
    // De-halo the artwork BEFORE it goes back down (see bleedOuterFringe). Drawn from its own
    // canvas rather than putImageData'd onto this one: putImageData REPLACES the destination
    // instead of compositing, which would wipe the ink underneath.
    const artwork = document.createElement('canvas')
    artwork.width = w
    artwork.height = h
    const actx = artwork.getContext('2d')
    if (!actx) return null
    const fixed = actx.createImageData(w, h)
    fixed.data.set(bleedOuterFringe(pixels, w, h))
    actx.putImageData(fixed, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = ink
    // One rect per horizontal run of the mask — far fewer draw calls than per pixel.
    for (let y = 0; y < h; y++) {
      let run = -1
      for (let x = 0; x <= w; x++) {
        const on = x < w && mask[y * w + x] === 1
        if (on && run < 0) run = x
        else if (!on && run >= 0) {
          ctx.fillRect(run, y, x - run, 1)
          run = -1
        }
      }
    }
    ctx.drawImage(artwork, 0, 0)
    return canvas.toDataURL('image/png')
  } catch {
    return null // decode/canvas failure → the caller already marked it; no backing is better than a crash
  }
}

// Task 355 step 3 — "bigger diagram, SAME text size". PlantUML's geometry is text-driven, so the only
// way to grow the drawing without growing the labels is to make the ENGINE lay out at a smaller font
// and then scale the finished SVG back up: at 1.5x, a 9pt layout font lands on screen at 13.5px (the
// engine's own default is 14/13/12/11 depending on element, i.e. what it looked like before) while
// every non-text dimension — padding, node/rank separation, stroke widths, arrowheads — grows by 50%.
//
// Why not the obvious alternative (scale the SVG and shrink `font-size` on the rendered <text>): the
// engine has already PLACED each label for its original width. Shrinking the glyphs afterwards leaves
// centred labels hanging left of their box (or, if re-centred, left-aligned rows raggedly indented) by
// 8-16px. Letting the engine do the layout keeps the alignment exact, at the cost of collapsing its
// font hierarchy to one size. Measured, not assumed (tmp/puml-font/probe.mjs): class 106x221 -> 83x204
// -> 124x306; activity 147x248 -> 130x240 -> 195x360.
//
// Both halves are ONE mechanism and must stay paired: the scale is applied only to diagrams we
// injected the smaller font into (`ownTheme === false`). A self-themed / stdlib diagram keeps its own
// fonts, so scaling it would just re-create the "za duże czcionki" bug this task removed.
// Being re-tuned by eye with the user (task 355 step 4). The 9/1.5 and 7/1.7 pairs both came back
// with the labels OVERFLOWING their shapes in the user's editor — text drawn ~2.1x wider than the box
// the engine laid out for it — while the identical render measures correct here (computed font-size
// == the attribute, box 51.1 units vs text 31.1 + 2x10 padding) on VS Code 1.129 AND 1.130. The
// symptom scales with how small the injected font is (14 fits, 12/11 grazes, 9 clips, 7 spills), i.e.
// that environment has a ~14px MINIMUM font size: any smaller `font-size` is drawn at ~14 anyway, so
// the engine's layout — computed for the small font — no longer contains the glyphs.
//
// So the whole "lay out small, scale up" lever is unusable there, and PlantUML offers no substitute:
// `skinparam padding` is rejected outright ("Please use CSS style instead") and the modern style's
// Padding/Margin + nodesep/ranksep move the layout by a few percent (measured). Until that floor is
// confirmed or explained, render at a UNIFORM 14 — no size below the floor, so nothing can overflow
// (this also fixes the native 11px activity labels grazing their hexagon) — and no scale.
// OFF by the user's call (2026-07-29): the whole POST-RENDER pass is disabled — `themePumlSvg` (baked
// foreground -> currentColor, box fills -> tint, transparent bg-rect removal), the dark adaptation of
// baked light-page palettes (`adaptBakedColours`) and, with it, the bitmap-sprite ink backing
// (`backSprites`/`fillSpriteShape`, which adaptBakedColours drives) plus its post-cache re-apply
// (`backSpritesIn`, gated on this flag at the call site in render-cache-client.ts).
//
// Gated at the CALL SITES, not inside the functions: the mechanisms and their unit tests stay intact,
// so flipping this back to `true` restores the previous behaviour with no other edit. What changes
// while it is off: a stdlib/self-themed diagram (C4, AWS, k8s) renders EXACTLY as the engine drew it,
// i.e. its light-page palette survives on a dark theme; our own diagrams are still coloured, but at
// SOURCE by the injected palette `<style>` (which is unaffected) rather than by this safety net; and
// the engine's transparent backdrop rect is left in place.
export const PUML_POST_RENDER_THEMING = false

// SETTLED by the user on this render ("niech zostanie jak jest teraz"). Exported so the guards assert
// the shipped pair rather than a number copied into a spec that then drifts from it.
export const PUML_LAYOUT_FONT_SIZE = 14
export const PUML_SVG_SCALE = 1

// Apply that scale: multiply the svg's width/height attributes, leaving the viewBox alone so the
// drawing stretches to fit. At the settled PUML_SVG_SCALE of 1 this only re-states the engine's own
// size — the mechanism is kept (rather than deleted) because it is the other half of the layout-font
// pair above, and the pinning pass below runs with it. Idempotent — a second pass sees
// `data-vmarkd-scaled` and does nothing (themeOnce runs once per render, but the retheme path
// re-walks rendered SVGs).
export function scalePumlSvg(container: HTMLElement, ownTheme: boolean): void {
  if (ownTheme) return
  const svg = container.querySelector('svg')
  if (!svg || svg.hasAttribute('data-vmarkd-scaled')) return
  const vb = (svg.getAttribute('viewBox') ?? '').split(/[ ,]+/).map(Number)
  // No viewBox = nothing defines the drawing's own coordinate system, so scaling the width/height
  // would crop rather than zoom. Leave those untouched (the engine always emits one; this is a guard).
  if (vb.length !== 4 || !vb[2] || !vb[3]) return
  svg.setAttribute('width', String(Math.round(vb[2] * PUML_SVG_SCALE)))
  svg.setAttribute('height', String(Math.round(vb[3] * PUML_SVG_SCALE)))
  // Defensive (task 355 step 4): re-state each label's size as an INLINE STYLE. `font-size` on
  // <text> is a presentation attribute, which sits at the bottom of the cascade — any author rule
  // that happens to match SVG text overrides it, and the layout the engine computed no longer fits
  // the glyphs. An inline style beats every non-`!important` rule, so this rules out one of the two
  // candidate causes of the overflow reported against the 9/1.5 and 7/1.7 builds (the other being a
  // browser minimum-font-size floor, which no cascade trick can defeat).
  for (const t of Array.from(svg.querySelectorAll('text'))) {
    const size = t.getAttribute('font-size')
    if (size) (t as SVGTextElement).style.fontSize = `${size}px`
  }
  svg.setAttribute('data-vmarkd-scaled', '1')
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
    `root { FontSize ${PUML_LAYOUT_FONT_SIZE} ; LineColor ${p.line} ; FontColor ${p.fg} ; BackgroundColor ${p.surface} ; HyperLinkColor ${p.accent} }`,
    `element { LineColor ${p.line} ; FontColor ${p.fg} ; BackgroundColor ${p.surface} }`,
    `arrow { LineColor ${p.line} ; FontColor ${p.fg} }`,
    `note { BackgroundColor ${p.note} ; LineColor ${p.accent} ; FontColor ${p.fg} }`,
    `title { FontColor ${p.fg} }`,
    '</style>',
  ].join('\n')
}

// Raise every font size the INLINED STDLIB declares to the layout floor (task 355 step 6).
//
// The icon libraries theme themselves, so `plantumlStyleBlock`'s FontSize never reaches them and they
// lay out with their own sizes — measured from a real render: the stereotype and technology lines
// («AzureVirtualMachine», [Standard_D2s_v3], «namespace», [Namespace]) are 12, the names are 16. In
// the user's editor anything below ~14 is DRAWN at ~14 (see the step-4 note), so exactly the 12s
// overflow their card while the 16s sit fine — which is precisely what they reported. Rewriting the
// declarations to 14 makes the engine lay out for the size that actually gets drawn.
//
// Textual, on the EXPANDED source, because that is where the library's own `skinparam …FontSize 12` /
// `<style>` `FontSize 12` lines live; `FontSize` is a specific enough token that no sprite payload or
// unrelated number matches. Scoped to sources that pull a stdlib library, so a hand-written
// `skinparam defaultFontSize 10` stays the author's call (ADR-0006: user directives win).
export function raiseStdlibFontFloor(source: string): string {
  // `FontSize 0` is awslib's "no text" marker, not a small size — raising it to 14 would print
  // labels the library deliberately suppresses. Only 1..floor-1 is a too-small size.
  // No `\b` before FontSize: the declarations that actually carry the small sizes are COMPOUND —
  // `skinparam rectangleStereotypeFontSize 12` — and a word boundary between "Stereotype" and
  // "FontSize" does not exist, so anchoring skipped exactly the lines this is here to rewrite.
  const raise = (whole: string, head: string, n: string) =>
    Number(n) === 0 || Number(n) >= PUML_LAYOUT_FONT_SIZE
      ? whole
      : `${head}${PUML_LAYOUT_FONT_SIZE}`
  return (
    source
      // style / skinparam literals, including the compound spellings (`rectangleStereotypeFontSize`).
      .replace(/(FontSize\s+)(\d+)/gi, raise)
      // The LEGACY preprocessor form — `!define TECHN_FONT_SIZE 12` — which azure and awslib use for
      // the [technology] line. It is a different namespace from C4's `$`-variables, so the `!global`
      // injection below cannot reach it; measured, after that injection already fixed «stereotype»
      // while `[Standard_D2s_v3]` stayed at 12.
      .replace(/(_FONT_SIZE\s+)(\d+)/g, raise)
  )
}

// The other half of the same floor, and the one that actually reaches the labels the user reported.
// C4-PlantUML (which azure/k8s/awslib pull in transitively) does not write its sizes as literals — it
// declares preprocessor variables with `?=` defaults and interpolates them into creole `<size:…>`
// tags, so no textual rewrite of the expanded source can reach them. Measured defaults:
// `$STEREOTYPE_FONT_SIZE ?= 12`, `$TECHN_FONT_SIZE ?= 12`, `$ARROW_FONT_SIZE ?= 12` — i.e. exactly the
// «stereotype» and [technology] lines that overflow, while the 16-unit name lines fit.
//
// Same mechanism as injectPumlMode: `?=` assigns only when unset, so a `!global` PREPENDED (before
// stdlib expansion inlines the library) wins and the library's default never applies. An author's own
// assignment sits after ours in the source and still overrides it.
//
// NOTE one C4 variant defaults `$TECHN_FONT_SIZE ?= 18`; this pins it to 14, i.e. slightly SMALLER
// there. Deliberate — 14 is the floor, so it cannot overflow either way, and one uniform value beats
// tracking which variant a diagram happened to load.
export function injectStdlibFontFloor(source: string): string {
  const globals = [
    '$STEREOTYPE_FONT_SIZE',
    '$TECHN_FONT_SIZE',
    '$ARROW_FONT_SIZE',
  ].map((v) => `!global ${v} = ${PUML_LAYOUT_FONT_SIZE}`)
  return insertAfterStart(source.split(/\r\n|\r|\n/), globals).join('\n')
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

// Tell a stdlib library which page it is drawing for, so it can pick its OWN dark palette instead of
// the light-page one it defaults to (task 384: domainstory bakes `#1f2833` icon ink under
// `PUML_MODE ?= "light"`, illegible on our dark page — and the ink lives in a sprite data URI that no
// post-pass can repaint, so the mode has to be decided BEFORE the engine runs).
//
// BOTH spellings, because they are two DIFFERENT preprocessor variables — measured in a real render,
// not assumed: `domainstory` tests the bare `PUML_MODE`, `awslib` tests `$PUML_MODE`, and setting one
// leaves the other library at its default. Injected before stdlib expansion so the `!global` lands
// ahead of every inlined library's own `?=` default, which then does NOT overwrite it.
export function injectPumlMode(source: string, dark: boolean): string {
  const mode = dark ? 'dark' : 'light'
  const globals = [
    `!global PUML_MODE = "${mode}"`,
    `!global $PUML_MODE = "${mode}"`,
  ]
  return insertAfterStart(source.split(/\r\n|\r|\n/), globals).join('\n')
}

export function injectPlantumlTheme(lines: string[]): string[] {
  // A self-themed source keeps its COLOURS (ADR-0006) but still gets the font FLOOR: without it the
  // engine's own defaults apply — arrow labels at 13, and any library micro-label — which in the
  // user's editor are drawn at ~14 anyway and then no longer fit the layout. Size only, no colour.
  if (plantumlHasOwnTheme(lines))
    return insertAfterStart(lines, [
      '<style>',
      `root { FontSize ${PUML_LAYOUT_FONT_SIZE} }`,
      '</style>',
    ])
  const style = plantumlStyleBlock().split('\n')
  return insertAfterStart(lines, style)
}

// PlantUML requires a `<style>` INSIDE the @start*/@end* wrapper; a bare source (no @start line) is
// wrapped implicitly by the engine, so prepending is right there.
function insertAfterStart(lines: string[], block: string[]): string[] {
  const i = lines.findIndex((l) => /^\s*@start/i.test(l))
  return i >= 0
    ? [...lines.slice(0, i + 1), ...block, ...lines.slice(i + 1)]
    : [...block, ...lines]
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
// net). Class markers: class/interface/enum/abstract/annotation/object keywords; class relations
// (`<|--`/`--|>`/`*--`/`o--`/…); or a connector between two names that is NOT a plain sequence message.
// Sequence message arrows are dashes + an arrowhead (`->`, `-->`, `->>`, `<-`, …) — they carry `>`/`<`
// and NEVER a `.`. So a connector that (a) contains a `.` (dotted: `.->`, `..>`) or (b) has NO
// arrowhead (a bare association: `A - B`, `A -- B`, `A .. B`) is class-diagram syntax. Pure + unit-
// tested; it only needs to FLIP when class<->non-class flips so the engine is reset across that switch.
//
// `object` (task 429 — demonstrated, not hypothesised): PlantUML's object-diagram syntax shares the
// class-diagram grammar/factory internally, so routing it to the `nonClass` engine instance does not
// just misfile it — it leaves that instance PRIMED the way a class diagram would, and the effect
// survives past `renderedIsClass`'s own check (an `object` diagram draws no circled type icon itself,
// so the safety net sees no disagreement and never discards). The poisoning only surfaces on the
// NEXT diagram rendered on that instance: measured, a plain sequence diagram right after an `object`
// block on the shared nonClass engine drew a spurious circled "C" per participant AND collapsed each
// name from two `<text>` nodes to one — a real rendering defect, not just a wasted re-import (see
// tasks/429-plantuml-engine-load-count-coverage.md). Routing `object` to the `class` engine instead
// removes the poisoning at the source, the same way `class`/`interface`/`enum`/`abstract` already do.
//
// Task 429 follow-up — the KEYWORD check above turned out to have its own false-positive shapes, and
// they poison in the SAME direction confirmed above (not just a wasted re-import): a non-class source
// misrouted to the `class` engine renders WRONG when that instance is primed from a real class diagram
// (measured: a sequence block right after a real `class` block, itself misrouted to `class` via one of
// the two shapes below, drew the same spurious circled icons as the `object` case). Two shapes, both
// confirmed:
//   1. A free-text block BODY (note/legend/title/caption/header/footer) can contain any prose, and
//      prose starting with one of our keywords — `note right\nobject model overview\nend note` — reads
//      exactly like a declaration to a bare per-line regex. Fixed by stripping those bodies first
//      (`stripPlantumlFreeText`) — no per-keyword special-casing, so a note starting with "class" or
//      "enum" is covered by the same pass, not just "object".
//   2. A bare keyword used as an unquoted PARTICIPANT NAME in a message line — `object -> Bob: test` —
//      is a valid (if odd) sequence diagram, not a declaration. Fixed by requiring the keyword be
//      followed by an identifier/quote (a declaration target), not an arrow/connector character.
const FREE_TEXT_BLOCK =
  /^[ \t]*(?:note|legend|title|header|footer)\b.*$[\s\S]*?^[ \t]*end\s+(?:note|legend|title|header|footer)\b.*$/gim
const FREE_TEXT_LINE =
  /^[ \t]*(?:note|legend|title|caption|header|footer)\b.*$/gim

// Strip PlantUML free-text regions — multi-line `note`/`legend`/`title`/`header`/`footer` … `end …`
// blocks, plus their single-line forms (`title Foo`, `note left: Foo`, `caption Foo`) — before the
// keyword/relation scan below runs. Exported for the unit test; pure text, no PlantUML parsing.
export function stripPlantumlFreeText(src: string): string {
  return src.replace(FREE_TEXT_BLOCK, '').replace(FREE_TEXT_LINE, '')
}

export function isClassSource(src: string): boolean {
  const scannable = stripPlantumlFreeText(src)
  if (
    // Require the keyword to be followed by a DECLARATION target (an identifier or a quoted name),
    // not an arrow/connector — `object Session1` is a declaration, `object -> Bob: test` is a message
    // whose participant happens to be spelled "object" and must stay non-class.
    /^\s*(?:abstract\s+)?(?:class|interface|enum|annotation|object)\s+["A-Za-z_]/im.test(
      scannable,
    )
  )
    return true
  if (/<\|--|--\|>|\*--|--\*|o--|--o|<\.\.|\.\.>/.test(scannable)) return true
  for (const line of scannable.split(/\r\n|\r|\n/)) {
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

// How many missing keys to name before summarising — a source that pulls a whole category can miss
// dozens, and the note is one line under the diagram.
const MAX_NAMED_MISSING = 3

/**
 * The single info-note for everything that made this render QUIETER than its source asked for, or
 * null when nothing did. One string because `appendDiagramNote` keeps exactly one note per block
 * (it removes the previous one), so these cases have to be joined rather than appended in turn.
 *
 * Task 384: `expandStdlibIncludes` already reports every stdlib key it could not resolve, and that
 * list was computed and thrown away — so `domainstory`, whose icons all come from a `material2.1.19`
 * library we do not vendor (behind a PlantUML VARIABLE our textual expander cannot evaluate),
 * rendered its structure with EVERY icon silently gone and looked complete. A remote `!include` is
 * the same class of silence: the line survives expansion and simply does nothing offline.
 *
 * Pure; exported for the unit tests.
 */
export function plantumlRenderNote(
  diagramCount: number,
  missing: string[],
  remote: boolean,
): string | null {
  const parts: string[] = []
  if (diagramCount > 1) {
    parts.push(
      `Only the first of ${diagramCount} PlantUML diagrams is shown — put each @startuml…@enduml in its own code block.`,
    )
  }
  const unique = [...new Set(missing)]
  if (unique.length) {
    const named = unique
      .slice(0, MAX_NAMED_MISSING)
      .map((k) => `<${k}>`)
      .join(', ')
    const rest = unique.length - MAX_NAMED_MISSING
    parts.push(
      unique.length === 1
        ? `A stdlib file this diagram includes is not available offline: ${named} — anything it defines (icons, macros) is missing from the render.`
        : `${unique.length} stdlib files this diagram includes are not available offline: ${named}${rest > 0 ? ` and ${rest} more` : ''} — anything they define (icons, macros) is missing from the render.`,
    )
  }
  if (remote) {
    parts.push(
      'This diagram pulls a remote !include (http/https), which cannot be fetched offline — whatever it defines is missing from the render.',
    )
  }
  return parts.length ? parts.join(' ') : null
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
  timing: PumlTiming | null,
): Promise<void> {
  // Phase 1 boundary (task 430): started at enqueue time in plantumlRender, ended here — the gap is
  // this block's wait behind the serialised renderQueue (task 347), not any work of its own.
  timing?.end('queueWait')
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
    // Phase 2 (task 430): only non-zero on a cold `import()` or a safety-net discard (below) forcing
    // one — a warm `loadPlantumlEngine` returns the cached instance synchronously, so this reads ~0.
    timing?.start('engineImport')
    const renderFn = await loadPlantumlEngine(engineKind, pumlUrl)
    timing?.end('engineImport')
    // Resolve stdlib `!include <C4/…>` / `<awslib/…>` / `<azure/…>` OFFLINE (task 136): our engine ships
    // no stdlib + no include hook, so lazy-load the referenced lib file-map(s) and inline the .puml text
    // before render(). loadScript now dedups concurrent loads (task 347) so the map is fully populated.
    // isClassSource above intentionally ran on the ORIGINAL source (expanded C4 macros confuse the probe).
    let pumlText = text
    // Every stdlib key the expander could NOT resolve — surfaced in the note below (task 384),
    // because a diagram that lost its icons otherwise renders looking complete.
    let stdlibMissing: string[] = []
    const usesStdlib = needsStdlib(text)
    // A library that themes itself for the current page must then be left alone by our light-page
    // compensation (task 384). Only true on a DARK theme: on a light one every library is already
    // drawing for the page it was authored on, and the passes are a no-op there anyway.
    let nativeDark = false
    if (usesStdlib || hasRemoteInclude(text)) {
      // Phase 3 (task 430): lib-map load (plantuml-stdlib.ts's lazy fetch, once per lib) + the
      // textual expansion below. 0 on a plain non-stdlib diagram (this whole block is skipped).
      timing?.start('stdlibExpand')
      const map = await loadStdlib(cdn, referencedStdlibLibs(text))
      // A library can only pick its dark palette if it is told BEFORE its own `?=` default runs, i.e.
      // before expansion inlines it (task 384). Skipped when there is no palette (outside a webview).
      let source = text
      if (usesStdlib) {
        try {
          const dark = resolveDiagramPalette().dark
          // Both pre-engine injections ride together: they must land BEFORE expansion so the
          // libraries' own `?=` defaults never apply (mode: task 384; font floor: task 355 step 6).
          source = injectStdlibFontFloor(injectPumlMode(text, dark))
          nativeDark = dark && usesModeAwareStdlib(text)
        } catch {}
      }
      const expanded = expandStdlibIncludes(source, map)
      pumlText = raiseStdlibFontFloor(expanded.source)
      stdlibMissing = expanded.missing
      timing?.end('stdlibExpand')
    }
    // Inject the palette `<style>` (unless the author themed it); themePumlSvg runs after as the net.
    // A self-themed source gets NO palette — and after stdlib expansion that is every C4/AWS/Azure
    // diagram, since our own inlined libraries carry hundreds of skinparam lines. Remember it here so
    // the post-pass knows to adapt the baked light-page colours to a dark theme (task 382).
    const pumlLines = pumlText.split(/\r\n|\r|\n/)
    const ownTheme = plantumlHasOwnTheme(pumlLines)
    // Phase 4 start (task 430): the render() call itself, ended in `check()`/the fallback below once
    // the <svg> has actually landed (TeaVM's render() has no completion promise — see the comment on
    // the MutationObserver below).
    timing?.start('engineRender')
    renderFn(injectPlantumlTheme(pumlLines), targetId)
    // If the fence holds several @startuml diagrams the engine renders only the first (task 140) — flag
    // the dropped ones with a note. From the ORIGINAL source, before stdlib/theme.
    const diagramCount = countPlantumlDiagrams(text)
    const note = plantumlRenderNote(
      diagramCount,
      stdlibMissing,
      hasRemoteInclude(text),
    )
    let themed = false
    const themeOnce = () => {
      if (themed) return
      themed = true
      // Phase 5 (task 430): whatever post-render work actually runs today — `removeDiagramLoading` +
      // `scalePumlSvg` + the note; `themePumlSvg` only when PUML_POST_RENDER_THEMING is back on. Timed
      // as the real cost of THIS session's settings, not a fixed list of passes.
      timing?.start('postProcess')
      removeDiagramLoading(e) // drop the "Rendering…" placeholder if the engine appended (vs replaced)
      if (PUML_POST_RENDER_THEMING) themePumlSvg(e, ownTheme, nativeDark)
      scalePumlSvg(e, ownTheme) // paired with the layout font injected above; NOT part of the theming
      if (note) appendDiagramNote(e, note)
      timing?.end('postProcess')
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
        timing?.end('engineRender')
        themeOnce()
        // Safety net for an isClassSource MISREAD: if the engine actually rendered the OTHER category
        // (detected from the C/I/E/A class icon), THIS instance is now primed for the wrong category and
        // its next same-category render would be poisoned → discard it so that category re-imports fresh
        // next time. Normally the probe is right, so this never fires and no re-import happens.
        const discarded = renderedIsClass(e) !== wantClass
        if (discarded) engines[engineKind] = null
        // Joins task 429 and 430: a misread shows up HERE (this record's engineDiscarded=true) and its
        // consequence — the re-import cost — shows up as `engineImport` on this category's NEXT render.
        if (timing)
          recordPumlTiming(timing, {
            targetId,
            engineKind,
            settledBy: 'observer',
            engineDiscarded: discarded,
          })
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
        // Never settled via the observer, so `engineRender` reads ~5000 ms here — that is the fallback
        // timeout, not a real engine cost; `settledBy: 'fallback'` on the record is what tells the two
        // apart (task 430 verification: instrumentation must not misreport a wedge as a slow render).
        timing?.end('engineRender')
        themeOnce()
        if (timing)
          recordPumlTiming(timing, {
            targetId,
            engineKind,
            settledBy: 'fallback',
            engineDiscarded: false,
          })
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

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequences viz/plantuml script loads then dispatches per-element render across the type-switch engines; pre-existing (task 469 baseline)
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
      // Task 430: one timing instance per block, only when the e2e-armed flag is on (see
      // pumlTimingEnabled's comment — a normal open never allocates this). `queueWait` starts HERE, at
      // enqueue, not inside renderPlantumlBlock — the phase it measures is the wait BEFORE that call
      // runs, i.e. time spent behind other blocks on the serialised renderQueue (task 347).
      const timing = pumlTimingEnabled() ? new PumlTiming() : null
      timing?.start('queueWait')
      // Chain onto the shared queue (serialises across concurrent invocations), then await this block's
      // turn. The assignment + await run in one synchronous stretch, so no other invocation can slip
      // between them — `renderQueue` here is this block's promise.
      renderQueue = renderQueue
        .then(() =>
          renderPlantumlBlock(e, text, targetId, cdn, pumlUrl, timing),
        )
        .catch(() => {})
      await renderQueue
    }
  })
}
