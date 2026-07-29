# 383 — the `kubernetes` icon set renders as a light sticker on dark themes

**Status: 🟡 PARTIALLY DONE.** Three related reports that arrived under this task are all fixed —
the k8s/Common box border ("light frame"), the white rim ON the icons, and the pale line the rim
fix left behind (follow-ups 1-3, 2026-07-28). The kubernetes sprite badge itself — this task's
original subject — still has no fix; see the last note below.


> ⛔ **DORMANT since 2026-07-29:** the post-render pass these fixes live in is switched off
> (`PUML_POST_RENDER_THEMING = false`, task 355 step 5 — user's call). Code and unit tests are
> intact; one flag restores them. See [437](437-pretty-icons-in-dark-mode.md).

> **2026-07-28 — k8s/Common's border, fixed.** A second, related report: "k8s na dark ma jasną
> ramkę wokół kształtu to źle." Measured: `k8s.js`'s own `#3C7FC0` border (relative luminance
> 0.20) drawn on a card WE darkened to `#23272d` (luminance 0.02) — a ~10x jump that reads as a
> fresh outline. Fixed in `adaptBakedColours` (`media-src/src/plantuml-render.ts`): a stroke on an
> element we just adapted, whose channel spread exceeds `IDENTITY_STROKE_SPREAD` (60 — clear of
> AWS/Azure's near-neutral `#7D8998` chrome at spread 27, well inside k8s's `#3C7FC0` at spread
> 132), is muted 50% toward the new fill. Scoped to elements WE darkened only — a library's OWN
> saturated identity fill (cloudogu's blue card) is untouched, same rule the sprite backing below
> already follows. Verified: unit (`plantuml-render.test.ts`, +1, with an unadapted-sibling
> control using the SAME colour) + real-VS-Code e2e
> (`plantuml-stdlib-more.spec.ts` — "k8s/Common's identity-blue border is muted, not raw").
>
> **2026-07-28 (2) — the white rim ON the icons, fixed.** Follow-up report: "ciągle widać biały
> brzeg… trzeba było zamieniać biały od brzegu na przezroczystość albo miksować z kolorem tła."
> Correct, and my first attempt (`erodeInward`, pulling OUR ink back from the edge) was the wrong
> tool — recorded here because it cost a round: the rim is in the ARTWORK, not in anything we paint.
>
> Root cause, measured not assumed: the stdlib sprites are anti-aliased against a **WHITE page**, so
> their semi-transparent edge pixels hold white-contaminated RGB. Exact proof — the edge pixel
> `(128,185,227)` at alpha 212, un-composited from white, is **exactly `(102,171,221)`, the icon's
> own dominant blue, on all three channels**. Invisible on the page PlantUML drew for; a halo on ours.
>
> Three candidates were rendered against the real sprites before choosing:
>
> | | white-halo px (k8s pod) | verdict |
> |---|---|---|
> | original | 323 | — |
> | (A) un-matte from white | 141 | safe, but leaves a visible residue |
> | (B) bleed every partial-alpha pixel | 0 | ❌ **erased the white `pod` lettering** |
> | **(C) bleed the OUTER fringe only** | **0** | ✅ shipped |
>
> (B) is the obvious cheap version and it is wrong — found by rendering it, not by reading it.
>
> **(C) = `bleedOuterFringe`**, and it is the natural extension of the existing edge machinery: a
> second flood fill from the border that stops at FULLY OPAQUE pixels (`filledShapeMask` stops at
> the alpha floor). That reaches into the anti-aliased silhouette and halts at the solid body, so
> everything enclosed by artwork — the `pod`/`api` lettering, gear glyphs, and the knock-out holes
> task 382 exists to back — is excluded by construction. The fringe then takes the colour of the
> nearest opaque pixel; **alpha is never touched**, so the silhouette stays exactly as smooth as the
> engine drew it. `erodeInward` is KEPT (comment corrected to stop claiming it fixes the rim): the
> two compose — bleed makes the fringe the icon's own colour, erosion keeps light ink from sitting
> behind it.
>
> **Guard:** a sprite with no fully-transparent pixel has no outer fringe and is returned untouched.
> That is the entire `kubernetes` set (opaque + inverted — the still-open half below): verified
> **0 pixels changed**, in the unit test and in the real render.
>
> **Verified:** unit +4 (`plantuml-render.test.ts`, RED-checked — neutering the bleed turns exactly
> the fringe test red) · real-VS-Code e2e `plantuml-stdlib-more.spec.ts` → "k8s icons carry no white
> halo on their outer edge after compositing", which decodes the COMPOSITED sprite back into a canvas
> and measures the fringe: **145 bright px before the fix → 0 after**, with 248 fringe pixels still
> present so the assertion cannot pass vacuously. All 10 vendored libraries re-rendered and reviewed
> (`tmp/icons/all-icons-review.md`): no fatal, no missing-include note, C4's white-on-blue person and
> cloudogu's saturated card both unchanged.
>
> **2026-07-28 (3) — the pale line the bleed left behind, fixed.** Third report on the same edge:
> "ten blend krawędzi do koloru mógłby być blendem do tła, byłyby lepsze przejścia." Correct, and
> the cause was OUR ink, not the artwork this time. `erodeInward` pulls the ink backing back by
> exactly ONE ring; the fringe is two pixels wide. Measured on the real k8s sprites: of 328 fringe
> pixels, **80 (24.4%) still had ink under them** — and that ink is `palette.fg` (`#e6edf3` on
> github-dark, near-white), so they composited as `a*icon + (1-a)*near-white` instead of against the
> card. **Average lift +26.6, peak +77 per channel.**
>
> Two candidates were modelled side by side on the real sprites at 1x/8x/22x before choosing
> (`tmp/icons/edge-blend-model.png`, rig under `tmp/icons/rig/` — bundles the SHIPPING functions via
> esbuild rather than reimplementing them):
>
> | | what it does | first-opaque-ring ink px | verdict |
> |---|---|---|---|
> | current | ink eroded one ring | 8 | pale line along the edge |
> | (A) flatten fringe to the card colour, alpha 255 | we pre-composite it ourselves | 0 | ✅ but bakes the theme colour into a CACHED sprite |
> | **(B) erode until the ink clears the fringe** | alpha untouched, browser composites | 2 (both the icon's OWN light tone, verified opaque in the raw sprite) | ✅ **shipped** |
>
> Visually indistinguishable at 22x, so the tie-break was cost: (A) makes the composite depend on
> `surface`, which the `spriteBackings` key and the render cache would both have to learn about or a
> theme flip shows a halo in the previous theme's colour. **(B) = `erodeInkClearOfFringe`**: keep the
> unconditional first ring (an opaque sprite with no fringe still needs it), then repeat while the
> mask overlaps `outerFringeMask`, capped at 4. Two rings clear k8s; it measures rather than
> hard-codes, since fringe width varies by sprite (azure 70x70, awslib 64x64, cloudinsight 48x48).
> The border flood fill still cannot reach an enclosed hole, so task 382's backing survives any
> number of rings. `outerFringeMask` was lifted out of `bleedOuterFringe` — the two passes need the
> same region from opposite sides.
>
> **The old e2e assertion could not see this**, and that is worth recording: a fringe pixel with
> opaque ink under it ends at **alpha 255**, so a flood fill "through non-opaque pixels" stops before
> reaching it and the `bright` count was structurally blind to the defect. The green was real but
> measured the wrong region. The `visible` count — same walk, now the ASSERTION rather than a
> vacuity guard — is the discriminator: **248 → 328** (the sprite's full fringe), confirmed in the
> real editor: `[k8s-halo] {"bright":0,"visible":328,"size":"75x71"}`.
>
> **Verified:** unit +3 (`plantuml-render.test.ts`, RED-checked — capping the loop at one ring turns
> exactly the new fringe test red) · real-VS-Code e2e `plantuml-stdlib-more.spec.ts`, all 3 green ·
> typecheck, `npm test` (1936), `lint:ci` clean · shipped in **1.2.8** (version bump also evicts the
> render cache, which keys on `extensionVersion()`).
>
> **Why the icons look soft at all — asked and answered, no defect.** These are PlantUML `sprite`s:
> hand-authored BITMAPS encoded in the stdlib text (`sprite $KubernetesPod [70x66/16z]`), not vector
> art, and `16z` means **16 grey levels** — the colour comes from PlantUML mapping that ramp through
> `KUBERNETES_SYMBOL_COLOR`, which is also why the anti-aliasing quantises so coarsely. Our pipeline
> does not downscale: the SVG places the image at its native `75x71` and the SVG is 1:1. `k8s` ships
> **one** size for all 38 sprites, so there is no higher-res source to switch to. Native sizes:
> awslib 64x64, azure 70x70, cloudinsight 48x48 — and `kubernetes` ships each of its 72 icons at
> **three** scales (64x63 / 128x125 / **256x249**), so `k8s-sprites-unlabeled-100pct` would be a real
> 4x improvement for that library. Noted, not done — it belongs with the still-open half below.
>
> **The kubernetes sprite badge itself — still open.** Investigated in depth: font-color/skinparam
> injection has ZERO effect on the baked sprite pixels (proven empirically — 4 rendered variants,
> including PlantUML's `<style>` FontColor, none changed the badge). Decoded the actual sprite
> pixels: it is genuinely opaque (51% mid-gray heptagon body, 15% near-white margin, both at full
> alpha) with a translucent dark glyph overlay (~27% alpha) — confirming this task's own original
> diagnosis that `compositeSprite`/`backSprites` (task 382's hole-filling tool) cannot fix it, for
> exactly the reason already written below. A real fix needs a NEW pixel-remap pass (recolor by
> luminance/alpha band: light margin → transparent, mid body → a badge colour, translucent glyph →
> a light ink) — a materially bigger job than the border fix above. **Scope answered 2026-07-28: the
> user does NOT want another pixel heuristic; the badge, and every remaining icon ugliness on dark,
> is now tracked in [task 437](437-pretty-icons-in-dark-mode.md) with the steer "fix PlantUML
> instead". This task's remaining half stays open there, not here.**
>
> **2026-07-28 (3) — correction: domainstory is NOT the same gap.** This note originally claimed the
> shared cause was "`backSprites` never runs for a diagram with no own skinparam, i.e.
> `ownTheme === false`", and that it also explained task 384's dark domainstory icons. Both halves
> are wrong, measured: domainstory expands to `ownTheme === true` (22 `skinparam` lines), so the
> adaptation pass *does* run — it just marks nothing, because domainstory draws no element
> backgrounds. More importantly its ink is chosen at SOURCE (`$Actor_IconColor =
> modeAdjustedColor("#1f2833")` under `PUML_MODE ?= "light"`) and can be overridden with two
> `!global` lines, proven in a real render — no pixel pass needed. See
> [task 384](384-domainstory-icons-silently-dropped.md). The kubernetes badge below keeps its own
> diagnosis: opaque, inverted, and with no source-level colour hook.

## What was checked

`eip`, `k8s`, `kubernetes`, `cloudogu`, `cloudinsight` — the five libraries task 354 vendored and
task 382 audited OFFLINE but never drew. One diagram per library, rendered in a real VS Code on
`github-dark` and `github-light` (`tmp/icons/stdlib-untested.md` + a throwaway probe spec).

**All five render offline — no `Fatal parsing error`.** That alone was unverified until now: the
stdlib pre-inliner (task 136) was only ever proven on C4 / AWS / Azure.

| library | dark render | sprites | backed | our palette? | verdict |
|---|---|---|---|---|---|
| eip | ✅ light glyphs on dark cards | 3 | **3** | no (own skinparam → dark adaptation) | correct — and this was the extreme case: 90% of its icons carry enclosed holes, avg 38% of the icon area |
| k8s | ✅ brand-blue heptagons, white glyphs | 2 | **2** | no (own skinparam) | correct |
| cloudinsight | ✅ white glyphs on dark cards | 2 | 0 | yes (no skinparam anywhere) | correct — our palette gives a dark card and the glyph is drawn in the theme ink |
| cloudogu | ✅ dark glyph on the brand-blue card | 2 | 0 | no | correct — the blue is `PRIMARY_COLOR`, a saturated identity colour we deliberately never touch (black on `#23a3dd` ≈ 7:1) |
| **kubernetes** | ❌ **a light 64×63 sticker** | 3 | 0 | yes | **the defect** |

So task 382's sprite backing does exactly what it was built for on the library it was predicted to
matter most for (`eip`), and four of five are fine. One is not.

## Why kubernetes breaks, and why the 382 backing cannot fix it

Decoding the sprite grids directly (same `16z` inflate the 382 audit used):

| sprite | fully transparent (level 0) | near-transparent (level ≤1) |
|---|---|---|
| master | 0.7% | 15.5% |
| node | 0.6% | 15.7% |
| etcd | 0.3% | 16.9% |
| sa | 0.4% | 10.8% |
| user | 0.1% | 19.3% |

The set is **essentially opaque** — under 1% of each icon is transparent — and it is **inverted**:
the border/background sits at level **15** (full ink) and the heptagon interior at level **9**. It is
authored to be drawn in a DARK colour on a WHITE page, where full ink reads as a dark badge and the
interior as a grey icon. That is exactly what the light-theme render shows.

`kubernetes/k8s-skinparam` sets only `fontColor MediumBlue` — no sprite colour — so the sprite takes
the current text ink. On a dark theme that ink is light, and the whole 64×63 square becomes light:
a bright sticker on a dark page.

**The task-382 pass is the wrong tool here.** It exists for knock-outs — transparent holes that
assume a white page — and it fills the region a flood-fill cannot reach from the border. On this set
that region is the ICON INTERIOR, so backing it would paint over the artwork instead of behind it.
(The 382 audit's "69% with holes, 13% avg area at threshold ≤1" line is the same 15% measured above,
read from the other side: those level-1 pixels are inside the icon, not around it.)

## Options — none chosen

1. **Invert the sprite for dark themes.** The composite path (`compositeSprite`) already decodes the
   rendered artwork to a canvas; inverting luminance there for a sprite detected as opaque+inverted
   would put the badge back on the page and the icon back in the ink. Needs a detection rule that
   cannot misfire on the other libraries — "opaque (<2% transparent) AND its border ink exceeds its
   interior ink" is measurable and true only of this set among the ten vendored.
2. **Draw it in a fixed colour**, the way `k8s` does (`KUBERNETES_COLOR #0072C6`): inject a colour
   for `kubernetes` sprites so the badge is brand blue on both themes and never follows the ink.
   Smaller and more predictable than 1, but it hard-codes a per-library rule.
3. **Leave it.** It is legible, just heavy — a light badge rather than a dark one. The library is
   niche (the `k8s` set, which renders correctly, covers the same ground).

## Reproduction

`tmp/icons/stdlib-untested.md` holds one diagram per library; the screenshots taken for this
write-up are `tmp/icons/{0-4}-{lib}{,-light}.png`. The probe spec was throwaway and is not
committed — it opened that file in the custom editor, waited 45 s for the engine, and reported per
block: rendered/errored, sprite count, `data-vmarkd-sprite-filled` count, `data-vmarkd-adapted`
count, and every shape/text fill.

## Not done

- No fix, no test. The three options above need a decision first.
- `cloudogu`'s dark-glyph-on-blue was judged by contrast (≈7:1), not by eye.
- The other two vendored libraries task 354 added — `edgy`, `domainstory` — were drawn straight
  after this, in the same session: `edgy` is correct, `domainstory` renders with every icon silently
  missing (task 384). All ten vendored libraries have now been rendered at least once.
