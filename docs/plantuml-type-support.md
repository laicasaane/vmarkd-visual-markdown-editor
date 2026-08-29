# PlantUML diagram-type support matrix (offline)

**Engine:** vendored TeaVM `plantuml.js` — **js-plantuml `1.2026.6`** (MIT, `plantuml/plantuml`), the
same black-box build we ship for all offline PlantUML rendering (task 87). This build is a **subset** of
full PlantUML: diagram subsystems that pull heavy extra dependencies (raster ditaa, JLaTeXMath/AsciiMath,
the salt widget toolkit, most of the blockdiag family) are **not compiled in**.

**Why this doc exists (task 137):** we shipped the engine without knowing which diagram types actually
render offline vs. which silently fail. This matrix is the answer, measured by rendering one minimal
example of every type **through the actual vendored engine in the real VS Code webview**, each via a
fresh cache-busted engine import so the sticky diagram-type state (task 347) can't confound a verdict.

> The matrix is **engine-version-specific.** When `media-src/vendor/plantuml/source.json` bumps, re-run
> the regression test (`test/vscode-e2e/plantuml-type-support.spec.ts`) — it fails loudly if a supported
> type regresses or a previously-unsupported type starts working, so this table stays honest.

## Supported ✅ (21 types render a real diagram offline)

| Family | Type | Directive | Notes |
|---|---|---|---|
| Interaction | Sequence | `@startuml` | |
| Behaviour | Use-case | `@startuml` (`actor`, `(…)`) | |
| Structure | Class | `@startuml` (`class`/`interface`/…) | Uses Viz.js (dot) for layout — needs `viz-global.js` loaded first (it is). |
| Structure | Object | `@startuml` (`object`) | |
| Structure | Component | `@startuml` (`[…]`) | Viz.js layout. |
| Structure | Deployment | `@startuml` (`node`/`database`/…) | Viz.js layout. |
| Structure | Entity (UML) | `@startuml` (`entity`) | The UML-style entity (class engine), **not** Chen ER (see below). |
| Behaviour | Activity (legacy) | `@startuml` (`(*)` syntax) | |
| Behaviour | Activity (beta) | `@startuml` (`start`/`stop`/`:…;`) | |
| Behaviour | State | `@startuml` (`[*]`/states) | |
| Behaviour | Timing | `@startuml` (`robust`/`concise`) | |
| Project | Gantt | `@startgantt` | |
| Project | MindMap | `@startmindmap` | |
| Project | WBS | `@startwbs` | |
| Data | JSON | `@startjson` | |
| Data | YAML | `@startyaml` | |
| Architecture | ArchiMate | `@startuml` (`archimate`) | Basic elements render; **icons** need the ArchiMate sprite stdlib (not vendored — see task 136 scope). |
| Notation | Regex (railroad) | `@startregex` | |
| Notation | EBNF (railroad) | `@startebnf` | |
| Network | nwdiag | `@startnwdiag` | **Dedicated directive only.** `@startuml`+`nwdiag { … }` errors ("use @startnwdiag instead"). |
| Network | packetdiag | `@startpacketdiag` | The one other blockdiag-family type compiled in (the rest are not — see below). |

C4 / AWS / Azure icon diagrams (`!include <C4/…>` etc.) also render offline — via the vendored stdlib
maps (**task 136**), a separate mechanism from the engine's built-in types above.

## Not supported ❌ (5 types + most of the blockdiag family)

| Type | Directive(s) tried | Failure signature |
|---|---|---|
| Chen ER | `@startchen` | *"Diagram not supported by this release … `@startchen` is not recognized."* |
| Salt (UI mockups) | `@startsalt` **and** `@startuml`+`salt` | `@startsalt` not recognized; the in-`@startuml` `salt` widget → syntax error. Neither form works. |
| ditaa | `@startditaa` | *"… `@startditaa` is not recognized."* (needs the ditaa raster lib.) |
| Math (AsciiMath) | `@startmath` | *"… `@startmath` is not recognized."* (needs JLaTeXMath/AsciiMath.) |
| LaTeX | `@startlatex` | *"… `@startlatex` is not recognized."* (needs JLaTeXMath.) |
| blockdiag family | `@startblockdiag` / `@startseqdiag` / `@startactdiag` / `@startrackdiag` | Each *"is not recognized."* Only the two siblings **nwdiag** + **packetdiag** are compiled in (see Supported). |

(`@startsudoku` is likewise unrecognized — noted as a data point, not a diagram type anyone needs.)

**Two failure shapes, both loud:** the engine already renders its **own** error `<svg>` for every
unsupported type — either *"Diagram not supported by this release of PlantUML"* (unknown `@start…`
directive) or a *"Syntax Error"* card (recognised `@startuml`, unknown inner keyword). Nothing fails
silently. Our `renderDiagramError` raw-source fallback only fires on a hard engine/infra throw
(none of these throw).

## Decision (per task 137 gates)

- **Accept + document** the FAILs. ditaa / math / latex / salt each require heavy extra subsystems the
  TeaVM build deliberately omits; Chen ER + the missing blockdiag types are directives this build simply
  doesn't carry. Pursuing any of them means a different/larger engine build — out of proportion to demand,
  and against the "small offline bundle" goal. The current loud error SVG is an acceptable, faithful signal.
- **Optional type-aware note — declined (2026-07-04):** replacing the raw engine error with a
  VMDE-branded "this PlantUML type isn't available offline" note was considered and declined — the
  engine's own card already names the unrecognised `@start…` directive, so the branded note buys little.

## Reproduce

`test/vscode-e2e/plantuml-type-support.spec.ts` locks the matrix: it renders a representative supported
set (asserting real geometry, no error text) and the unsupported set (asserting the "not
supported"/syntax-error signal) through the real engine, each in an isolated fresh-import so the run is
deterministic (task 347). Run it with:

```bash
node build.mjs
xvfb-run -a npm --prefix test/vscode-e2e test -- plantuml-type-support.spec.ts
```

## Related

Task 87 (offline engine), 136 (C4/AWS/Azure stdlib — icon diagrams, a coverage subcase), 144 (engine
pin + render module), 347 (multi-diagram engine type-stickiness — why this matrix is measured in
isolation). Engine + version: `media-src/vendor/plantuml/` (`source.json`).
