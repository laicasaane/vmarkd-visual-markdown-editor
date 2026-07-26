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

**3. The first backing broke C4.** The second review round caught it: C4's `person` sprite is WHITE
artwork on a saturated blue box we never darken, so backing it made the figure white-on-white — worse
than the bug being fixed. A sprite is now backed only where WE changed the backdrop: adapted fills
carry `data-vmarkd-adapted`, and a sprite is only touched if its own group has that marker.

All three are the same lesson: this change is only checkable by looking at the render. Every rule in
it passed review as code.

## The backing, and why it is the icon's SHAPE

The first two attempts backed the whole image BOX with a rectangle — white, then the label colour and
inset. Both are approximations, and a rectangle is not the icon's shape: it shows as a badge wherever
the artwork leaves margins (Azure's monitor sits in the top of its square, so the bottom of the tile
was a visible strip).

The user's framing is what the code does now: **take the icon's outline and fill it in.** Flood-fill
the transparent pixels inward from the border; everything the fill cannot reach is inside the artwork
— the artwork plus the holes it encloses. Paint that region in the label colour, draw the artwork over
it, and swap the sprite's own `href`. Nothing is added to the SVG at all, the knock-outs get their
backing, the margins stay transparent. Composites are cached per (colour, sprite) so a theme flip
rebuilds rather than reusing the previous theme's grey. The rectangle survives only as a fallback for
a DOM with no 2d canvas — an unbacked icon loses exactly the detail this pass exists to keep.

### The audit that set the threshold

All 687 vendored sprites were decoded OFFLINE — no rendering, no sampling — by inflating PlantUML's
own `16z` format (its base64 alphabet over a raw, truncated deflate stream; `Z_SYNC_FLUSH` is what
makes it decode) to one byte of grey level per pixel. `tmp/icon-audit/` holds the scripts.

**473 of 687 carry enclosed holes**, and the distribution decided the design:

| library | icons | with holes | avg hole area | avg margin |
|---|---|---|---|---|
| azure | 259 | 63% | 5.5% | 43% |
| kubernetes | 216 | 69% | 0.6% | 0% |
| cloudinsight | 78 | 63% | 5.5% | 58% |
| eip | 49 | 90% | **38%** | 47% |
| cloudogu | 43 | 72% | 5.9% | 53% |
| k8s | 38 | 100% | 11% | 33% |
| c4 | 4 | 25% | 0.5% | 46% |

`awslib` is absent because it is the one library shipping real full-colour PNGs — opaque artwork that
fills its box, which is why it never showed the problem or the backing.

The load-bearing finding is the transparency threshold. `kubernetes` encodes its knock-outs at grey
level **1** of 15, not 0:

| threshold | kubernetes icons with holes | avg area |
|---|---|---|
| level `= 0` | 148 of 216 | 0.57% |
| level `≤ 1` | **214 of 216** | **13.0%** |

At a strict zero the library looks clean in the numbers and gets silently skipped. Hence
`SPRITE_ALPHA_FLOOR = 40` (of 255) rather than an exact-zero test — one parameter, 216 icons.

## Verification

- **Unit** (`plantuml-render.test.ts`, +11): card→surface, dark ink lifted, identity colours and white
  labels untouched, mid greys untouched, transparent never painted, backing only where we darkened,
  the fallback rectangle, and the whole pass a no-op when the palette WAS injected. `filledShapeMask`
  is tested directly: an enclosed hole belongs to the shape, a margin does not, and near-transparent
  counts as transparent (the kubernetes case). Plus `plantumlHasOwnTheme` answering true for a
  stdlib-expanded source — the fact the whole bug hinged on.
- **e2e** (`plantuml-stdlib.spec.ts`, +3 real-VS-Code cases, one per theme): asserts on the rendered
  SVG that sprites survive, C4 identity colours and white labels survive, the transparent boundary is
  still transparent, every card carries the label at ≥4.5:1, and NO sprite is left unbacked (by either
  path — the contract is the backing, not which mechanism produced it) — while a light theme keeps the
  libraries' own palette untouched.
- **Pixel matrix**: not re-run for this change, and it would prove nothing if it were — the suite
  captures the FIRST plantuml block of ITS fixture, a plain sequence diagram on the palette-injection
  path, which this change cannot touch. It would have stayed green through the entire bug. Extending
  it to a stdlib block is a separate decision, not taken here.
- **Visual**: reviewed by an independent agent on the rendered screenshots, twice — the first pass
  rejected the change over the Azure sprites, the second caught the C4 person regression. Every
  subsequent step was rendered in the real editor and judged by the user before it was kept.
- **Lint**: clean.
- No version bump: 1.2.3 is bumped but not yet packaged, so no cached render exists under it.

## Follow-up found later (2026-07-26): the cache served UNBACKED sprites

`plantuml-cache.spec.ts` went red on a byte-comparison between the cold render and the cached
reopen, and the bytes told the story: the warm sprite still carried the raw artwork's EXIF header.

`fillSpriteShape` set `data-vmarkd-sprite-filled` SYNCHRONOUSLY and composited ASYNCHRONOUSLY (a
canvas decode). The render cache snapshots `innerHTML` from a childList observer — which never sees
the later `href` swap — so it could store a sprite that carried the done-marker and the RAW artwork.
On the next open those bytes were painted verbatim (a cache hit runs no renderer, so no theming
pass), `backSprites` saw the marker and skipped, and the icon kept its knocked-out highlights for
good. The defect this task exists to fix, silently reintroduced by a cache hit.

Two changes, because either alone leaves a hole:

- the done-marker now goes on only when the href is actually swapped, with the in-flight set kept as
  a `WeakSet` so it can never be serialised into the cache the way an attribute can;
- `backSpritesIn` (a backing-only pass, no engine) runs after a cached paint, so the warm result
  converges on the cold one whichever bytes were stored — and costs nothing when the cache did hold
  the final markup, because those sprites carry the marker.

Guarded by the existing byte-identity assertion in `plantuml-cache.spec.ts` and by a unit assertion
that a cached paint calls the backing pass.

## Not done

- Only the DARK direction was implemented, per the user's choice. The alternative ("keep the white
  card, darken the text on it") was offered and not taken.
- **4 of the 691 sprites did not decode** in the audit, so nothing is known about what is inside them.
  They still go through the same runtime path — the backing works off the RENDERED alpha, not off the
  sprite grid — so this is a gap in the measurement, not in the fix.
- The audit measured sprite GRIDS; the runtime threshold applies to the RENDERED alpha. The two agree
  on every case checked in the editor, but they are not the same measurement.
- `tasks/README.md` is not updated: it is still missing 360-381, and backfilling the index was offered
  earlier and never answered. Adding only 382 would make the gap look deliberate.
- The `HAS_OWN_THEME`-tested-after-expansion ordering is left AS IS on purpose: testing the ORIGINAL
  source instead would inject our palette into C4/AWS/Azure and fight their own skinparams, which is
  a much larger behavioural change than the reported problem asks for.
