# Task 129 — D2 extra text styles (font-size, font, underline, text-transform)

> **Status:** 🟢 DONE (shape text styles) — 2026-08-01. `textAttrs()` in `d2-render.ts` now reads
> `s.fontSize` (overrides the caller's default font-size), `s.underline` (→
> `text-decoration="underline"`); a new `transformLabel()` helper applies `s.textTransform`
> (uppercase/lowercase/capitalize) to the label STRING (SVG `text-transform` CSS is unreliable, so we
> transform JS-side, as the task's own approach section said). `leafInfo()`'s default/rectangle-ish and
> `image` leaf paths thread `s.fontSize` into `measure()` so the box grows to fit a bigger font (no
> clip) — sql_table/class/text/code sizing untouched (out of scope, their own specialized math).
> Applied at all 4 shape-label `textAttrs()` call sites (container header, person, the leaf
> default/switch, grid header); the 5th call site (`D2Column`, sql/class-adjacent) intentionally left
> untouched — columns have no `fontSize`/`underline`/`textTransform` fields.
> **`font` (family) deliberately NOT implemented** — out of scope per the Decision Gate below (we ship
> one offline font stack). Edge-LABEL font styling (the `D2Edge` fields) is also NOT covered — edges
> have their own separate, still-hardcoded label render path (~line 1824); noted as a gap, not fixed
> here.
> Tests: `d2-render.test.ts` → `describe('text styles: font-size / underline / text-transform (task
> 129)')` (7 tests: font-size grows box + emits the attr, underline, uppercase/lowercase/capitalize,
> 'none' no-op, byte-identical default). `d2-quality.test.ts` (8 tests, byte/metric-stable) + typecheck
> + `lint:ci` all green. Full d2-dir suite: 205/205 passing.
>
> **✅ Unblocked 2026-07-05 — [task 159](159-d2-wasm-export-batch.md) shipped: `fontSize`/`font`/
> `underline`/`textTransform` on `D2Shape` AND `fontColor`/`fontSize`/`bold`/`italic`/`underline` on
> `D2Edge` (connection label) are now exported. Only the render remains — no WASM rebuild needed.**

## Problem
D2 supports per-shape/edge text styling: `style.font-size`, `style.font` (font family),
`style.underline`, `style.text-transform` (`uppercase`/`lowercase`/`capitalize`/`none`). We honour
only `bold`, `italic`, `font-color` (via `textAttrs` in `d2-render.ts`); the rest are ignored, so e.g.
a deliberately large title or an underlined label renders at the default size with no decoration.

## Root cause
`main.go` marshals `bold/italic/fontColor` but not `FontSize/Font/Underline/TextTransform`. Not in the
graph → not rendered.

## Approach
- **WASM:** add `fontSize`, `font`, `underline`, `textTransform` to `outShape` (+ edge text if d2 allows
  it there). Update `d2-wasm.ts` types.
- **toSVG/textAttrs:** `font-size` → the `<text>` font-size; `underline` → `text-decoration="underline"`;
  `text-transform` → apply in JS to the label string (SVG has no reliable `text-transform`), or emit
  the CSS property; `font` → a font-family **only if** the family is one we actually bundle (offline —
  otherwise ignore + document, like the icon/CSP note in task 124).
- **⚠️ Sizing:** `font-size` changes the box that fits the label. The sizer (`canvasMeasure`) +
  `dimsToFit` must measure at the shape's font-size, not the global `FONT_SIZE`, or the box clips. Thread
  per-shape font-size through `leafInfo`/`shapeBox`.

## Decision gates
- `font` (family) is mostly unusable offline (we ship one font stack) — likely ignore + note rather
  than implement. Confirm scope = font-size + underline + text-transform. **Resolved: confirmed —
  `font` stays unread in `d2-render.ts`, deliberate.**

## Acceptance / tests
- [x] Unit: a shape with `font-size: 28` produces a `<text font-size="28">` AND a box sized for it (no
  clip); `underline` adds the decoration; `text-transform: uppercase` upper-cases the rendered label.
- [x] Keep `d2-quality.test.ts` / typecheck / lint green; byte-stable on the 8 samples (none set these).

## Related
Tasks 104, 121/124 (shared WASM bump). `textAttrs`, `canvasMeasure`, `dimsToFit`/`shapeBox` in
`d2-render.ts`; style extraction in `main.go`.
