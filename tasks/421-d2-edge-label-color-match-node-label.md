# 421 — D2 edge labels are dimmer than node labels; make them read at the same weight

**Status: 📋 planned — measured, no fix written.** Reported 2026-07-28 by the user with a screenshot
of a `vscode-dark`-family theme: the node label "Web Frontend" sits at full foreground brightness
while the edge label "request" on the connection below it is a visibly darker grey.

## Report

> "kolor labelek na liniach powinien być taki sam jak kolor labelek w boxach w d2"
> — edge-label colour should match the colour of labels inside the boxes.

Screenshot: a bright-blue-stroked hatched node reading "Web Frontend" in near-white text, with the
outgoing connection's "request" label rendered in a muted grey roughly halfway between the page
background and the foreground.

## Mechanism (verified in the source, not assumed)

The two labels are painted from **two different tokens**, on purpose:

| Element | Emitted at | Fill |
|---|---|---|
| Node / container label | `d2-render.ts:493-497` (`labelAttrs`) | `s.fontColor` → contrast-vs-`s.fill` → **`themeText`** (`sty.text`, d2 **N1**) → `currentColor` |
| Connection label | `d2-render.ts:1147` | **`sty.textMuted`** (d2 **N2**) |
| Connection label (italic path) | `d2-render.ts:1742` | **`sty.textMuted`** (d2 **N2**) |

For the editor-paired palettes (`paletteStyle`, `d2-render.ts:314-339`) those resolve to:

```ts
text:      p.fg,                     // full foreground
textMuted: mix(p.bg, p.fg, 0.6),     // 60% of the way from background to foreground
```

So the gap the user is seeing is exactly the `0.6` mix — the edge label is deliberately 40% of the
way back toward the page background. In the `d2-*` catalog themes it is `t.N2` vs `t.N1`, the same
split coming from d2's own token map.

**This is a faithful port, not a bug.** `d2Catalog`'s header comment records that d2 v0.7.1 itself
paints `labels=N1, edge labels=N2 (italic)`, verified against the real `d2` binary. Changing it is a
deliberate divergence from upstream d2 for legibility in the editor — worth stating in the code
comment so a future reader doesn't "restore fidelity" and silently undo this.

## The one real ambiguity — resolve it before writing code

"Same colour as the box labels" cannot be literal, because box labels are **not one colour**: a
shape with an explicit `fill` gets black-or-white by luminance (`labelColor`, `d2-render.ts:165-173`),
not the theme foreground. The screenshot shows the *default* case (no explicit fill → `themeText`).

The intended reading, and what this task should implement: **edge labels use `sty.text` (N1), the
same token the default node label uses.** Edge labels are not inside a fill, so the luminance branch
has nothing to contrast against and does not apply to them.

## Scope

- [ ] Point both edge-label emit sites (`d2-render.ts:1147`, `:1742`) at `sty.text` instead of
      `sty.textMuted`, with a comment recording that this is a deliberate divergence from d2's own
      N1/N2 split and why (editor legibility, user report 2026-07-28).
- [ ] **Do not touch the sql-table path.** `sty.textMuted` is also consumed at `d2-render.ts:2200`
      for the sql column *type* (`const typeC = sty.mono ? 'currentColor' : sty.textMuted`). That is
      a genuine two-tier hierarchy inside a table body and is not what the user is looking at. If
      after the change `textMuted` has exactly one remaining consumer, leave the field in place —
      do not inline or delete it.
- [ ] Bump the extension version. Render output changes and the diagram cache key includes the
      version (documented contract in `editor-config.ts`); without the bump, every already-cached d2
      diagram keeps serving the old muted label from disk and the user will report it as "not fixed".

## Verification

- [ ] Unit test in the d2 render tests asserting the emitted `<text>` for a connection label carries
      the same `fill` as the emitted `<text>` for a default (unfilled) node label, on both a paired
      palette and a `d2-*` catalog theme. Verify RED first — the current code makes these differ.
- [ ] Real-VS-Code e2e (`test/vscode-e2e/`, alongside `d2-label-halo.spec.ts` / `d2-theme.spec.ts`):
      read the computed `fill` of a node label and an edge label in the same rendered diagram and
      assert equality. Run it: `node build.mjs` first, then
      `xvfb-run -a npm --prefix test/vscode-e2e test -- d2-label-color.spec.ts`.
- [ ] Package + install the VSIX and have the user judge the screenshot case in their real editor
      before calling it done — this is a perceptual change and the build alone will not update it.

## Watch for — this change makes two open d2 label problems more visible, not less

- **[Task 394](394-d2-edge-label-halo-too-heavy.md)** — the edge label's 4px halo already reads as a
  thick hand-inked outline at the label's ~14.7px font size. Brightening the glyph raises the
  contrast between glyph and halo, so 394 will likely look *worse* after this lands. Re-judge the
  halo width once this ships, and consider doing 394 in the same pass rather than shipping a
  brighter label on top of a halo that is already too heavy.
- **[Task 395](395-d2-layout-too-cramped.md)** — where edge labels crowd or overlap node boxes, a
  full-brightness label competes with the node label for attention instead of receding. Muting was
  partly hiding that crowding; this change stops hiding it.
- **[Task 396](396-d2-custom-fill-label-contrast.md)** — same family (label contrast against what is
  behind it), different element. Not blocked by this, but worth reading first for the contrast rules
  already established.

## See also

- `media-src/src/d2-render.ts` — `labelColor` (:165), `labelAttrs` (:486), `paletteStyle` (:282),
  `d2Catalog` (:348), edge-label emits (:1147, :1742), sql column type (:2200).
- `test/vscode-e2e/d2-theme.spec.ts`, `test/vscode-e2e/d2-label-halo.spec.ts` — closest existing
  patterns for asserting d2 colour output in the real webview.
- ADR-0006 / the `vmarkd-renderer-theming` skill — the full-palette theming contract these tokens
  implement.
