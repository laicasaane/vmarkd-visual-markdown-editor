# 397 — SMILES molecule render is too large, scale down

**Status: ✅ DONE (2026-07-28).**

## Report

> "smiles zrob ogolnie mniejsze tak 4/3 ztego co teraz" — the SMILES (chemistry) diagram renders
> too large overall; wants it scaled down to roughly 3/4 of the current size.

## Root cause — measured, and the FIRST fix attempt was proven to be a no-op before shipping

The obvious lever — smiles-drawer's constructor `{width, height}` option — turned out to have
**zero effect** on the rendered size in how this codebase calls it, confirmed empirically (not by
reading docs): `repairSmiles` (`media-src/src/smiles-render.ts`) creates its OWN placeholder
`<svg id="...">` and hands `.draw()` a **selector string** pointing at it. Reading the vendored
library (`media/vditor/dist/js/smiles-drawer/smiles-drawer.min.js`), the constructor option only
gets written as a `width`/`height` ATTRIBUTE on the SVG in the branch where the library creates a
**brand-new** SVG element itself (`target === null`) — a branch our call never reaches, since we
always pass an existing element via `#id`.

Proven directly in the real VS Code webview: swapping `new Drawer({ width: 375, height: 375 })` for
`new Drawer({})` (library defaults) produced a **byte-identical `viewBox`** to 13 decimal places,
and the on-screen `getBoundingClientRect()` size was unchanged (305×305 either way) across repeated
runs. A second candidate, `bondLength` (the molecule's internal drawing unit, default 30), DID move
the `viewBox` — but the on-screen box size still didn't change, because an SVG with a `viewBox` and
no `width`/`height` attribute stretches to fill 100% of its CSS box regardless of its internal
coordinate units.

**The only real lever is CSS.** `main.css` already caps `.language-smiles > svg` at
`max-width: 56%` of the column — a PRIOR fix from an earlier request ("smiles mniejszy ~70%",
80% → 56%). Since the SVG has no intrinsic width/height, its on-screen size is *exactly*
`max-width` of its container at any viewport width — so 3/4 of the current size is simply
`56% × 0.75 = 42%`.

## Fix

- `media-src/src/main.css`: `.language-smiles > svg { max-width: 56% }` → `42%`, **in both** places
  it appears — the live render rule (`:is(.vditor-ir__preview, .vditor-wysiwyg__preview,
  .vditor-preview) .language-smiles > svg`) and the `.vmarkd-stale-overlay[data-lang="smiles"] > svg`
  rule (shown during a re-render). The two are explicitly commented as kept in sync — missing the
  second would make the transient stale-overlay a visibly different size from the settled render.
- `media-src/src/smiles-render.ts` is **unchanged** — the constructor stays `new Drawer({}, {})`.
  A comment at the CSS rule records that the constructor option is inert here, so nobody re-adds it
  as "the" size lever later.

## Verification

- Harness test (`media-src/e2e/custom-diagrams.spec.ts`): constructs a minimal synthetic
  `.language-smiles > svg` (no smiles-drawer engine involved — the ratio is pure CSS) and asserts
  `svg width / pane width ≈ 0.42`. RED→GREEN verified (reverting the CSS to 56% fails the test).
- Real-VS-Code e2e (`test/vscode-e2e/smiles-render.spec.ts`): renders the actual fixture and asserts
  the same ratio on the real drawn molecule. RED→GREEN verified (56% fails at 0.56, not 0.42).
- The original unit test (`smiles-render.test.ts`) that asserted the constructor was CALLED with
  `{width:375,height:375}` was **deleted** — it tested the mock, not the behaviour, and the
  RED/GREEN check above is exactly what caught that: the test passed while the actual on-screen
  size was provably unchanged. Removing the mock-driven constructor-tracking scaffolding
  (`stubDrawer`'s `moleculeOptions`) went with it, since nothing else used it.

## See also

- `media-src/src/main.css` — the two `max-width` rules (task history: 80% → 56% → 42%).
- `media/vditor/dist/js/smiles-drawer/smiles-drawer.min.js` — the vendored library's `.draw()`
  target-resolution branches, read directly to establish the constructor option's actual (lack of)
  effect.
- SMILES is one of the natural-size, shrink-only renderers (flowchart/plantuml/smiles contract);
  this fix doesn't fight that — it just moves the existing relative CSS cap.
