# Task 157 — Fullscreen diagram preview (design + build)

> **Status:** 💡 idea / design-first — created 2026-06-26. **Depends on completed
> [Task 531](done/531-unified-diagram-viewport-controls.md).** Spun out of the inline diagram zoom/pan work
> (task 158): a fullscreen action in the shared diagram control bar needs a proper
> **fullscreen preview** to explore large diagrams (the trigger: a big C4 D2 diagram unreadable at the
> inline `max-height:480px`). Task 531 provides the renderer-independent bar and viewport controller;
> THIS task supplies its fullscreen action and builds the richer experience without a second toolbar.

## Problem
Large diagrams (D2 C4 graphs, wide mermaid/graphviz) are capped inline (`width:100%`, `max-height:480px`
— see [[diagram-fill-width]]). Inline zoom/pan (task 158) helps, but a dedicated fullscreen view is the
right surface for real exploration. Task 158's native-fullscreen button is gated off; Task 531 will replace
that dead branch with one reusable on-screen bar whose fullscreen action is supplied here.

## To decide (the "wymyślić" part)
- **Surface:** native `element.requestFullscreen()` on the diagram container (cheap, ships in 158) vs a
  custom in-webview overlay (`position:fixed` lightbox over the editor) — the overlay gives full control
  of chrome (toolbar, backdrop, close, ESC) and avoids Fullscreen-API quirks inside the VS Code webview
  iframe (needs `allow="fullscreen"` on the webview iframe — verify it's permitted by the host/CSP).
- **Controls:** reuse Task 531's one control bar and live `DiagramViewportController`; do not create a
  fullscreen-only copy. The final order is Pan, Zoom out, Zoom in, Fullscreen/Exit fullscreen, Reset.
  ESC and the fullscreen action exit. Task 531's existing keyboard and double-click interactions remain.
- **Rendering:** reuse the same SVG (scale up — SVG is resolution-independent, so no re-render needed) vs
  re-render at higher fidelity. For D2 specifically: same `toSVG` output, just a bigger viewport.
- **Scope:** Task 531 covers every current `zoom !== 'none'` renderer through front-end
  adapters. The fullscreen surface must accept that same controller set; adding zoom to inert engines
  remains outside both tasks.
- **Theming:** the overlay backdrop must follow the editor theme; the diagram keeps its own theme
  (transparent paired themes need a sensible backdrop so they stay legible — see [[content-theme-migration]]).

## Acceptance / tests
- [x] Task 531 is complete; this task imports its control-bar/controller seam instead of duplicating it.
- [ ] Remaining surface, rendering, and theming choices are decided and noted here; controls and
      zoom-capable scope remain the Task 531 contract.
- [ ] The shared Fullscreen action opens the preview; ESC / Exit fullscreen / close exits; the same
      Pan/zoom/reset actions and live viewport state work before, during, and after the transition.
- [ ] Real-VS-Code e2e (`test/vscode-e2e/`) — webview/renderer feature ⇒ MUST write AND run it (AGENTS):
      open a fixture, use the shared Fullscreen action, assert the overlay/fullscreen is shown, and
      prove controller state plus toolbar identity/ordering survive enter and exit.
- [ ] Works in IR preview pane AND the full Preview pane; survives mode switches (document-level / observer).
- [ ] typecheck + `lint:ci` green; coverage for the new code.

## Related
- Task **531** (unified front-end control bar, renderer adapters, Pan toggle, zoom/reset) — the direct
  dependency and sole control surface this task extends.
- Task **158** (inline static-SVG zoom/pan) and Task **459** (engine-owned keyboard zoom/reset) — the
  completed interaction foundations consolidated by Task 531.
- `media-src/src/diagrams/diagram-zoom-gate.ts` (Ctrl-to-interact gate for markmap/mindmap — pattern
  reference), `media-src/src/diagrams/custom-diagrams.ts` (diagram wrappers),
  `media-src/src/main.css` (diagram sizing). Memories: [[diagram-fill-width]],
  [[diagram-ctrl-zoom-gate]], [[show-partial-results-for-eval]].
