# Task 347 — PlantUML: multiple diagrams in ONE document flake ("Assumed diagram type: sequence")

> **Status:** 🐛 open bug (from task 136, 2026-07-03). Pre-existing engine limitation (task 178
> territory) that the offline stdlib feature (136) makes very visible — real architecture docs hold
> several C4/AWS/Azure diagrams.

## Symptom
A document with SEVERAL PlantUML diagrams (esp. C4/AWS/Azure icon diagrams) renders MOST of them but a
random one (different each run) fails with a PlantUML **"Syntax Error? (Assumed diagram type:
sequence)"** SVG. Single/isolated diagrams always render fine (136's e2e proves C4, AWS, Azure, and a
synthesized `<awslib/Compute/all>` all render). Reproduce: open `tmp/plantuml-stdlib-demo.md` (5 blocks)
— usually one AWS block errors, non-deterministically.

## Root cause (confirmed)
The vendored TeaVM engine is ONE shared instance with sticky diagram-TYPE detection state. `plantumlRender`
(`media-src/src/plantuml-render.ts`) resets it (fresh cache-busted `import`) ONLY on a class↔non-class
switch (task 178). C4/AWS/Azure diagrams are all NON-class, so the engine is reused across them and its
type state carries over → a later icon diagram mis-detects "sequence". The render loop also does NOT
await each block's completion (TeaVM `render()` exposes no promise; we observe the `<svg>`), so blocks
also RACE on the shared instance → the failing block is non-deterministic.

## What was TRIED (task 136 follow-up) and did NOT fix it
1. **Serialize the loop** — wrap render + the `<svg>` MutationObserver in an awaited Promise so the next
   block starts only after the current one's `<svg>` appears. Made failures deterministic in one run but
   a block still failed → not just a race.
2. **Fresh engine per icon diagram** — reset (re-import) when the current OR previous block used stdlib
   (`needsStdlib`), plus a `prevWasStdlib` guard. STILL flaky. Hypothesis: `?rev=N` re-import gives fresh
   MODULE statics but the TeaVM type-detection state likely lives on a SHARED `window`/`global` the
   re-import doesn't clear — so a real reset needs a different lever.
Both were reverted (didn't work + added ~7 MB re-import cost + touch tuned task-178 code).

## Next levers to investigate
- Find WHERE the sticky type state lives (window/global vs module) — grep the TeaVM bundle; if global,
  clear/re-init it between renders instead of re-importing.
- A dedicated iframe/worker per render (full isolation) — heavy but bulletproof.
- Force the diagram type explicitly (prepend a type hint) so detection can't drift — needs per-source
  type inference.
- Ask upstream PlantUML/TeaVM whether the JS build has a reset/`clear` entry point.

## Acceptance
`tmp/plantuml-stdlib-demo.md` (and a committed multi-diagram fixture) render EVERY block with no
"Assumed diagram type" / "Fatal parsing error", deterministically across repeated runs. Add the
`plantuml-stdlib-multi.md` fixture + e2e that were drafted in 136 (removed when the fix was reverted).

## Related
Task 136 (offline stdlib — surfaced this), 178 (the original class↔non-class stickiness fix — its
assumption "only class↔non-class poisons" is incomplete), 87 (TeaVM engine). File:
`media-src/src/plantuml-render.ts` (the reset logic + the render loop).
