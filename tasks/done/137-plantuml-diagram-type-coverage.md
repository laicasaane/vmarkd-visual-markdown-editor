# Task 137 — PlantUML diagram-type coverage (verify what the TeaVM build supports)

> **Status:** ✅ DONE (2026-07-04) — matrix measured through the real engine, committed as a doc +
> a deterministic real-VS-Code regression test. The optional stretch (a vMarkd-branded type-aware note
> for unsupported types) was surfaced and **declined** by the user — the engine's own loud error card
> stays. Created 2026-06-24; builds on task 87.

## Outcome (2026-07-04)

**Matrix:** `docs/plantuml-type-support.md` (engine = js-plantuml **1.2026.6**). Measured by rendering one
minimal example of every type through the ACTUAL vendored engine in the real VS Code webview, each via a
fresh cache-busted import so the sticky diagram-type state (task 347) couldn't confound the verdict.

- **Supported ✅ (21):** sequence, use-case, class, object, activity (legacy + beta), component,
  deployment, state, timing, entity (UML), gantt, mindmap, wbs, json, yaml, archimate (basic; icons need
  the sprite stdlib), regex, ebnf, **nwdiag**, **packetdiag**.
- **Not supported ❌ (5 + most of blockdiag family):** Chen ER (`@startchen`), salt (both forms), ditaa,
  math (AsciiMath), latex, and `blockdiag`/`seqdiag`/`actdiag`/`rackdiag`. Each renders the engine's own
  loud *"not supported by this release / is not recognized"* (or Syntax Error) `<svg>` — nothing silent.
- **Key nuance:** nwdiag + packetdiag work **only via their dedicated `@start<type>` directive**;
  `@startuml`+`nwdiag { … }` errors ("use @startnwdiag instead"). The rest of the blockdiag family isn't
  compiled in at all.

**Regression test:** `test/vscode-e2e/plantuml-type-support.spec.ts` — asserts a representative supported
set renders real geometry + its label (no error card) and the unsupported set renders the loud error
card, deterministically (isolated fresh-import per type). Passes headless (`xvfb-run`). Gates green
(typecheck, `lint:ci`).

**Decision (gates):** accept + document all FAILs (heavy extra subsystems / directives this build omits;
a larger engine is out of proportion to demand). The loud error SVG is the accepted fallback.
**Optional type-aware note — declined (2026-07-04):** user chose to keep the engine's own error card
(already loud + faithful); no vMarkd-branded note added.

## Problem
PlantUML supports many diagram types: sequence, class, usecase, activity (legacy + beta), component,
state, object, deployment, timing, ER, **gantt**, **mindmap/wbs**, **json/yaml**, **salt** (UI
mockups), **ditaa**, **nwdiag/network**, **AsciiMath/JLaTeXMath** (math), etc. The TeaVM
(`plantuml.js`) build may not include all of them (some pull extra deps — ditaa, math, salt). We ship
it as a black box and haven't mapped what works vs what silently fails to a compile error.

## Goal
Produce a **support matrix**: render one minimal example of each diagram type through our actual engine
(`media/vditor/dist/js/plantuml/plantuml.js`) and record PASS / FAIL / partial. Turn the result into:
- a short doc/table (which types work offline),
- a decision on the FAILs (accept + document, or pursue),
- (optionally) clearer messaging when an unsupported type is used.

## Approach
- Throwaway harness (like `tmp/d2-compare`) or a real-VS-Code spec that feeds each ` ```plantuml `
  type and checks for an `<svg>` vs an error.
- Cover at least: sequence, class, usecase, activity-beta, component, state, object, deployment, ER,
  gantt, mindmap, wbs, json, yaml, salt, ditaa, nwdiag, timing, math.
- Note which need stdlib/sprites (overlaps task 136 — C4 etc.).

## Decision gates
- For each FAIL: is it worth pursuing (likely no for ditaa/math/salt; maybe yes for gantt/mindmap)?
  Default = document as unsupported + keep the loud raw-source fallback.

## Acceptance / tests
- A committed support matrix (doc) + a small real-VS-Code test asserting the core types render an SVG.
- Unsupported types fall back to raw source loudly (faithful-by-construction), ideally with a type-aware
  note.

## Related
Task 87 (engine), 136 (stdlib/C4 — a coverage subcase). Engine at `media-src/vendor/plantuml/`.
