# Task 410 — A genuinely failed script load silently blanked diagram engines

**Status:** ✅ DONE · **Impact:** 🟡 med (silent failure, not a race — network/CDN outage class) · **Origin:** [Task 407](407-unify-script-loader-addscript-race.md), filed as its explicit follow-up rather than smuggled into that fix

## Problem

Task 407 removed the *race* (a script resolving before it executed). It did not touch the
*already-existing* silent-failure path: `loadScript`'s `s.onerror = () => resolve()` resolves
(not rejects) on a genuine network/CDN failure — by design, so one broken CDN asset can't hang
every caller. Every render function then did `if (!window.X) return`, which was the right guard
for *unavailable*, but left all seven affected language paths without a visible fallback:

- `renderGeojson` / `renderTopojson` (`!window.L` / `!window.topojson` → `return`)
- `renderNomnoml` / `renderStl`
- `renderWavedrom`
- the shared Vega renderer used by both `vega` and `vega-lite`

WaveDrom and Vega did share the gap: their missing-global guards ran before `faithfulRender`, so
the render attempt and its error boundary were never reached.

## Scope

- [x] For each affected engine: on `!window.X`,
      call `renderDiagramError` (or `faithfulRender`'s pattern) instead of `return`ing silently,
      so a load failure produces the same themed error box a render failure already does.
- [x] Keep the distinction honest: a **race** (task 407) is now impossible; this task is about
      a **real, permanent** failure (offline, CDN down, CSP blocking, corrupted CDN response).
- [x] Do not change `loadScript`'s resolve-on-error contract — other callers (D2, PlantUML,
      Graphviz, ELK) may rely on "never rejects."

## Out of scope

- Retry logic. A retry belongs in `loadScript` itself (or its callers) as a separate,
  explicitly-scoped task if wanted — this task is only about making an unrecoverable failure
  visible instead of silent.
- The load-race fix itself — done, task 407.

## Verification

- [x] **Unit** — simulated failed script loads for the shared error helper and every affected
      engine; 40 focused tests pass and the full coverage run passes (1,985 tests).
- [x] **Browser e2e** — aborted all six renderer dependency script paths and asserted themed,
      terminal errors for all seven language paths.
- [x] **Real-VS-Code e2e** per `AGENTS.md` — blocked the dependencies before webview creation and
      asserted non-blank themed errors for all seven paths; the focused spec and the 39-test fast
      tier pass.

## See also

- `media-src/src/diagram-engines/`, `media-src/src/load-script.ts`,
  `media-src/src/diagram-error.ts`.
- [Task 407](407-unify-script-loader-addscript-race.md) (removed the race; this is the
  pre-existing silent-failure gap it surfaced), [151](151-typed-failloud-boundary.md) item 7
  (the faithful-by-construction pattern wavedrom/vega already follow).
