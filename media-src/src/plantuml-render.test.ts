// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  countPlantumlDiagrams,
  injectPlantumlTheme,
  isClassSource,
  plantumlHasOwnTheme,
  referencedStdlibLibs,
  themePumlSvg,
} from './plantuml-render'
import { setD2Config } from './d2-config'

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
    // C4 / Azure blues carry meaning — they are the reason the diagram is recognisable.
    expect(q(c, 'c4box')?.getAttribute('fill')).toBe('#438DD5')
    expect(q(c, 'c4box')?.getAttribute('stroke')).toBe('#3C7FC0')
    expect(q(c, 'card')?.getAttribute('stroke')).toBe('#7D8998')
    // White TEXT on a coloured box must stay white — only light FILLS become the surface.
    expect(q(c, 'c4label')?.getAttribute('fill')).toBe('#FFFFFF')
  })

  it('gives every sprite a white tile so knocked-out artwork keeps its backing', () => {
    // Azure's sprites KNOCK OUT their highlights (the SQL lettering, the cylinder rim, two faces of
    // the VM cube are transparent) and assume a white page behind. Darkening the card turned that
    // white lettering dark grey. The sprite is a data URI we cannot repaint — so back it instead.
    const c = run('github-dark')
    const tile = c.querySelector('[data-vmarkd-sprite-tile]')
    expect(tile?.getAttribute('fill')).toBe('#FFFFFF')
    expect(tile?.nextElementSibling?.id).toBe('sprite') // sits directly BEHIND the image
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
    // DomainStory's mixed-case prefix lowercases to the vendored key
    expect(referencedStdlibLibs('!include <DomainStory/domainStory>')).toEqual([
      'domainstory',
    ])
    // a lib we don't vendor is not returned
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
