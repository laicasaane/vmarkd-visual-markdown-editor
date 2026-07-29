# Task 437 — pretty icons in dark mode (renumbered from 431)

**Status: 🟡 OPEN — deliberately.** · ⚠️ **Renumbered 431 → 437 on 2026-07-29:** two different tasks
were filed as 431 on the same day. The other one (code-block colouring on open) kept the number,
because it is referenced from SOURCE comments in five files — `html-builder.ts`, `theme-registry.ts`,
`markdown-editor-provider.ts`, `vditor-options.ts` and two specs — while this one was referenced only
from task markdown. Commits before that date say "task 431" for either; `35a8a4d` (the sprite-mask
precompute note) means THIS file.

This is the single home for "PlantUML stdlib icons look wrong on a dark theme". Tasks 382/383/384 each fixed one symptom with a pixel-level pass; this one records
what those passes are, what is still ugly, and the user's steer for what comes next:

> **Direction (user, 2026-07-28): stop fighting the icons pixel by pixel — fix PlantUML instead.**
> The compensation passes below are a rear-guard action against artwork that was authored for a white
> page. Where a library can be told to draw for a dark page, that is the fix; where it cannot, the
> next move is on the engine/library side, not another pixel heuristic.

## Where the ink actually comes from

A PlantUML sprite is not SVG we can restyle. The engine rasterises it into an `<image>` **data URI**
with the colour already baked in, so no CSS, `currentColor`, attribute rewrite or theme variable can
reach it after the fact. Only two levers exist:

1. **Before the render** — tell the library which page it is drawing for, so it picks its own dark
   ink. Cheap, exact, and it produces artwork the library's author intended.
2. **After the render** — decode the data URI into a canvas, rewrite pixels, swap the `href`. This is
   what tasks 382/383 do. It works, but every rule is a heuristic about what a pixel *means*
   (background? knock-out? anti-aliased fringe? ink?), and each new library can break the guess.

## What is shipped today

| pass | what it does | where |
|---|---|---|
| `injectPumlMode` (384) | writes `!global PUML_MODE` **and** `!global $PUML_MODE` (two different preprocessor variables — measured) from the palette, before stdlib expansion | `media-src/src/plantuml-render.ts` |
| `usesModeAwareStdlib` (384) | for the libraries that act on the mode (`awslib`, `domainstory`), skips ALL our compensation — they theme themselves better than we can | same |
| `themePumlSvg` (87/144) | baked foreground → `currentColor`, box fills → faint tint, transparent backdrop dropped | same |
| `adaptBakedColours` (382) | light neutral card fills → theme surface; dark neutral ink → `currentColor`; saturated identity colours untouched; identity border muted toward the darkened card (383) | same |
| `backSprites` / `fillSpriteShape` / `compositeSprite` (382) | flood-fills a sprite's ENCLOSED transparent holes with light ink so knock-out highlights survive a darkened card | same |
| `bleedOuterFringe` / `erodeInward` (383) | the anti-aliased outer fringe carries white-contaminated RGB (authored against a white page) → bleed it to the nearest opaque colour, alpha untouched | same |

Only **2 of the 10 vendored libraries** read the mode at all. The other eight ignore it and depend
entirely on the compensation — measured across all ten, screenshots in `tmp/icons/probe-nativedark/`
(compensation off) and `tmp/icons/probe-compon/` (compensation on).

## What is still ugly

| # | symptom | why it resists the current tools |
|---|---|---|
| 1 | **`kubernetes` sprite set renders as a light sticker** ([383](383-kubernetes-sprites-inverted-on-dark.md), open) | the artwork is essentially opaque (<1% transparent) AND inverted — border at full ink, interior at level 9. `backSprites` fills holes; there are none. Needs a luminance/alpha REMAP (light margin → transparent, mid body → badge colour, translucent glyph → light ink) — a new pass, and exactly the kind of pixel heuristic the direction above pushes back on. `skinparam`/`<style>`/font-colour injection was proven to have ZERO effect on the baked pixels (4 rendered variants). |
| 2 | **`domainstory`'s step badge** | with the mode set, the library reverses its own identity cyan `#66FCF1` → `#99030E`; at that luminance the pill effectively disappears and only the red `(1)` numeral reads. Accepted 2026-07-28 as the author's choice ("leave it"), recorded here because it is the one visible cost of the mode injection. |
| 3 | **`cloudogu` icon tiles are white squares** | the artwork is opaque white-background PNG on the library's saturated blue card — nothing for the hole-filler to do, and the card is an identity colour we never touch. |
| 4 | **`edgy`'s black `supports` label** | the library draws its own pastel cards and a black edge label; the label sits on the PAGE, not on a card, so it stays dark ink on a dark page. |
| 5 | the eight mode-blind libraries need our compensation forever | k8s, eip, azure, c4, cloudinsight, cloudogu, edgy, kubernetes — verified by rendering them with the compensation off: white sheets. |

## Where the "fix PlantUML instead" direction could land

Not decided, listed so the next session does not re-derive them:

- **Upstream / vendored-source fix.** The mode-blind libraries are vendored `.puml` text we already
  rewrite at fetch time (`media-src/scripts/fetch-plantuml-stdlib.mjs` grew `only` and
  `recompress16z` for task 384). A dark palette could be added there, per library, as source — the
  same lever `injectPumlMode` uses, for libraries whose authors never provided one.
- **Sprite re-encode at fetch time.** `recompress16z` already decodes and re-encodes sprite grids. A
  dark variant could be generated ONCE, offline, with the result reviewed by eye — instead of a
  heuristic re-deciding it per render in the webview.
- **Engine.** The kubernetes set's inversion is a property of how PlantUML draws a `16z` sprite in
  the current text colour. Anything that changes that is an engine change (see
  [352](352-plantuml-render-cost-rebuild-cache.md) for why a TeaVM rebuild was declined once).

## Related

[382 — sprite backing](382-plantuml-stdlib-unreadable-on-dark.md) · [383 — kubernetes sprites inverted](383-kubernetes-sprites-inverted-on-dark.md) (open half) ·
[384 — domainstory icons](384-domainstory-icons-silently-dropped.md) (done, incl. the mode injection) ·
[354 — vendored stdlib libraries](354-plantuml-stdlib-more-libs.md)

## ⛔ 2026-07-29 — the whole pass is TURNED OFF (task 355 step 5, user's call)

`PUML_POST_RENDER_THEMING = false` in `plantuml-render.ts` disables the post-render pass at its call
sites: `themePumlSvg`, `adaptBakedColours`, the bitmap-sprite ink backing (`backSprites` /
`fillSpriteShape` and the whole canvas pipeline — `filledShapeMask`, `erodeInward`,
`outerFringeMask`, `erodeInkClearOfFringe`, `bleedOuterFringe`) and the post-cache re-apply
(`backSpritesIn`). Stdlib diagrams now render exactly as the engine drew them, light card and all.

So every fix recorded in 382/383 and the halo/fringe work is **dormant, not deleted** — the code and
its unit tests are untouched and one flag flips them back on. What DOES still apply is the pre-engine
`PUML_MODE` injection (384/437), which is independent of the pass.

Guards parked with it: `plantuml-stdlib-more.spec.ts`'s two k8s tests (border muting, outer-edge
halo) are `test.skip`ped with a pointer to the flag; `plantuml-stdlib.spec.ts` and
`plantuml-native-dark.spec.ts` were re-scoped to assert the untouched-library behaviour and note how
to restore the old contract.

## If the pass is ever switched back on — the sprite-composite cost question (recorded 2026-07-29)

Raised by a cleanup review as "precompute the sprite masks at vendoring time instead of flood-filling
in the browser". Investigated before acting; the framing does not survive contact with the code, so
this is what is actually true and what the options cost.

**There is nothing to precompute at vendoring time as things stand.** The vendored maps carry
sprites in PlantUML's OWN encoding — `sprite $KubernetesApi [70x66/16z]` (70x66, 16 grey levels,
`z` = deflate+base64) — not as PNGs. The bitmap the browser flood-fills is produced by the ENGINE at
render time (`<image href="data:image/png;base64,…">`). `fetch-plantuml-stdlib.mjs` never sees it.
Scale, counted from the shipped maps: ~1550 sprite definitions (awslib 818, azure 264, kubernetes
216, cloudinsight 80, eip 53, cloudogu 43, k8s 38, edgy 17, material 15, c4 4).

**Measure first — nobody has.** Two things already bound the cost: the task-184 cache stores the
COMPOSITED svg (that is the whole reason `backSpritesIn` exists — it only patches bytes that predate
the async composite), and today the pass does not run at all. One `performance.now()` around
`fillSpriteShape` on a k8s/awslib diagram, with the flag on, decides which of the routes below is
even the right one: first-paint cost (A/B) or repeats (C).

- **A — decode the sprite format in the vendoring script.** The format is simple and the script
  already imports `deflateRawSync`, so the inverse is at hand; ship the mask as RLE beside the map
  and let the runtime just fill it with the theme ink. Real cost: a SECOND decoder that has to agree
  with the engine pixel-for-pixel (scaling, `<color:…>` wrappers). Do not start without a parity
  harness comparing the precomputed mask against the runtime flood-fill over a few hundred sprites.
- **B — bake at build time by rendering.** Run the engine headless once per sprite, key on a hash of
  the emitted data URI, ship a lookup table. Robust (it is exactly what the browser will see) but
  pulls chromium into the build and adds a ~1550-entry table.
- **C — memoize at runtime** on a hash of the data URI, so the flood-fill runs once per DISTINCT
  sprite per session instead of once per occurrence. Tens of lines, no new pipeline, no risk of
  drifting from the engine.

**Recommendation: do nothing while the flag is off** — it would be optimising dead code. When it
comes back: measure, then C; A only if the measurement shows first paint dominates, and only with the
parity harness.
