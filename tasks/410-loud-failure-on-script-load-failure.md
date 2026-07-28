# Task 410 — A genuinely failed script load still silently blanks 4 engines

**Status:** 📋 TODO · **Impact:** 🟡 med (silent failure, not a race — network/CDN outage class) · **Origin:** [Task 407](407-unify-script-loader-addscript-race.md), filed as its explicit follow-up rather than smuggled into that fix

## Problem

Task 407 removed the *race* (a script resolving before it executed). It did not touch the
*already-existing* silent-failure path: `loadScript`'s `s.onerror = () => resolve()` resolves
(not rejects) on a genuine network/CDN failure — by design, so one broken CDN asset can't hang
every caller. Every render function then does `if (!window.X) return`, which is the right guard
for *unavailable*, but the four engines below have no fallback beyond that bail:

- `renderGeojson` / `renderTopojson` (`!window.L` / `!window.topojson` → `return`)
- `renderNomnoml` (bail shape TBD — read at implementation time)
- `renderStl` (bail shape TBD)

wavedrom and vega are **already covered**: they render through `faithfulRender`, whose stage
IS the render attempt — a load failure means `window.wavedrom`/`window.vegaEmbed` stay undefined,
`renderWaveForm`/`vegaEmbed` are never called, so nothing reaches `faithfulRender`'s own
try/catch either. Confirm this gap exists at THEIR level too before assuming they're fully
covered — the difference may only be that they fail one layer further in, not that they show a
box.

## Scope

- [ ] For each of the 4 (or more, if wavedrom/vega turn out to share the gap): on `!window.X`,
      call `renderDiagramError` (or `faithfulRender`'s pattern) instead of `return`ing silently,
      so a load failure produces the same themed error box a render failure already does.
- [ ] Keep the distinction honest: a **race** (task 407) is now impossible; this task is about
      a **real, permanent** failure (offline, CDN down, CSP blocking, corrupted CDN response).
- [ ] Do not change `loadScript`'s resolve-on-error contract — other callers (D2, PlantUML,
      Graphviz, ELK) may rely on "never rejects."

## Out of scope

- Retry logic. A retry belongs in `loadScript` itself (or its callers) as a separate,
  explicitly-scoped task if wanted — this task is only about making an unrecoverable failure
  visible instead of silent.
- The load-race fix itself — done, task 407.

## Verification

- [ ] **Unit** — for at least `renderGeojson`, simulate a `window.L` that never gets set (the
      script's `onerror` fires) and assert the block shows `.vmarkd-diagram-error`, not a blank
      innerHTML.
- [ ] **Real-VS-Code e2e** per `AGENTS.md` — a fixture whose CDN reference is deliberately broken
      (or a network-block harness, if one exists) showing the error box for each affected engine.

## See also

- `media-src/src/custom-diagrams.ts` (`renderGeojson`, `renderTopojson`, `renderNomnoml`,
  `renderStl`), `media-src/src/load-script.ts`, `media-src/src/diagram-error.ts`.
- [Task 407](407-unify-script-loader-addscript-race.md) (removed the race; this is the
  pre-existing silent-failure gap it surfaced), [151](151-typed-failloud-boundary.md) item 7
  (the faithful-by-construction pattern wavedrom/vega already follow).
