# Task 300 — Content-width presets (narrow / default / wide / full)

**Status:** planned · **Impact:** ⚪ low, tiny · **Origin:** task 192 §12 (Ghostwriter/iA pattern)

## What it is & the effect

Writing apps treat the text MEASURE (line length) as a first-class comfort setting:
Ghostwriter ships narrow/medium/wide/full, iA Writer and Typora keep a fixed readable
measure. Long lines are the top readability complaint on wide monitors; ~60–75 characters
is the typographic sweet spot.

**Today in vMarkd:** one boolean — `vmarkd.editor.fullWidth` (applied as a
`data-full-width` attr in live-config.ts:72). You get "capped" or "everything"; no
narrow-focused-writing measure, no wide-but-not-full for tables/diagrams-heavy docs.

## Scope

- [ ] Generalize to `vmarkd.editor.contentWidth`: enum `narrow` (~60ch) / `default`
      (today's cap) / `wide` / `full`, or a numeric `ch` value — same data-attribute +
      CSS-var mechanism live-config already uses; applies live.
- [ ] `fullWidth` kept as a deprecated alias routed through a resolver (the
      theme.content migration memory: VS Code keeps stale values verbatim — EVERY read
      goes through the resolver, old `true` → `full`).
- [ ] Preview/sv panes follow the same measure (the preview-gutter contract stays);
      diagrams keep their own fill-width rules (diagram-width memory — don't couple).

## Out of scope

- Per-document width (front-matter — later note), responsive auto-measure.

## Verification

L1: resolver unit (alias mapping, numeric clamp). L2: each preset's computed max-width on
the content root; live flip; diagrams unaffected (diagram-width spec stays green).
@visual: one golden per preset (local-only net). L3: one real-VS-Code leg — setting flip
applies without reopen.
