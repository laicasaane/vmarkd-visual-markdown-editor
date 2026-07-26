# 383 — the `kubernetes` icon set renders as a light sticker on dark themes

**Status: 🔍 MEASURED, no fix written.** Found 2026-07-26 while closing task 382's open question
("five vendored icon libraries have never been rendered in the editor").

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
- The other two vendored libraries task 354 added — `edgy`, `domainstory` — were NOT part of this
  round and remain unrendered.
