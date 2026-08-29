# Task 225 — Expose bundled Lute extensions: `[toc]`, `==mark==`, sup/sub

**Status:** planned · **Impact:** 🟡 med, cheap-win batch · **Origin:** task 192 §6

## Problem

The bundled engine already supports three requested features, all switched off and
unexposed (verified by executing the vendored `lute.min.js` in Node — memory
`[[lute-runs-in-node]]`):

- `[toc]` — `SetToC(true)` renders a live `vditor-toc` block; Vditor default off
  (`constants.ts:65`), we never set it → stays literal text.
- `==mark==` — Lute supports (default off, `constants.ts:61`) → literal `==hi==` today.
- Superscript/subscript — Lute has `SetSup`/`SetSub` (probe-verified in IR) but vendored
  `setLute.ts` never calls them; today `~x~` parses as strikethrough — a REAL conflict
  needing a decision, not just a flag.

## Scope

- [ ] Settings (all default off — parser changes alter how EXISTING docs render):
      `vmde.markdown.toc`, `vmde.markdown.mark`, `vmde.markdown.supSub`.
- [ ] Wire: `buildVditorOptions` `preview.markdown.*` where Vditor plumbs it ([toc], mark);
      sup/sub needs a `setLute.ts` patch (VDITOR_TS_PATCHES registry — anchor + throw-on-
      drift like the others) since Vditor has no option for it.
- [ ] Per feature verify the full loop, not just render: IR dual-node editing (markers
      expand/collapse), serialization round-trip byte-stable, wysiwyg + sv render, theme
      CSS for `<mark>` (dark mode!) and the toc block.
- [ ] `~x~` conflict: document that supSub=on changes `~x~` strikethrough→subscript
      (`~~x~~` unaffected); pin both states in tests.
- [ ] `[toc]` extras: clicking a toc entry navigates (Vditor built-in — verify), outline
      panel unaffected.

## Out of scope

- Definition lists (genuinely absent from Lute — not exposable), footnote config changes
  (already on), task 221's `[toc]` snippet entry (lands there).

## Verification

- L1: options-plumb units per flag + the setLute patch in `patch-mutation.test.ts`
  (automatic once registered).
- L2: per feature — render, edit-in-IR, round-trip; both flag states; `<mark>` dark CSS.
- L3 real-VS-Code (mandatory): one spec with all three on — render + edit + save fidelity
  on a fixture exercising each.
