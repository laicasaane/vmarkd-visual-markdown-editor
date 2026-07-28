// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  countPlantumlDiagrams,
  plantumlRenderNote,
  bleedOuterFringe,
  erodeInkClearOfFringe,
  erodeInward,
  filledShapeMask,
  injectPlantumlTheme,
  injectPumlMode,
  isClassSource,
  plantumlHasOwnTheme,
  referencedStdlibLibs,
  themePumlSvg,
  usesModeAwareStdlib,
} from './plantuml-render'
import { setD2Config } from './d2-config'
import { MERMAID_PALETTES } from '../../src/mermaid-palettes'

// A minimal stand-in for a rendered PlantUML SVG carrying the default-skin colours
// themePumlSvg must neutralise (task 144 item 2 — the render test for the colour mapping).
function fixture(): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg">
      <rect id="bg" fill="#00000000" stroke="#00000000" width="100" height="100"></rect>
      <rect id="box" fill="#E2E2F0" stroke="#181818"></rect>
      <line id="edge" stroke="#181818"></line>
      <path id="border" stroke="#000000" fill="#181818"></path>
      <text id="t-baked" fill="#000000">a</text>
      <text id="t-nofill">b</text>
    </svg>`
  return container
}
const q = (c: HTMLElement, id: string) =>
  c.querySelector(`#${id}`) as SVGElement | null

describe('themePumlSvg', () => {
  let container: HTMLElement
  beforeEach(() => {
    container = fixture()
    themePumlSvg(container)
  })

  it('repaints baked foreground (#181818 / #000000) on lines, borders + text to currentColor', () => {
    expect(q(container, 'edge')?.getAttribute('stroke')).toBe('currentColor')
    expect(q(container, 'border')?.getAttribute('stroke')).toBe('currentColor')
    expect(q(container, 'border')?.getAttribute('fill')).toBe('currentColor')
    expect(q(container, 't-baked')?.getAttribute('fill')).toBe('currentColor')
  })

  it('gives text with no fill an explicit currentColor (SVG default black is invisible on dark)', () => {
    expect(q(container, 't-nofill')?.getAttribute('fill')).toBe('currentColor')
  })

  it('flattens participant-box fills to a faint currentColor tint', () => {
    const box = q(container, 'box')
    expect(box?.getAttribute('fill')).toBe('currentColor')
    expect(box?.getAttribute('fill-opacity')).toBe('0.06')
  })

  it('removes the fully-transparent background rect', () => {
    expect(q(container, 'bg')).toBeNull()
  })

  it('is idempotent — a second pass is a no-op (no baked colour remains to match)', () => {
    const before = container.innerHTML
    themePumlSvg(container)
    expect(container.innerHTML).toBe(before)
  })

  it('no-ops when the container holds no <svg> yet (render not complete)', () => {
    const empty = document.createElement('div')
    expect(() => themePumlSvg(empty)).not.toThrow()
  })
})

// Task 382 — dark adaptation of a BAKED light-page palette, for the diagrams no palette reached
// (anything with its own skinparam/<style>, i.e. every stdlib C4/AWS/Azure diagram). Colours below
// are the real values dumped from those diagrams in the running editor, not invented ones.
describe('themePumlSvg dark adaptation of baked colours', () => {
  // A stdlib-shaped SVG: a white card with a grey-blue border (AWS/Azure), C4's white label on a
  // saturated blue box, C4's #444444 boundary and #666666 arrows, and its #999999/#8A8A8A ext box.
  function stdlibFixture(): HTMLElement {
    const c = document.createElement('div')
    c.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <g class="entity">
          <rect id="card" fill="#FFFFFF" stroke="#7D8998"></rect>
          <image id="sprite" x="10" y="10" width="40" height="40" href="data:image/png;base64,x"></image>
        </g>
        <g class="entity">
          <rect id="c4box" fill="#438DD5" stroke="#3C7FC0"></rect>
          <image id="personSprite" x="60" y="10" width="40" height="40" href="data:image/png;base64,y"></image>
          <text id="c4label" fill="#FFFFFF">Web App</text>
        </g>
        <text id="boundary" fill="#444444">Internet Banking</text>
        <rect id="boundarybox" fill="none" stroke="#444444"></rect>
        <text id="edgelabel" fill="#666666">Uses</text>
        <polygon id="arrow" fill="#666666" stroke="#666666"></polygon>
        <rect id="extbox" fill="#999999" stroke="#8A8A8A"></rect>
        <rect id="c4boundary" fill="#00000000" stroke="#444444"></rect>
        <path id="c4arc" fill="#00000000" stroke="#3C7FC0"></path>
        <!-- Task 383 follow-up: the kubernetes/Common-shaped card — a light neutral fill (WILL be
             adapted, unlike c4box's saturated #438DD5) bordered in the library's own identity blue.
             Real value dumped from a k8s/Common render: #23272d card, #3C7FC0 border, spread 132. -->
        <rect id="k8sbox" fill="#FAFAFA" stroke="#3C7FC0"></rect>
      </svg>`
    return c
  }
  // Darkness comes from the resolved PALETTE (the content theme's bg), not from the editor mode —
  // the diagram pairs with the content theme, so that is what decides whether adaptation applies.
  const run = (contentTheme: string, adapt = true) => {
    setD2Config({
      contentTheme,
      mode: contentTheme.includes('light') ? 'light' : 'dark',
    })
    const c = stdlibFixture()
    themePumlSvg(c, adapt)
    return c
  }

  it('repaints the white card to the theme surface so the themed label has a dark backing', () => {
    const fill = q(run('github-dark'), 'card')?.getAttribute('fill') ?? ''
    expect(fill).toMatch(/^#[0-9a-f]{6}$/i)
    expect(fill.toLowerCase()).not.toBe('#ffffff')
  })

  it('lifts dark neutral ink — the C4 boundary and the arrows — to currentColor', () => {
    const c = run('github-dark')
    expect(q(c, 'boundary')?.getAttribute('fill')).toBe('currentColor')
    expect(q(c, 'boundarybox')?.getAttribute('stroke')).toBe('currentColor')
    expect(q(c, 'edgelabel')?.getAttribute('fill')).toBe('currentColor')
    expect(q(c, 'arrow')?.getAttribute('fill')).toBe('currentColor')
    expect(q(c, 'arrow')?.getAttribute('stroke')).toBe('currentColor')
  })

  it('never touches the libraries’ IDENTITY colours (saturated) or their white labels', () => {
    const c = run('github-dark')
    // C4 / Azure blues carry meaning — they are the reason the diagram is recognisable. c4box's own
    // FILL is saturated (#438DD5, not a light neutral), so it never gets adapted — the mute pass
    // below is scoped to elements WE darkened, and never reaches this one.
    expect(q(c, 'c4box')?.getAttribute('fill')).toBe('#438DD5')
    expect(q(c, 'c4box')?.getAttribute('stroke')).toBe('#3C7FC0')
    // AWS/Azure's grey-blue chrome border (spread 27) reads as chrome, not a brand colour — must
    // stay above the neutral-ink cutoff (so it isn't flattened to currentColor) AND below the
    // identity-stroke cutoff (so the mute pass below doesn't catch it either).
    expect(q(c, 'card')?.getAttribute('stroke')).toBe('#7D8998')
    // White TEXT on a coloured box must stay white — only light FILLS become the surface.
    expect(q(c, 'c4label')?.getAttribute('fill')).toBe('#FFFFFF')
  })

  it('mutes a saturated IDENTITY border toward the darkened card underneath it (task 383 follow-up)', () => {
    // k8s/Common's own #3C7FC0 border (spread 132, task 383's "light frame" report) sits on a card
    // WE darkened (fill was a light neutral, unlike c4box's own saturated blue) — full brightness
    // reads as a fresh outline against the near-black surface. Muted toward the surface it stays
    // recognisably blue but stops popping; c4arc's identical #3C7FC0 on an UNADAPTED element (its
    // sibling fill is transparent, never darkened by us) is the control — same colour, untouched.
    const c = run('github-dark')
    const fill = q(c, 'k8sbox')?.getAttribute('fill') ?? ''
    const stroke = q(c, 'k8sbox')?.getAttribute('stroke') ?? ''
    expect(fill.toLowerCase()).not.toBe('#fafafa') // the fill WAS adapted (precondition)
    expect(stroke.toLowerCase()).not.toBe('#3c7fc0') // …so the border was muted, not left raw
    expect(stroke).toMatch(/^#[0-9a-f]{6}$/i)
    // Still blue-leaning (B channel > R), not flattened to grey/currentColor.
    const [r, , b] = stroke
      .slice(1)
      .match(/../g)!
      .map((h) => Number.parseInt(h, 16))
    expect(b).toBeGreaterThan(r)
    // The control: c4arc's OWN #3C7FC0 (unadapted sibling) is completely unaffected.
    expect(q(c, 'c4arc')?.getAttribute('stroke')).toBe('#3C7FC0')
  })

  it('falls back to an inset rectangle when there is no canvas to shape a backing with', () => {
    // The real path composites the icon's own filled outline into the sprite (see filledShapeMask).
    // It needs a 2d canvas; this DOM has none, so the rectangle is what a sprite gets instead — an
    // unbacked icon would lose exactly the knocked-out detail the whole pass exists to keep.
    const c = run('github-dark')
    const tile = c.querySelector('[data-vmarkd-sprite-tile]')
    expect(tile?.nextElementSibling?.id).toBe('sprite') // sits directly BEHIND the image
    // The LABEL colour, not white: a pure-white tile read as a glaring badge wherever the artwork
    // left margins. At the foreground it is no brighter than the text beside it.
    expect(tile?.getAttribute('fill')).toBe(
      MERMAID_PALETTES['github-dark'].fg.toLowerCase(),
    )
    // …and INSET from the image box, so less of it is exposed under artwork that does not fill its
    // square. The sprite is 40x40 at (10,10) → 8% of the shorter side each way.
    expect(Number(tile?.getAttribute('x'))).toBeCloseTo(13.2)
    expect(Number(tile?.getAttribute('width'))).toBeCloseTo(33.6)
  })

  it('the icon SHAPE is the artwork plus the holes it encloses, margins excluded', () => {
    // 5x5, alpha only: a ring of artwork with one transparent pixel in the middle. The centre is
    // enclosed → part of the shape; everything outside the ring is margin → not.
    const w = 5
    const h = 5
    const A = [
      0, 0, 0, 0, 0, 0, 255, 255, 255, 0, 0, 255, 0, 255, 0, 0, 255, 255, 255,
      0, 0, 0, 0, 0, 0,
    ]
    const rgba: number[] = []
    for (const a of A) rgba.push(0, 0, 0, a)
    const mask = filledShapeMask(rgba, w, h)
    expect(mask[2 * w + 2]).toBe(1) // the enclosed hole — this is what gets its white back
    expect(mask[1 * w + 1]).toBe(1) // artwork itself
    expect(mask[0]).toBe(0) // margin — must stay transparent, or we are back to a badge
    expect(mask[4 * w + 4]).toBe(0)
  })

  it('erodeInward pulls the paintable region back from the OUTER edge, never from an enclosed hole', () => {
    // 9x9: a solid 7x7 "inside" block (rows/cols 1-7) on a 1px margin — big enough that eroding the
    // outer boundary doesn't eat the artwork down to nothing. filledShapeMask marks an ENCLOSED hole
    // as "inside" too (see the test above), so from erodeInward's point of view a deep interior
    // point at (4,4) stands in for either case: what matters is only whether all 4 neighbours are
    // ALSO in-mask, which is true for both a solid core and a hole surrounded by artwork.
    const w = 9
    const h = 9
    const mask = new Uint8Array(w * h)
    for (let y = 1; y < 8; y++) for (let x = 1; x < 8; x++) mask[y * w + x] = 1
    const eroded = erodeInward(mask, w, h)
    // The true margin (row/col 0, and the 1px band touching it) is unaffected — it was never "inside".
    expect(eroded[0]).toBe(0)
    // The outermost ring of the artwork (touching the margin) is pulled back — this is the fix.
    expect(eroded[1 * w + 1]).toBe(0)
    // The artwork's own interior (surrounded on all 4 sides by other in-mask pixels) keeps its ink —
    // an enclosed hole, which filledShapeMask marks identically, is equally untouched.
    expect(eroded[4 * w + 4]).toBe(1)
  })

  // Task 383 follow-up #3 — the pale line that survived the bleed. ONE erosion ring is not enough:
  // measured on the real k8s sprites, 80 of 328 fringe pixels (24.4%) still had our near-white ink
  // underneath, compositing as `a*icon + (1-a)*#e6edf3` instead of against the card (+26.6 avg,
  // +77 peak per channel). erodeInkClearOfFringe repeats the erosion until that overlap is empty.
  describe('erodeInkClearOfFringe', () => {
    // 9x9: a solid 3x3 core (3-5) inside a TWO-pixel-wide half-alpha fringe ring (1-7), on a 1px
    // transparent margin. Two pixels is the real k8s width — one ring of erosion provably leaves
    // ink under the outer one, which is exactly the defect.
    const w = 9
    const h = 9
    function sprite(coreHole = false) {
      const rgba = new Uint8ClampedArray(w * h * 4)
      for (let y = 1; y < 8; y++)
        for (let x = 1; x < 8; x++) {
          const core = x >= 3 && x <= 5 && y >= 3 && y <= 5
          const i = (y * w + x) * 4
          rgba[i] = 102
          rgba[i + 1] = 171
          rgba[i + 2] = 221
          // an enclosed knock-out at the very centre — the hole task 382's ink pass exists to back
          rgba[i + 3] = core ? (coreHole && x === 4 && y === 4 ? 0 : 255) : 128
        }
      return rgba
    }

    it('keeps eroding until no ink is left under the fringe — one ring does not', () => {
      const rgba = sprite()
      const mask = filledShapeMask(rgba, w, h)
      // The defect, stated as a test: a single ring stops at 2-6 and (2,2) is still fringe.
      expect(erodeInward(mask, w, h)[2 * w + 2]).toBe(1)
      const cleared = erodeInkClearOfFringe(mask, rgba, w, h)
      expect(cleared[2 * w + 2]).toBe(0)
      expect(cleared[4 * w + 4]).toBe(1) // …without eating the solid core it exists to back
    })

    it('an enclosed knock-out keeps its backing however many rings that takes', () => {
      // Erosion only ever shrinks the boundary against genuine margin, and the border flood fill
      // cannot reach a hole surrounded by opaque artwork — so neither pass can reach this pixel.
      const rgba = sprite(true)
      const cleared = erodeInkClearOfFringe(
        filledShapeMask(rgba, w, h),
        rgba,
        w,
        h,
      )
      expect(cleared[4 * w + 4]).toBe(1)
    })

    it('falls back to exactly one ring on a sprite with no fringe (the kubernetes set)', () => {
      // Fully opaque → outerFringeMask is empty → nothing to clear, so this must not erode further
      // than the unconditional first ring that keeps ink off the artwork's own outline.
      const opaque = new Uint8ClampedArray(w * h * 4)
      for (let p = 0; p < w * h; p++) opaque[p * 4 + 3] = 255
      const mask = filledShapeMask(opaque, w, h)
      expect(Array.from(erodeInkClearOfFringe(mask, opaque, w, h))).toEqual(
        Array.from(erodeInward(mask, w, h)),
      )
    })
  })

  // Task 383 follow-up — the reported white rim. These sprites are anti-aliased against a WHITE
  // page, so their semi-transparent edge pixels carry white-contaminated RGB that reads as a halo
  // on a dark one. bleedOuterFringe gives that fringe the colour of the nearest opaque pixel.
  describe('bleedOuterFringe', () => {
    // 7x7: a solid 5x5 blue body on a transparent margin, with a WHITE half-alpha pixel at the
    // centre standing in for the `pod` lettering (interior artwork), and the body's own edge ring
    // set to half-alpha WHITE standing in for the white-matted anti-aliasing.
    const w = 7
    const h = 7
    const BLUE = [102, 171, 221]
    function sprite() {
      const rgba = new Uint8ClampedArray(w * h * 4)
      const put = (x: number, y: number, [r, g, b]: number[], a: number) => {
        const i = (y * w + x) * 4
        rgba[i] = r
        rgba[i + 1] = g
        rgba[i + 2] = b
        rgba[i + 3] = a
      }
      for (let y = 1; y < 6; y++)
        for (let x = 1; x < 6; x++) put(x, y, BLUE, 255)
      // white-matted fringe: the ring just outside the solid body
      for (let x = 1; x < 6; x++) {
        put(x, 0, [255, 255, 255], 128)
        put(x, 6, [255, 255, 255], 128)
      }
      // interior "lettering": white, partial alpha, fully surrounded by solid blue
      put(3, 3, [255, 255, 255], 128)
      return rgba
    }
    const at = (a: Uint8ClampedArray, x: number, y: number) =>
      Array.from(a.slice((y * w + x) * 4, (y * w + x) * 4 + 4))

    it('recolours the outer fringe to the body colour and leaves its alpha alone', () => {
      const out = bleedOuterFringe(sprite(), w, h)
      expect(at(out, 3, 0)).toEqual([...BLUE, 128]) // white → body blue, alpha untouched
    })

    it('never touches interior artwork — the white lettering keeps its colour', () => {
      // The cheap version (bleed every partial-alpha pixel) erased the real `pod` lettering; this
      // is the case that rules it out. The centre pixel is enclosed by solid body, so the
      // border flood fill can never reach it.
      const out = bleedOuterFringe(sprite(), w, h)
      expect(at(out, 3, 3)).toEqual([255, 255, 255, 128])
    })

    it('leaves fully opaque and fully transparent pixels exactly as they were', () => {
      const src = sprite()
      const out = bleedOuterFringe(src, w, h)
      expect(at(out, 3, 3 - 1)).toEqual([...BLUE, 255]) // solid body
      expect(at(out, 0, 0)).toEqual([0, 0, 0, 0]) // margin
    })

    it('bails out on a sprite with no transparency at all (the kubernetes set)', () => {
      // Opaque + inverted (task 383's still-open half) — it has no outer fringe, and running the
      // bleed on it would be recolouring artwork rather than repairing an edge. Verified against
      // the real sprite: 0 pixels changed.
      const opaque = new Uint8ClampedArray(w * h * 4)
      for (let p = 0; p < w * h; p++) {
        opaque[p * 4] = 152
        opaque[p * 4 + 1] = 157
        opaque[p * 4 + 2] = 163
        opaque[p * 4 + 3] = p % 3 === 0 ? 128 : 255 // some partial pixels, no transparent one
      }
      expect(Array.from(bleedOuterFringe(opaque, w, h))).toEqual(
        Array.from(opaque),
      )
    })
  })

  it('treats NEAR-transparent as transparent, not just a hard zero', () => {
    // kubernetes encodes its knock-outs at grey level 1 of 15 (~7% alpha). A strict ==0 test found
    // holes in 148 of its 216 sprites instead of 214 — the whole library would have been skipped.
    const w = 3
    const h = 3
    const A = [255, 255, 255, 255, 17, 255, 255, 255, 255]
    const rgba: number[] = []
    for (const a of A) rgba.push(0, 0, 0, a)
    expect(filledShapeMask(rgba, w, h)[4]).toBe(1)
  })

  it('tiles ONLY the sprites whose backdrop we darkened', () => {
    // C4's `person` is WHITE artwork on a saturated blue box we never touch. Tiling that one made
    // the figure white-on-white — a worse regression than the one the tile exists to fix.
    const c = run('github-dark')
    expect(c.querySelectorAll('[data-vmarkd-sprite-tile]').length).toBe(1)
    expect(
      q(c, 'personSprite')?.previousElementSibling?.hasAttribute(
        'data-vmarkd-sprite-tile',
      ),
    ).toBe(false)
  })

  it('adds no sprite tile on a light theme, and never a second one', () => {
    expect(
      run('github-light').querySelectorAll('[data-vmarkd-sprite-tile]').length,
    ).toBe(0)
    const c = run('github-dark')
    themePumlSvg(c, true) // idempotent — a re-theme must not stack tiles
    expect(c.querySelectorAll('[data-vmarkd-sprite-tile]').length).toBe(1)
  })

  it('never paints a TRANSPARENT shape — #00000000 is not ink', () => {
    // Regression: reading only the RGB of `#00000000` made it the darkest possible neutral, so the
    // adaptation filled C4's unfilled boundary rect solid and swallowed half the diagram.
    const c = run('github-dark')
    expect(q(c, 'c4boundary')?.getAttribute('fill')).toBe('#00000000')
    expect(q(c, 'c4arc')?.getAttribute('fill')).toBe('#00000000')
    // …while the stroke ON that same rect is real ink and still gets lifted.
    expect(q(c, 'c4boundary')?.getAttribute('stroke')).toBe('currentColor')
  })

  it('leaves mid greys alone — they read on both backgrounds', () => {
    const c = run('github-dark')
    expect(q(c, 'extbox')?.getAttribute('fill')).toBe('#999999')
    expect(q(c, 'extbox')?.getAttribute('stroke')).toBe('#8A8A8A')
  })

  it('does nothing on a light theme — the baked palette is already correct there', () => {
    const c = run('github-light')
    expect(q(c, 'card')?.getAttribute('fill')).toBe('#FFFFFF')
    expect(q(c, 'boundary')?.getAttribute('fill')).toBe('#444444')
  })

  it('does nothing when we DID inject the palette (adaptBaked false)', () => {
    const c = run('github-dark', false)
    expect(q(c, 'card')?.getAttribute('fill')).toBe('#FFFFFF')
    expect(q(c, 'boundary')?.getAttribute('fill')).toBe('#444444')
  })
})

// The flag that routes the two paths apart. It must answer TRUE for a stdlib-expanded source, which
// is the whole reason task 382 exists: our own inlined C4/awslib/azure carry skinparam lines, so the
// "the author themed it, hands off" rule fires on OUR text and the diagram never sees a palette.
describe('plantumlHasOwnTheme', () => {
  it('is false for a plain source (→ we inject the palette)', () => {
    expect(plantumlHasOwnTheme(['@startuml', 'A -> B', '@enduml'])).toBe(false)
  })

  it('is true once a stdlib body has been inlined (→ adapt the baked colours instead)', () => {
    expect(
      plantumlHasOwnTheme([
        '@startuml',
        "' inlined from <C4/C4_Container>",
        'skinparam wrapWidth 200',
        'Person(user, "Customer")',
        '@enduml',
      ]),
    ).toBe(true)
  })
})

// Task 384 — two of the ten vendored libraries theme themselves once told the mode, and our
// light-page compensation must then step aside (it turns awslib's own black card into a near-white
// one). The other eight ignore the mode and still need every pass.
describe('mode-aware stdlib libraries', () => {
  it('recognises the two libraries that carry their own dark palette', () => {
    expect(
      usesModeAwareStdlib('@startuml\n!include <awslib/AWSCommon>\n@enduml'),
    ).toBe(true)
    expect(
      usesModeAwareStdlib(
        '@startuml\n!include <DomainStory/domainStory>\n@enduml',
      ),
    ).toBe(true)
  })

  it('leaves the mode-blind libraries on the compensation path', () => {
    expect(
      usesModeAwareStdlib('@startuml\n!include <k8s/Common>\n@enduml'),
    ).toBe(false)
    expect(
      usesModeAwareStdlib('@startuml\n!include <C4/C4_Container>\n@enduml'),
    ).toBe(false)
    expect(usesModeAwareStdlib('@startuml\nAlice -> Bob\n@enduml')).toBe(false)
  })

  it('themePumlSvg keeps a native-dark render intact, dropping only the transparent backdrop', () => {
    const c = document.createElement('div')
    c.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <rect id="bg" fill="#00000000" stroke="#00000000"></rect>
        <rect id="card" fill="#000000" stroke="#7D8998"></rect>
        <text id="label" fill="#FFFFFF">EC2</text>
      </svg>`
    themePumlSvg(c, true, true)
    // The card is the library's own dark background — lifting it to currentColor is what produced
    // the white-card-under-white-text regression.
    expect(q(c, 'card')?.getAttribute('fill')).toBe('#000000')
    expect(q(c, 'label')?.getAttribute('fill')).toBe('#FFFFFF')
    expect(q(c, 'bg')).toBeNull()
  })
})

// Task 384 — a stdlib library can only pick its own dark palette if it is told the mode BEFORE its
// `?=` default runs, and the ink it picks is baked into sprite pixels no post-pass can reach. Both
// spellings are written because they are two different preprocessor variables (proven in a real
// render: domainstory reads the bare name, awslib reads `$PUML_MODE`).
describe('injectPumlMode', () => {
  it('writes BOTH variable spellings right after the @start directive', () => {
    const out = injectPumlMode(
      ['@startuml', '!include <DomainStory/domainStory>', '@enduml'].join('\n'),
      true,
    ).split('\n')
    expect(out[0]).toBe('@startuml')
    expect(out[1]).toBe('!global PUML_MODE = "dark"')
    expect(out[2]).toBe('!global $PUML_MODE = "dark"')
    // ahead of the include, or the library's own default would already have won.
    expect(out[3]).toBe('!include <DomainStory/domainStory>')
  })

  it('writes the light mode on a light theme', () => {
    const out = injectPumlMode('@startuml\nA -> B\n@enduml', false)
    expect(out).toContain('!global PUML_MODE = "light"')
    expect(out).toContain('!global $PUML_MODE = "light"')
    expect(out).not.toContain('"dark"')
  })

  it('prepends when the source has no @start directive (bare source)', () => {
    const out = injectPumlMode('!include <awslib/AWSCommon>', true).split('\n')
    expect(out[0]).toBe('!global PUML_MODE = "dark"')
    expect(out[2]).toBe('!include <awslib/AWSCommon>')
  })
})

// Full palette-pairing: injectPlantumlTheme prepends a <style> block (built from the active diagram
// palette) so PlantUML colours the diagram from the content theme. With no d2-config set it resolves
// the github fallback palette (a valid hex set), which is all these structural assertions need.
describe('injectPlantumlTheme', () => {
  it('inserts a <style> block right after the @startuml directive', () => {
    const out = injectPlantumlTheme([
      '@startuml',
      'Alice -> Bob: Hi',
      '@enduml',
    ])
    expect(out[0]).toBe('@startuml')
    expect(out[1]).toBe('<style>')
    expect(out).toContain('</style>')
    // the diagram body still follows the injected style.
    expect(out).toContain('Alice -> Bob: Hi')
    expect(out[out.length - 1]).toBe('@enduml')
  })

  it('builds the style from palette colours (themed, not raw defaults)', () => {
    const out = injectPlantumlTheme(['@startuml', 'A -> B', '@enduml']).join(
      '\n',
    )
    // element/arrow/text/note declarations carry concrete hex colours.
    expect(out).toMatch(/element \{ LineColor #[0-9a-f]{6}/i)
    expect(out).toMatch(/note \{ BackgroundColor #[0-9a-f]{6}/i)
    expect(out).toContain('document { BackgroundColor transparent }')
  })

  it('prepends the style when the source has no @start directive (bare source)', () => {
    const out = injectPlantumlTheme(['Alice -> Bob: Hi'])
    expect(out[0]).toBe('<style>')
    expect(out).toContain('Alice -> Bob: Hi')
  })

  it('leaves the source untouched when the author supplies skinparam', () => {
    const src = [
      '@startuml',
      'skinparam backgroundColor #222',
      'A -> B',
      '@enduml',
    ]
    expect(injectPlantumlTheme(src)).toEqual(src)
  })

  it('leaves the source untouched when the author supplies their own <style>', () => {
    const src = [
      '@startuml',
      '<style>',
      'root { FontColor red }',
      '</style>',
      'A -> B',
      '@enduml',
    ]
    expect(injectPlantumlTheme(src)).toEqual(src)
  })

  it('leaves the source untouched when the author uses !theme', () => {
    const src = ['@startuml', '!theme cerulean', 'A -> B', '@enduml']
    expect(injectPlantumlTheme(src)).toEqual(src)
  })
})

describe('isClassSource (engine-reset type probe — task 178 follow-up)', () => {
  // The bug: a class render poisons the shared TeaVM engine so a later sequence source stays a class
  // diagram. isClassSource must flip class<->non-class so the engine is re-imported across the switch.
  it('sequence diagrams (arrow messages) are NOT class', () => {
    expect(isClassSource('@startuml\nAlice -> Bob: Hello\n@enduml')).toBe(false)
    expect(isClassSource('@startuml\nBob --> Alice: Hi there\n@enduml')).toBe(
      false,
    )
    expect(isClassSource('@startuml\nAlice ->> Bob: x\n@enduml')).toBe(false)
    // a participant-only sequence
    expect(
      isClassSource('@startuml\nparticipant Alice\nactor Bob\n@enduml'),
    ).toBe(false)
  })

  it('a bare association (no arrowhead) IS class — the exact bug trigger "Alice - Bob"', () => {
    expect(isClassSource('@startuml\nAlice - Bob: Hello\n@enduml')).toBe(true)
    expect(isClassSource('@startuml\nAlice -- Bob\n@enduml')).toBe(true)
    expect(isClassSource('@startuml\nAlice .. Bob\n@enduml')).toBe(true)
  })

  it('a DOTTED arrow (.->, .>, ..>) IS class — the "Alice .-> Bob" trigger that still has an arrowhead', () => {
    // these carry a ">" arrowhead (so the no-arrowhead rule misses them) but the "." makes them class
    expect(isClassSource('@startuml\nAlice .-> Bob: Hello\n@enduml')).toBe(true)
    expect(isClassSource('@startuml\nAlice .> Bob\n@enduml')).toBe(true)
    expect(isClassSource('@startuml\nFoo ..> Bar\n@enduml')).toBe(true)
  })

  it('explicit class-diagram syntax IS class', () => {
    expect(
      isClassSource('@startuml\nclass Foo\nclass Bar\nFoo --> Bar\n@enduml'),
    ).toBe(true)
    expect(isClassSource('@startuml\ninterface I\n@enduml')).toBe(true)
    expect(isClassSource('@startuml\nabstract class A\n@enduml')).toBe(true)
  })

  it('class relations (inheritance/composition/aggregation/dependency) ARE class', () => {
    expect(isClassSource('@startuml\nFoo <|-- Bar\n@enduml')).toBe(true)
    expect(isClassSource('@startuml\nFoo *-- Bar\n@enduml')).toBe(true)
    expect(isClassSource('@startuml\nFoo o-- Bar\n@enduml')).toBe(true)
    expect(isClassSource('@startuml\nFoo ..> Bar\n@enduml')).toBe(true)
  })

  it('non-class non-sequence diagrams are treated as non-class (engine stays consistent)', () => {
    expect(isClassSource('@startmindmap\n* root\n** child\n@endmindmap')).toBe(
      false,
    )
    expect(isClassSource('@startuml\nstart\n:do work;\nstop\n@enduml')).toBe(
      false,
    )
  })

  it('flips when an arrow is mangled into an association (the recovery path)', () => {
    const seq = '@startuml\nAlice -> Bob: Hello\n@enduml'
    const cls = '@startuml\nAlice - Bob: Hello\n@enduml'
    expect(isClassSource(seq)).toBe(false)
    expect(isClassSource(cls)).toBe(true)
    expect(isClassSource(seq)).not.toBe(isClassSource(cls))
  })
})

describe('referencedStdlibLibs (task 354 — which vendored maps a diagram loads)', () => {
  it('picks the lowercased include prefix, ignoring non-vendored libs', () => {
    expect(
      referencedStdlibLibs('@startuml\n!include <eip/EIP-PlantUML>\n@enduml'),
    ).toEqual(['eip'])
    // DomainStory's mixed-case prefix lowercases to the vendored key — and drags its material
    // dependency along, because its icons live there and its own source never names it (task 384).
    expect(referencedStdlibLibs('!include <DomainStory/domainStory>')).toEqual([
      'domainstory',
      'material2.1.19',
    ])
    // a lib we don't vendor is not returned — note `material` alone is NOT the vendored key, which
    // is the versioned `material2.1.19` prefix domainstory actually writes.
    expect(referencedStdlibLibs('!include <material/foo>')).toEqual([])
  })

  it('closes over STDLIB_DEPS — a <k8s/…> diagram also pulls c4 (k8s/Common builds on <C4/C4>)', () => {
    const libs = referencedStdlibLibs(
      '@startuml\n!include <k8s/Common>\n!include <k8s/OSS/KubernetesPod>\n@enduml',
    )
    expect(libs).toContain('k8s')
    expect(libs).toContain('c4') // the transitive dependency, never named in the user source
  })
})

describe('plantumlRenderNote (task 384 — say when the render lost something)', () => {
  it('is silent when nothing was lost', () => {
    expect(plantumlRenderNote(1, [], false)).toBeNull()
    expect(plantumlRenderNote(0, [], false)).toBeNull()
  })

  it('still reports the extra diagrams a single fence dropped (task 140)', () => {
    expect(plantumlRenderNote(3, [], false)).toContain('first of 3')
  })

  it('names an unresolvable stdlib include — the domainstory case', () => {
    const note = plantumlRenderNote(1, ['material2.1.19/$icon'], false)
    expect(note).toContain('<material2.1.19/$icon>')
    expect(note).toContain('not available offline')
    expect(note).toContain('icons') // says WHAT is missing, not just that something is
  })

  it('counts them once each and summarises past three', () => {
    const many = ['a/1', 'a/2', 'a/3', 'a/4', 'a/5', 'a/1']
    const note = plantumlRenderNote(1, many, false) ?? ''
    expect(note).toContain('5 stdlib files') // deduped: 6 entries, 5 keys
    expect(note).toContain('and 2 more')
    expect(note).not.toContain('<a/4>')
  })

  it('flags a remote include, which cannot be fetched offline', () => {
    expect(plantumlRenderNote(1, [], true)).toContain('remote !include')
  })

  it('joins every cause into ONE message — appendDiagramNote keeps only the last note', () => {
    const note = plantumlRenderNote(2, ['x/y'], true) ?? ''
    expect(note).toContain('first of 2')
    expect(note).toContain('<x/y>')
    expect(note).toContain('remote !include')
  })
})

describe('countPlantumlDiagrams', () => {
  it('counts one diagram for a single @startuml (and for bare/implicit source)', () => {
    expect(countPlantumlDiagrams('@startuml\nAlice -> Bob\n@enduml')).toBe(1)
    expect(countPlantumlDiagrams('Alice -> Bob')).toBe(0) // no explicit opener (engine wraps implicitly)
  })

  it('counts each @start… opener when several diagrams share one fence', () => {
    const two =
      '@startuml\nAlice -> Bob\n@enduml\n@startuml\nCarol -> Dave\n@enduml'
    expect(countPlantumlDiagrams(two)).toBe(2)
    const three = `${two}\n@startuml\nEve -> Frank\n@enduml`
    expect(countPlantumlDiagrams(three)).toBe(3)
  })

  it('counts mixed diagram types (each opener), not just @startuml', () => {
    const mixed = '@startmindmap\n* a\n@endmindmap\n@startuml\nA -> B\n@enduml'
    expect(countPlantumlDiagrams(mixed)).toBe(2)
  })

  it('treats `newpage` as ONE diagram — it paginates within a single @startuml (engine renders all)', () => {
    const np = '@startuml\nAlice -> Bob\nnewpage\nCarol -> Dave\n@enduml'
    expect(countPlantumlDiagrams(np)).toBe(1)
  })

  it('does not match @start… that is not at a line start (e.g. inside a note/label)', () => {
    const inNote =
      '@startuml\nnote right\n  see @startuml docs\nend note\n@enduml'
    expect(countPlantumlDiagrams(inNote)).toBe(1)
  })
})
