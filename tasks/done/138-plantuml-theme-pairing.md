# Task 138 — PlantUML theme palette pairing (beyond foreground-only currentColor)

> **Status:** ✅ DONE — superseded by **ADR-0006** (`docs/adr/0006-diagram-theming-policy.md`,
> ~2026-06-28). Option 3 (full palette pairing) was adopted as the default: `plantumlStyleBlock()` in
> `media-src/src/plantuml-render.ts` injects a modern `<style>` block (element = surface, lines = line,
> text = fg, notes = accent) built from the active content-theme palette; author `skinparam`/`<style>`/
> `!theme` are left untouched (`HAS_OWN_THEME` guard); live re-theme runs via `rethemeDiagrams`. Asserted
> by `test/vscode-e2e/plantuml.spec.ts` (palette-paired: themed accent + fg + >2 distinct colours). This
> task file predates that work — the "foreground-only" problem below is the OLD state, kept for history.
> Created 2026-06-24; builds on task 87 + the pairing pattern from tasks 86 (mermaid) / 90 (echarts) / 91.

## Problem
Our offline PlantUML is **foreground-only themed**: the `themePumlSvg` post-process
(`patchPlantumlRender` in `media-src/esbuild-shared.mjs`) renders LIGHT, then rewrites baked
`#181818/#000000` → `currentColor` and flattens participant-box fills (`#E2E2F0`) to `currentColor`
@ 6% opacity. So PlantUML follows the editor **foreground** but NOT the content-theme **palette**
(accent/surface) the way mermaid does (task 86). User-set colours (`skinparam`, `#red`) survive (we
only touch defaults), but there's no themed accent. The TeaVM `{ dark: true }` option is deliberately
unused in favour of theme-agnostic currentColor.

## Options
1. **Keep currentColor (status quo)** — theme-agnostic, simple, already works on any bg. Lowest effort.
2. **Use TeaVM `{dark}`** — pass `dark` from the editor mode (the patch already threads `options.theme`
   from previewRender). Gives PlantUML's own dark rendering on dark editors; less flat than recolour,
   but binary light/dark (not palette-paired) and may fight currentColor — pick one model.
3. **Palette pairing (mermaid-style)** — map the content theme's `{bg,fg,accent}` (reuse
   `MERMAID_PALETTES` / `pairedPalette`) into the post-process: tint participant boxes / arrows / notes
   with the accent instead of flat currentColor. Most work; closest to mermaid's look.

## Decision gate
Is foreground-only good enough? PlantUML diagrams are often intentionally colourful (skinparam), so
heavy palette injection can clash with author intent. Recommendation: **stay with option 1** unless
users ask; if pursued, option 3 limited to DEFAULT (un-coloured) elements only, preserving any explicit
skinparam colours.

## Acceptance / tests
- If implemented: default-coloured PlantUML elements pick up the content-theme accent; explicitly
  `skinparam`-coloured elements are untouched; light/dark both legible. Live re-theme still works
  (`reRenderPlantuml`).

## Related
Tasks 87, 86/90/91 (pairing pattern + `MERMAID_PALETTES`). `themePumlSvg`/`patchPlantumlRender` in
`media-src/esbuild-shared.mjs`; `plantuml-retheme.ts`.
