# 382 — PlantUML stdlib diagrams (C4 / AWS / Azure) are unreadable on dark themes

**Status: ✅ DONE** — dark adaptation, the direction the user chose from a rendered comparison.

## Report

> "oceń czy biblioteki renderują swoje glify poprawnie, czy coś trzeba zmienić w stosunku do jakości
> rysowania oraz współgrania z tematem?" — on `tmp/plantuml-stdlib-demo.md`.

## What the assessment found

**Glyph rendering is correct and was never the problem.** All five blocks render, no errors; the
AWS / Azure / C4 sprites come through in their brand colours, sharp, as `<image>` elements. The
`<awslib/Compute/all>` synthesis works. Clipping was checked and ruled out (svg 316x792 inside a
545x798 block, `overflow: visible`) — an early screenshot suggested a cut, but that was an artifact
of capturing an element taller than the test viewport, not a render defect.

**Theme integration was broken on dark themes.** Measured on the rendered SVG in a real editor:

| theme | label colour | card fill | contrast |
|---|---|---|---|
| vscode-dark-2026 | `#bbbebf` | `#FFFFFF` | **1.87:1** |
| material-dark | `#abb2bf` | `#FFFFFF` | **2.13:1** |
| github-dark | `#e6edf3` | `#FFFFFF` | **1.18:1** |

WCAG asks 4.5:1. C4's boundary label + dashed rect sat at **1.91:1** (`#444444` on `#121314`).
Light themes were correct throughout.

## Root cause — one line, two symptoms

`plantuml-render.ts` guards palette injection with

```ts
HAS_OWN_THEME = /<style>|^\s*(?:skinparam|!theme)\b/im
```

The rule ("the author themed it → leave their colours alone") is right, but it is tested on the
source AFTER stdlib expansion — and our own vendored libraries are full of those directives:
`c4.js` carries 259 `skinparam` + 27 `<style>`, `awslib.js` 95 + 3, `azure.js` 11.

So the hands-off rule fires on OUR OWN inlined text, and every `!include <…>` diagram silently drops
out of palette-pairing. All that then runs is `themePumlSvg`, which lifts `#181818`/`#000000` to
`currentColor` — it BRIGHTENS the ink — while leaving the library's white fills untouched. Light ink,
white card. The last block of the demo (no `!include`) proves it from the other side: same engine,
same theme, palette injected, renders correctly.

## Fix

`adaptBakedColours` — a dark-only SVG pass that runs exactly when no palette was injected
(`plantumlHasOwnTheme` is now exported so the render path can ask once and reuse the answer). It is
**chroma-based, not a colour list**, so it generalises to stdlib libraries we have not looked at:

- light NEUTRAL shape fills → the theme surface. `<text>` excluded, so C4's white labels on coloured
  boxes stay white.
- dark NEUTRAL ink (`#444444`, `#666666`) → `currentColor`, so it follows the theme.
- SATURATED colours are never touched — C4 blue `#438DD5`/`#3C7FC0`, Azure blue, the AWS sprite
  palette. That is the libraries' identity and the reason a C4 diagram is recognisable as one.
- mid greys (`#8A8A8A`, `#999999`) stay: they read on either background.

Thresholds come from the values these libraries actually emit, dumped from the running editor:
`NEUTRAL_SPREAD 24` (keeps `#7D8998`, spread 27, as identity), `LIGHT_FILL_LUM 0.75`,
`DARK_INK_LUM 0.20` (lifts `#444444`/`#666666`, keeps `#8A8A8A` at 0.26).

Result: **8.32:1** (vscode-dark), **12.70:1** (github-dark), **5.43:1** (material-dark). Light-theme
captures are byte-identical before/after (`cmp`).

### Two defects the RENDER caught that the code review would not have

**1. Transparent is not ink.** `parseRgb` read only the RGB of `#00000000`, making PlantUML's
invisible shapes look like the darkest possible neutral — so C4's unfilled boundary rect was painted
SOLID over half the diagram. Any 8-digit hex that is not `…ff` is now left alone. Guarded by a unit
test and by the e2e (the fixture gained a `System_Boundary` so a transparent rect actually exists).

**2. Sprites knock out their highlights.** Azure's artwork draws the SQL lettering, the cylinder rim
and two faces of the VM cube as TRANSPARENT holes that assume a white page behind. The sprite is a
data URI we never touch — but darkening the card behind it turned white lettering dark grey. Found
by an independent visual review of the render (Codex), which called it correctly as a regression
while mis-attributing the cause to recolouring; the DOM dump settled it (the sprite is a single
`<image>`, the only rect is the card).

Fix: `backSpritesWithWhite` inserts a white tile exactly the image's box, with the card's corner
radius, directly behind each sprite. Opaque artwork (the whole AWS set) hides it completely; knock-out
artwork gets its backing back. Verified both ways in the real editor.

**3. The tile then broke C4.** The second review round caught it: C4's `person` sprite is WHITE
artwork on a saturated blue box we never darken, so tiling it made the figure white-on-white — worse
than the bug being fixed. The tile now goes only where WE changed the backdrop: adapted fills are
marked `data-vmarkd-adapted`, and a sprite is tiled only if its own group carries that marker.

Both of these are the same lesson twice: this change is only checkable by looking at the render.
Every rule in it passed review as code.

## Verification

- **Unit** (`plantuml-render.test.ts`, +9): card→surface, dark ink lifted, identity colours and white
  labels untouched, mid greys untouched, transparent never painted, sprite tile present exactly once
  and never on light, and the whole pass a no-op when the palette WAS injected. Plus
  `plantumlHasOwnTheme` answering true for a stdlib-expanded source — the fact the bug hinged on.
- **e2e** (`plantuml-stdlib.spec.ts`, +3 real-VS-Code cases, one per theme): asserts on the rendered
  SVG that sprites survive, C4 identity colours and white labels survive, the transparent boundary is
  still transparent, every card carries the label at ≥4.5:1, every sprite has a tile — and that a
  light theme keeps the libraries' own palette with no tile at all.
- **Pixel matrix**: not re-run for this change, and it would prove nothing if it were — the suite
  captures the FIRST plantuml block of ITS fixture, a plain sequence diagram on the palette-injection
  path, which this change cannot touch. It would have stayed green through the entire bug. Extending
  it to a stdlib block is a separate decision, not taken here.
- **Visual**: reviewed by an independent agent on the rendered screenshots, twice — the first pass
  rejected the change over the Azure sprites, the second after the tile fix.
- **Lint**: clean.
- No version bump: 1.2.3 is bumped but not yet packaged, so no cached render exists under it.

## Open — one aesthetic call left with the user

Azure's artwork does not fill its image box, so its white tile is VISIBLE as a badge behind the icon
(a band under the App Server monitor especially). The reviewer flagged it as passable for the SQL
icon and awkward for the monitor, and suggested insetting the backing — which is not implementable
without knowing where the artwork wants white: the band is INTERIOR to the sprite's bounding box, so
no inset or alpha-bbox crop removes it, and tinting it would tint the restored highlights too.

The alternative, if the badge is rejected: let icon-bearing nodes keep their WHITE card and darken
the label ink on those cards instead, dark-adapting only the rest. That renders every sprite exactly
as designed with no tiles at all, at the cost of light cards on a dark page. Not built — it partly
reverses the direction the user picked, so it is theirs to call.

## Not done

- Only the DARK direction was implemented, per the user's choice. The alternative ("keep the white
  card, darken the text on it") was offered and not taken.
- The `HAS_OWN_THEME`-tested-after-expansion ordering is left AS IS on purpose: testing the ORIGINAL
  source instead would inject our palette into C4/AWS/Azure and fight their own skinparams, which is
  a much larger behavioural change than the reported problem asks for.
