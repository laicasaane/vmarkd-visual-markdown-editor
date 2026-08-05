# Task 429 — Engine-load-count coverage across the diagram-type matrix (isClassSource misread audit)

**Status:** done — a real misread WAS found and fixed (`object` keyword) · **Impact:** 🟡 med (a misread costs ~500 ms of engine re-import per event — **now demonstrated**, see Finding below) · **Origin:** Codex PlantUML perf investigation (2026-07-28), ranked opportunity #5 + next step #3

> ⚠️ **Started as a hypothesis, did NOT stay one.** The framing below (written before the audit ran) is
> kept for context, but the audit found a real, demonstrated misread — `object` diagrams were missing
> from `isClassSource`'s keyword list, and it wasn't just a load-count miss: it silently corrupted the
> NEXT sequence/activity/etc. diagram rendered on the shared engine instance. See **Finding** below.

## Problem

`loadPlantumlEngine` keeps two long-lived TeaVM instances — `class` and `nonClass`
(`plantuml-render.ts:714-741`) — because a warmed instance is sticky to the first diagram family it
renders (task 350, root cause `PSystemBuilder2.lastFactory`, see task
[352](../parked/352-plantuml-render-cost-rebuild-cache.md) §Related). Routing is decided by the cheap textual probe
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

- [x] Add a sibling spec (`test/vscode-e2e/plantuml-family-matrix.spec.ts` — `plantuml-typeswitch.spec.ts`
      is owned by another agent, so extended via a sibling per the task's own alternative) walking class,
      object, sequence, activity (both `:...;` and the legacy form), component, state, usecase, and C4 in
      ONE document (`fixtures/plantuml-family-matrix.md`), asserting `__vmarkdPumlEngineLoads` stays ≤ 2
      after every block has rendered.
- [x] Assert per-block that the rendered family matches the routed one, reusing the exact circled-icon
      detector `plantuml-typeswitch.spec.ts` already uses (`/^[CIEA]$/` over every `<text>`), rather than
      inventing a second one.
- [x] **A real misread WAS demonstrated** — tightened `isClassSource` for that specific form, with unit
      tests pinning the exact source (`plantuml-render.test.ts`, "object-diagram syntax IS class"). See
      Finding below.
- [x] Outcome recorded below.

## Finding — `object` was missing from `isClassSource`'s keyword list, and it's not just a load-count miss

Not a "families stay at 2 loads, close it as verified" outcome. `isClassSource`'s keyword regex covered
`class|interface|enum|annotation` but not `object` — and PlantUML's object-diagram syntax shares the
class-diagram grammar/factory internally (this is why task 178/350's dual-engine split exists at all:
render() leaks diagram-TYPE state across a single module instance). Routing `object` to the `nonClass`
engine therefore primes that instance the way a class diagram would.

**Measured in the real webview** (not hypothesised): a plain sequence diagram (`Alice -> Bob: hello`)
rendered right after an `object` diagram on the shared `nonClass` engine instance drew a spurious circled
`"C"` `<text>` per participant AND collapsed each participant name from two `<text>` nodes to one — a
real rendering defect, not merely a wasted re-import. Isolated with a 3-block probe (`seq → object → seq`,
cross-checked against `seq → object` alone and the 9-block family matrix) before touching product code, to
rule out label-content coincidence.

The `object` diagram itself never trips `renderedIsClass`'s safety net (it draws no circled type icon of
its own), so the safety net sees no disagreement on the `object` block and never discards — the poisoning
is invisible until the NEXT diagram on that instance. That's exactly the "silent misread-then-recover
hiding behind a load count that still looks right" case this task's scope called out: **before the fix,
`__vmarkdPumlEngineLoads` for a 3-block `seq → object → seq` document was still ≤ 2** (both non-class
blocks share the poisoned instance, no reset ever fires) while the third block rendered visibly wrong.

**Fix**: added `object` to `isClassSource`'s keyword regex (`plantuml-render.ts`). Object diagrams now
route to the `class` engine instance alongside real class diagrams — where they belong, per PlantUML's own
architecture — instead of poisoning the `nonClass` instance used for sequence/activity/state/etc.
RED-checked: reverting the fix and re-running the family-matrix spec reproduces the failure (`sequence`
block shows the circled icon) on every retry; reapplying the fix turns it green again.

**Composition after the fix**: the 9-block family matrix is 2 class-family diagrams (class + object) + 7
non-class, still exactly 2 engine loads — `isClassSource` routes CATEGORY, not diagram TYPE, so the count
staying at 2 was never in question; what changed is which category `object` lands in.

## Secondary finding — `renderedIsClass`'s OWN false-positive mode (not an `isClassSource` misread)

A second, smaller issue surfaced from the same audit, worth recording separately since it's a different
mechanism: `renderedIsClass`'s heuristic is `/^[CIEA]$/` over EVERY `<text>` in the rendered SVG, with no
structural check that a match is actually the circled type icon. PlantUML lays out a multi-word label as
one `<text>` element PER WORD (verified: `Person(user, "User", "A person")` renders `"Web"`/`" "`/`"App"`-
style per-word nodes) — so a label containing the bare word "A" (the English article), or a stray "C"/"I"/
"E", trips the safety net on a diagram `isClassSource` routed CORRECTLY. Pinned as a regression case in
`plantuml-family-matrix.spec.ts`'s second test (`fixtures/plantuml-word-boundary-misread.md`): a C4 block
with `Person(user, "User", "A person")` gets `engineDiscarded: true` even though both blocks in that
fixture are genuinely `nonClass`, and the FOLLOWING non-class block pays a real ~500ms re-import
(`engineImport` measured 425–500ms across runs) for a doc with zero class diagrams.

This is `renderedIsClass`'s own blind spot, not `isClassSource`'s — the probe read both sources correctly
in that fixture. Per this task's explicit scope, the fix instruction ("tighten `isClassSource` for that
specific syntax form") doesn't cover it, and removing/narrowing the safety net is explicitly out of scope
regardless (it's what turns a misread into a brief lag instead of a stuck wrong diagram — see the `object`
finding above, where it's the ONLY reason the wrong-looking sequence diagram didn't stay wrong forever).
Left as-is, documented and pinned with a test rather than patched — a candidate follow-up would tighten
`renderedIsClass` to require the icon sit in a structural position (e.g. paired with a type-marker circle
element) rather than matching any bare single-letter text anywhere in the SVG, but that's new scope beyond
what this task asked for.

## Finding 3 (adversarial review) — `isClassSource`'s own keyword fix had two more false-positive shapes, CONFIRMED to poison the same direction

A follow-up adversarial review found the `object`-keyword regex added for Finding 1 was itself too broad
— line-anchored with no PlantUML context, so it fired on:

1. **Prose inside a free-text block body.** `note right\nobject model overview\nend note` — the note
   BODY's first word happens to be "object", and a bare per-line regex cannot tell prose from a
   declaration.
2. **A bare keyword used as an unquoted message participant.** `object -> Bob: test` — a valid (if odd)
   sequence diagram, not a class declaration.

Two controls confirmed these were specifically about the keyword being the LINE-START token, not about
the word "object" appearing anywhere: `participant "object" as O` and `Container(object, "abc", "def")`
(a C4 macro argument) never misfired, before or after this fix.

**The review's central question — does a false positive in this OTHER direction (non-class content
routed to the `class` engine) also poison the shared instance, the same as Finding 1's `object` case, or
is `PSystemBuilder2.lastFactory`'s leak one-directional?** Established with a direct repro BEFORE writing
the fix, not assumed: `class Foo/Bar → [note-body-"object"-misread sequence] → class Baz/Qux → [bare-
"object"-participant-misread sequence] → control sequence`, all five blocks in one document. With the
pre-fix regex, BOTH misrouted sequence blocks rendered corrupted — spurious circled `"C"` per participant,
names collapsed from two `<text>` nodes to one — the identical symptom to Finding 1's `object`-diagram
case. **Confirmed symmetric: the leak poisons in both directions, not just non-class→nonClass-engine.** A
real class diagram rendered right after a misrouted block (block 2, Baz/Qux) was NOT itself corrupted, so
the damage doesn't cascade indefinitely — it lands on whichever diagram next shares the poisoned instance,
same shape as Finding 1.

**Fix**: `stripPlantumlFreeText` (new, exported, unit-tested) strips `note`/`legend`/`title`/`header`/
`footer` block bodies — multi-line `... end <keyword>` forms and single-line forms — before the keyword
scan runs. Generic by construction (no per-keyword special-casing), so a note starting with "class" or
"enum" is covered by the same pass as "object". Separately, the keyword regex now requires a DECLARATION
target after the keyword (`/(?:class|interface|…|object)\s+["A-Za-z_]/`, not just `\b`), which excludes
`object -> Bob: test` (next char `-`) while still matching `object Session1` (next char `S`).

**Verified with the same before/after method as Finding 1**: re-ran the exact repro above with the fix
applied — both previously-corrupted blocks now render correctly (proper duplicated participant `<text>`
nodes, no spurious icon, original message text intact). RED-checked the new permanent regression test
(reverted the fix, `sequence does not carry a class icon` failed on all 3 retries; reapplied, green).

**Now a permanent regression net**, not just an ad-hoc probe: `fixtures/plantuml-free-text-misread.md` +
a 3rd test in `plantuml-family-matrix.spec.ts` (`a keyword in a note/legend/title body, or as a bare
message participant, does not misroute or poison the class engine`).

Unit tests pin all four reported shapes plus both controls (`plantuml-render.test.ts`): note-body
`object`, legend-body `class`, single-line `title object overview`, bare `object ->`/`class ->`
participants, quoted `participant "object" as O`, and the C4 macro-argument case.

## Out of scope

- The ~2 s C4 per-render cost — that is engine preprocessing, investigated and declined in task
  [352](../parked/352-plantuml-render-cost-rebuild-cache.md). A load-count win is unrelated and much smaller.
- Removing the `renderedIsClass` safety net. It stays regardless: it is what makes a misread a brief
  lag instead of a stuck wrong diagram.
- Multi-diagram-per-fence handling (task 140) and stdlib routing (task 136).

## Verification

- [x] Real-VS-Code e2e (webview-affecting, per AGENTS.md) — the matrix spec, run isolated with
      `xvfb-run -a npm --prefix test/vscode-e2e test -- plantuml-family-matrix.spec.ts` (2 tests, both
      green). Regression-checked against `plantuml-typeswitch.spec.ts` (still green, unedited).
- [x] RED-check: reverted `object` from `isClassSource`'s keyword regex and re-ran the family-matrix
      spec — `sequence does not carry a class icon` failed on all 3 retries, confirming the assertion is
      meaningful. Reapplied the fix, spec green again.
- [x] Unit tests for the `isClassSource` change (`plantuml-render.test.ts`, "object-diagram syntax IS
      class"), plus the full existing suite re-run clean (217 tests in that file, no regression on the
      previously-pinned arrow-form cases).
- [x] Finding 3 (adversarial review): real-VS-Code e2e for the free-text/bare-participant fix
      (`plantuml-family-matrix.spec.ts`'s 3rd test), RED-checked the same way, unit tests for all 4
      reported shapes + 2 controls, and the poisoning-direction question answered with a direct
      before/after repro rather than assumed — see Finding 3 above. Full plantuml unit-test group
      (render + timing + stdlib + retheme) re-run clean: 123/123.

## Related

Tasks [350](350-plantuml-dual-engine-typeswitch.md) (dual engine), [347](347-plantuml-multiblock-engine-stickiness.md)
(stickiness + serialized queue), [139](../parked/139-plantuml-perf-loading.md) (the 530–775 ms import measurement),
[137](137-plantuml-diagram-type-coverage.md) (the type matrix this borrows from),
[430](430-plantuml-phase-resolved-render-timing.md) (would make a discard visible as a timing phase).
