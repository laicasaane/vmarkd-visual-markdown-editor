# Task 507 — Mermaid C4: unreadable labels (white on light blue) + dark-page box ramp

**Status:** done · **Impact:** 🔴 high (C4 diagrams unreadable out of the box) · **Origin:** user report (2026-08-11) — "kolory w mermaid c4 na jasnym niebieskim tle jest nieczytelna czcionka"

## Problem

Mermaid's C4 renderer bypasses `themeVariables` completely and emits its colours inline:

| element | mermaid's hard-coded value |
|---|---|
| box fills | `#08427B` person · `#1168BD` system · `#438DD5` container · `#85BBF0` component · `#999999` external |
| **every in-box label** (title, `<<stereotype>>`, description) | **`#FFFFFF`** |
| relationship label + line + arrowhead | `#444444` |
| boundary frame (dashed) + its label | `#444444` |
| group `class` | always `person-man` — useless for typing; the FILL is the only key |

Measured contrast (WCAG AA wants 4.5:1):

- white on `#85BBF0` (component) = **2.0:1**, white on `#438DD5` (container) = **3.5:1** — the reported bug, present in every theme including stock mermaid.
- The first fix attempt repainted *all* `<text>` with one palette colour: on a light palette that put `#202020` on the `#08427B` person box = **1.6:1** (worse), and on a dark palette `#bbbebf` on `#176a96` = 3.2:1.

Root cause of that regression: **two classes of text with two different references**. Labels inside a
box must contrast with *that box's fill*; relationship/boundary labels with the *page background*.
One colour cannot serve both.

## Decision

User picked (2026-08-11) the **two-ramp** option out of three (canonical-everywhere / two ramps /
palette-derived):

- **dark page** — own ramp `#062b50 → #083e70 → #0d537f → #176a96` (+ external `#33383b`), white ink, ≥5.9:1 on every step. Mermaid's canonical ramp climbs into light blue, which glares on a dark editor.
- **light page** — mermaid's canonical ramp kept; only the ink is recomputed (so the light-blue `component` box gets dark ink at 7.5:1).

Palette-derived fills were declined as the bigger change that also drops C4's "always blue" identity.

**Deviation from the option as described:** box BORDERS are derived from the (possibly unchanged)
fill on both ramps, so a light-page box is not byte-identical to mermaid's output — its border is
`mix(fill, ink, .25)` instead of mermaid's hand-picked shade. Kept because the dark ramp needs
derived borders anyway and one rule beats two; visually it is a ≤1-step shift on the light ramp.

## Implementation

- `media-src/src/diagrams/mermaid/mermaid-c4-colors.ts` — `styleMermaidC4(container, colors)`:
  1. **Box pass** over `rect|path|polygon|circle|ellipse` with a real fill (`Container`/`SystemDb`/`Queue` draw as `path`, not `rect`): remap the fill through the ramp when it is one of mermaid's canonical five, derive the border from the resulting fill (`mix(fill, ink, .25)`), and ink every `<text>` in that shape's group with whichever of `#ffffff` / `#0d1b2a` contrasts better — so fills we never remap (external, `UpdateElementStyle`) are covered too.
  2. **Page pass** for everything else: remaining labels → palette `textColor`; `line`, fill-less `path[stroke]`/`rect[stroke]` (curved `BiRel`/`Rel_Back` relationships + boundary frames) and `marker path` → palette `lineColor`. Elements under `marker`/`defs` are excluded from the box pass.
- `mermaid-theme.ts` — `resolveMermaidC4Colors(init, theme, renderTheme)` now returns colours **unconditionally** (the ink pass must run even with no palette — mermaid's own 2.0:1 is a bug in every theme) and resolves **per call**, since Vditor's `renderTheme` flips without `applyMermaidTheme` running again. A palette decides its own darkness (`themeVariables.darkMode`); `theme`/`renderTheme` are the fallback signal only when no palette is in play.
- `src/shared/mermaid-palettes.ts` — added `contrastRatio()` on a proper gamma-corrected WCAG luminance. The existing `luminance()` is the cheap non-corrected approximation, fine as a "is this bg dark?" hint but off by up to ~2× as a contrast input; left as-is for its existing callers.
- The hook is installed on `window.__vmarkdStyleMermaidC4` and called from Vditor's mermaid render via the `patchMermaidC4Colors` esbuild patch (anchored on `item.innerHTML = mermaidData.svg;`).

## Tests

- [x] unit `media-src/src/diagrams/mermaid/mermaid-c4-colors.test.ts` — dark ramp (fills, white ink, curved path, boundary, derived border), light page (canonical fills, per-box ink), a loop asserting **every** box label clears 4.5:1 against its own box on both ramps, and the no-palette path.
- [x] chromium e2e `media-src/e2e/mermaid-palette.spec.ts` — dark palette / light palette / no palette on a real C4 render (boundary + external + `BiRel`), each asserting zero `#444444` leftovers; plus `C4Container` (`ContainerDb`/`ContainerQueue` = `path` shapes, `Rel_Back`) and a LIVE dark→light flip (the `reRenderMermaid` offscreen-swap path — the dark ramp has no reverse mapping, so only a true re-render walks it back).
- [x] real-VS-Code e2e `test/vscode-e2e/mermaid-c4-colors.spec.ts` — dark palette, full colour map + leftovers check.
- [x] `patchMermaidC4Colors` covered in `test/backend/vditor-source-patches.test.ts`.
