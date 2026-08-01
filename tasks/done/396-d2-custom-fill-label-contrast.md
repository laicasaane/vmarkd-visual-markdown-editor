# 396 — D2 node label colour ignores a custom `style.fill`, may not contrast

**Status: ✅ DONE (2026-07-28), shipped in `a614663`.**

**Outcome.** Measured cause: sketch mode paints fills as rough.js HACHURE (~20 % coverage), so
contrasting the label against the shape's own fill colour (`labelColor`) picks a colour against a
backdrop that is mostly the PAGE, not the fill. Fixed by disabling the fill-contrast branch in
sketch mode (a `hachured` flag threaded through `textAttrs`/`drawGrid`), falling back to the theme's
own text colour; CRISP mode — where the fill really is solid — is unchanged and unit-pinned.
Unit + real-VS-Code e2e (`d2-sketch.spec.ts`), RED→GREEN verified both ways.
(Header left stale until 2026-07-29 — the fix landed, this line did not.)

## Report

> "na ciemnym d2 styled tez ma biala czcionka a powinna miec chyba jakinne" — the
> `styled: Styled { style: { fill: "#2b6cb0"; … } }` node (dark theme, sketch mode on): the label
> text is plain white regardless of the author's own `#2b6cb0` fill.

## What was checked

Not measured yet. Per the d2-label-halo.spec.ts comment, node labels are deliberately left
UN-haloed ("they sit inside a filled shape and need none") — that reasoning assumes the shape's own
fill gives enough contrast against the label's colour by construction. `label-color`/`labelColor`
in `d2-render.ts` picks by luminance of the shape's OWN fill when one is resolvable
(`labelColor(fill?)`, line ~165) — worth checking why `Styled`'s explicit `#2b6cb0` didn't route
through that path, or whether it did and white-on-`#2b6cb0` was judged "close enough" by the
luminance threshold but doesn't hold up combined with sketch mode's hachure fill (which only paints
a FRACTION of the shape with the fill colour, hachure lines over the page background — so the
background BEHIND most of the label glyph is actually the page, not `#2b6cb0`, which `labelColor`
has no way to know about).

## Not done

- No measurement of the actual `labelColor()` branch taken for this node.
- No decision on whether sketch-mode hachure fill changes the contrast contract enough to need its
  own label-colour rule (separate from the crisp-fill case `labelColor` was built for).
