# Task 157 — Fullscreen diagram preview (design + build)

> **Status:** ✅ DONE 2026-08-31 — created 2026-06-26. **Depends on completed
> [Task 531](531-unified-diagram-viewport-controls.md).** Spun out of the inline diagram zoom/pan work
> (task 158): a fullscreen action in the shared diagram control bar needs a proper
> **fullscreen preview** to explore large diagrams (the trigger: a big C4 D2 diagram unreadable at the
> inline `max-height:480px`). Task 531 provides the renderer-independent bar and viewport controller;
> THIS task supplies its fullscreen action and builds the richer experience without a second toolbar.

## Problem
Large diagrams (D2 C4 graphs, wide mermaid/graphviz) are capped inline (`width:100%`, `max-height:480px`
— see [[diagram-fill-width]]). Inline zoom/pan (task 158) helps, but a dedicated fullscreen view is the
right surface for real exploration. Task 531 replaced Task 158's dead native-fullscreen branch with
one reusable on-screen bar whose working fullscreen action is supplied here.

## Decisions
- **Surface:** custom in-webview `position:fixed` overlay. It avoids iframe Fullscreen API permission
  and browser-chrome variance while giving VMDE deterministic backdrop, focus, Escape, and restore
  behavior.
- **Controls:** reuse Task 531's one control bar and live `DiagramViewportController`; do not create a
  fullscreen-only copy. The final order is Pan, Zoom out, Zoom in, Fullscreen/Exit fullscreen, Reset.
  ESC and the fullscreen action exit. Task 531's existing keyboard and double-click interactions remain.
- **Rendering:** move the same live renderer wrapper into the overlay and restore it through a DOM
  placeholder. No clone or re-render: SVG/canvas/map instance, controller, transform, Pan state, and
  the exact bar all retain identity.
- **Scope:** Task 531 covers every current `zoom !== 'none'` renderer through front-end
  adapters. The fullscreen surface must accept that same controller set; adding zoom to inert engines
  remains outside both tasks.
- **Theming:** the overlay backdrop must follow the editor theme; the diagram keeps its own theme
  (transparent paired themes need a sensible backdrop so they stay legible — see [[content-theme-migration]]).

## Acceptance / tests
- [x] Task 531 is complete; this task imports its control-bar/controller seam instead of duplicating it.
- [x] Remaining surface, rendering, and theming choices are decided and noted here; controls and
      zoom-capable scope remain the Task 531 contract.
- [x] The shared Fullscreen action opens the preview; ESC / Exit fullscreen / close exits; the same
      Pan/zoom/reset actions and live viewport state work before, during, and after the transition.
- [x] Real-VS-Code e2e (`test/vscode-e2e/`) — webview/renderer feature ⇒ MUST write AND run it (AGENTS):
      open a fixture, use the shared Fullscreen action, assert the overlay/fullscreen is shown, and
      prove controller state plus toolbar identity/ordering survive enter and exit.
- [x] Works in IR preview pane AND the full Preview pane; survives mode switches (document-level / observer).
- [x] typecheck + `lint:ci` green; coverage for the new code.

## Implementation

- `diagram-fullscreen.ts` owns one active modal overlay, body-scroll lock, origin placeholder,
  backdrop close, and capture-phase Escape. `fullscreenActionFor(wrapper)` is the optional Task 531
  seam; the shared bar reacts to lifecycle events and changes its one button between `Fullscreen
  diagram` and `Exit fullscreen` without rebuilding.
- Entering moves the exact wrapper and shared control bar into `.vmde-diagram-fullscreen-stage`;
  exiting restores the exact DOM position. The shared gate and rendered-surface resolver recognize
  the stage, so Markmap, mindmap, Leaflet, and static controllers keep working there.
- Theme-token CSS supplies the modal backdrop/stage and removes inline max-size limits without
  changing renderer palettes. Focus moves to the active fullscreen action and returns to the same
  button on exit; Escape and backdrop close use the same exit authority.

## Verification evidence

- Focused unit set: 7 files / 40 tests passed, including exact wrapper/bar identity, fixed five-button
  order, Escape, DOM restoration, controller/Pan continuity, and module boundaries. Strict webview
  and real-VS-Code type checks passed.
- Focused Chromium coverage `diagram-controls.spec.ts --retries=0`: 1/1 passed; fullscreen module
  reached 86.81% lines in the instrumented run (96.49% under aggregate unit coverage). The journey
  proves enter/exit, live zoom inside fullscreen, same transform/Pan state, returned origin, and
  unchanged source.
- Final real VS Code `diagram-render-sweep.spec.ts --retries=0`: 1/1 passed (21.9 s test / 23.3 s
  invocation). It proves the same D2 wrapper/bar/controller across inline fullscreen and back,
  cumulative zoom state through an inner SVG rebuild, active full-Preview entry and Escape exit,
  IR/WYSIWYG/Preview lifecycle, and unchanged Markdown/editor state for control operations.
- Visual goldens passed 6/6. `node build.mjs` passed; budgets passed at 551/552 KB, 282/282 eager
  modules, 29.4/34 KB largest module, with lazy-engine ceilings unchanged.
- Full coverage passed 240 files / 3,450 tests (75.07% statements / 67.80% branches / 77.72%
  functions / 76.95% lines); zero-coverage ratchet stayed 15/15. Aggregate lint, brand, jscpd,
  dependency, audit, coverage, and ratchet stages passed; knip retains only the unrelated `yazl`
  baseline. One real assertion was updated after correctly observing cumulative inline+fullscreen
  zoom (1.2544 rather than the old one-step 1.12); the final no-retry run passed.

## Related
- Task **531** (unified front-end control bar, renderer adapters, Pan toggle, zoom/reset) — the direct
  dependency and sole control surface this task extends.
- Task **158** (inline static-SVG zoom/pan) and Task **459** (engine-owned keyboard zoom/reset) — the
  completed interaction foundations consolidated by Task 531.
- `media-src/src/diagrams/diagram-zoom-gate.ts` (Ctrl-to-interact gate for markmap/mindmap — pattern
  reference), `media-src/src/diagrams/custom-diagrams.ts` (diagram wrappers),
  `media-src/src/main.css` (diagram sizing). Memories: [[diagram-fill-width]],
  [[diagram-ctrl-zoom-gate]], [[show-partial-results-for-eval]].
