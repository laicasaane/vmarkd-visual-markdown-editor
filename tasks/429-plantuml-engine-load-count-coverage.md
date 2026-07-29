# Task 429 — Engine-load-count coverage across the diagram-type matrix (isClassSource misread audit)

**Status:** planned — test coverage, may or may not surface a defect · **Impact:** 🟡 med (a misread costs ~550 ms of engine re-import per event; **no such event is currently demonstrated**) · **Origin:** Codex PlantUML perf investigation (2026-07-28), ranked opportunity #5 + next step #3

> ⚠️ **Hypothesis only — this is not a known bug.** Task 350's dual-engine design already holds on the
> path we test. This task buys *evidence*, not a guaranteed win: it widens the assertion so that IF an
> exotic diagram family trips the safety net, we find out from a test instead of from a user's stutter.
> A perfectly plausible outcome is "all families stay at 2 loads, close it as verified".

## Problem

`loadPlantumlEngine` keeps two long-lived TeaVM instances — `class` and `nonClass`
(`plantuml-render.ts:714-741`) — because a warmed instance is sticky to the first diagram family it
renders (task 350, root cause `PSystemBuilder2.lastFactory`, see task
[352](352-plantuml-render-cost-rebuild-cache.md) §Related). Routing is decided by the cheap textual probe
`isClassSource` (`plantuml-render.ts:751-764`).

That probe can misread. The code says so and ships a safety net: `renderedIsClass`
(`plantuml-render.ts:772-779`) inspects the produced SVG for the circled type icon, and on disagreement
**discards the engine instance** — `engines[engineKind] = null` (`plantuml-render.ts:926-930`) — so the
next render re-imports a fresh module (`engineRev` cache-bust). Task 139 measured engine
parse/evaluation at **530–775 ms**, so each discard is roughly half a second of pure re-import.

The instrumentation to detect this already exists: `window.__vmarkdPumlEngineLoads`
(`plantuml-render.ts:738-739`) counts module instantiations. But the only spec that reads it —
`test/vscode-e2e/plantuml-typeswitch.spec.ts` — is a **single test** covering **class ↔ non-class**
switching (its non-class side is sequence). So today we assert "≤2 loads" for exactly one traversal of
the matrix. Activity, component, state, object, and C4 sources never exercise the counter, even though
task 137 established a much wider type-coverage matrix and `isClassSource`'s own comment calls out
"exotic arrow forms" as the misread risk.

`isClassSource` is pure and unit-tested, but a unit test proves the probe's verdict — not that the
verdict *matches what the engine actually drew*. Only the rendered-output comparison does that, and it
only runs in a real webview.

## Scope

- [ ] Extend `plantuml-typeswitch.spec.ts` (or add a sibling spec) to walk a representative
      diagram-family matrix in ONE document — class, object, sequence, activity (both `:...;` and the
      legacy form), component, state, usecase, and C4 — asserting `__vmarkdPumlEngineLoads` stays ≤ 2
      after every block has rendered.
- [ ] Assert per-block that the rendered family matches the routed one (reuse `renderedIsClass`'s
      circled-icon marker for the class side rather than re-inventing a detector), so a silent
      misread-then-recover is visible as a test signal, not just a load count.
- [ ] Only if the matrix demonstrates a real misread: tighten `isClassSource` for that specific syntax
      form, with a unit test pinning the exact source that tripped it. **Do not** pre-emptively rewrite
      the probe — it is deliberately cheap and only has to flip when the category flips.
- [ ] Record the outcome in this file either way (families verified clean, or the form that misread).

## Out of scope

- The ~2 s C4 per-render cost — that is engine preprocessing, investigated and declined in task
  [352](352-plantuml-render-cost-rebuild-cache.md). A load-count win is unrelated and much smaller.
- Removing the `renderedIsClass` safety net. It stays regardless: it is what makes a misread a brief
  lag instead of a stuck wrong diagram.
- Multi-diagram-per-fence handling (task 140) and stdlib routing (task 136).

## Verification

- [ ] Real-VS-Code e2e (webview-affecting, per AGENTS.md) — the matrix spec above, run isolated with
      `xvfb-run -a npm --prefix test/vscode-e2e test -- plantuml-typeswitch.spec.ts`.
- [ ] RED-check the assertion: temporarily force `isClassSource` to return a wrong verdict for one
      family and confirm the spec fails, so a passing run means something.
- [ ] Unit tests for any `isClassSource` change, including the previously-passing forms (no regression
      on the arrow-form cases already pinned).

## Related

Tasks [350](350-plantuml-dual-engine-typeswitch.md) (dual engine), [347](347-plantuml-multiblock-engine-stickiness.md)
(stickiness + serialized queue), [139](139-plantuml-perf-loading.md) (the 530–775 ms import measurement),
[137](137-plantuml-diagram-type-coverage.md) (the type matrix this borrows from),
[430](430-plantuml-phase-resolved-render-timing.md) (would make a discard visible as a timing phase).
