# Task 440 — Theme flip double-renders PlantUML → ~57s spinner-then-blank

**Status:** 🟢 DONE (2026-07-30) — option A (kill the double-fire) implemented, measured, RED/GREEN
real-VS-Code net. Option B (avoid the live re-render entirely) noted below, not done. · **Impact:**
🔴 high on PlantUML-heavy docs — a theme switch left every diagram spinning then blank for the better
part of a minute · **Origin:** user report ("switching the theme, the spinner just spins and spins,
then empty"), reproduced on `tmp/all-diagrams-demo.md` (13 PlantUML blocks, mostly `!include <...>`
stdlib: C4/aws/azure/k8s/eip/edgy/DomainStory/cloudogu/cloudinsight/k8s-sprites).

## Symptom → measured cause

Reported as "PlantUML doesn't re-render on a theme switch — spinner, then empty". Measured (a real-VS-
Code timing probe on the 13-block doc): **not empty-forever — a ~57s serial re-render**, during which
each block shows the "Rendering PlantUML…" placeholder, clears, and sits BLANK for tens of seconds
before the SVG lands. A user who switches away or reloads before ~57s sees permanent blanks.

The cost was **two compounding problems**, both quantified with a temporary `__vmarkdPumlRethemeStats`
counter (kept, same posture as task 411's `__vmarkdD2RenderStats`):

1. **Double-fire.** `reThemeMono` re-themes via `reThemeOnForegroundChange` — a foreground poll that
   re-renders "whenever the colour changes, the last one wins". A theme flip crosses MORE THAN ONE
   foreground value during the content-theme settle (the `vditor--dark` class flips first, the content
   `<link>` lands later), so the poll fired `reRenderPlantuml` **twice**: `calls:2`,
   `panesReRendered:26` for 13 blocks. Cheap for the light mono SVGs the poll was written for; brutal
   for PlantUML.
2. **The second pass thrashes the engine.** Each re-render clears + re-runs every block, and PlantUML
   re-preprocesses its ~2000-line stdlib per block (task's "C4 ~2s render" note). The second pass
   clearing blocks WHILE the first pass is mid-render turned a linear cost super-linear: ~57s, far
   more than 2×.

Verified it was NOT a correctness bug: the colour DID re-theme (`#3b3b3b` light → `#cccccc` dark) — it
was purely the cost. (An earlier read of `innerLen` as "unchanged → never re-rendered" was wrong: the
two colour hexes are the same length; corrected by measuring the fill directly.)

## Fix (option A — done)

Debounce the foreground poll to the **settled** colour instead of firing on every intermediate value
(`reThemeOnForegroundChange` in `diagram-retheme.ts`): each new foreground value restarts a 250ms
settle timer; the re-render runs once the colour holds steady. A last-tick fallback guarantees the
settled colour is drawn even when a timing quirk means it never held steady for a full 250ms within the
poll window (without it the debounce could, rarely, never fire → stale colours). A genuine late second
settle still re-fires, so correctness is unchanged.

**Result: `calls:2`→`calls:1`, `panesReRendered:26`→`13`, and the 13-block flip drops from ~57s to
~5s.** The fix is in the shared poll, so flowchart.js and vega-embed (the other
`reThemeOnForegroundChange` users) also stop paying for intermediate re-renders — a bonus, not the
point.

## Verified

- Real VS Code `plantuml-theme-flip.spec.ts` (new fixture `plantuml-theme-flip.md`, 3 blocks): after a
  workbench light→dark flip, every block re-renders in the dark colour and `reRenderPlantuml` fired
  **exactly once** (`calls:1`, `panesReRendered:3`). RED-checked: reverting the debounce makes it
  `calls:2 panesReRendered:6` and the spec fails. 3/3 green with the fix.
- Unit: the existing `diagram-retheme` / `plantuml-retheme` suites stay green (115 tests).

## Option B — not done (avoid the live re-render entirely)

Even single-fire, ~5s for 13 stdlib blocks is noticeable. The deeper fix is to NOT re-run the engine on
a flip:

- **B1 — repaint in place:** rewrite the rendered SVG's palette (the injected `<style>` / baked fills)
  to the new theme without re-running TeaVM. Near-instant; needs the pairing colours to be
  rewritable on the existing SVG.
- **B2 — per-theme cache:** wire PlantUML into the cache-first re-theme (task 436) so a flip BACK to a
  seen theme is instant; a first flip to a new theme still pays the full render.

Left as a follow-up — A already turns "spins for a minute" into "a few seconds".

## See also

- `media-src/src/diagram-retheme.ts` (`reThemeOnForegroundChange`, `reThemeMono`),
  `media-src/src/plantuml-retheme.ts` (`reRenderPlantuml` + the stats counter).
- [411](411-d2-geo-retheme-double-fire-and-cache-bypass.md) (the same double-fire class for d2/geo, a
  different code path), [436](436-retheme-cache-first-routing.md) (the cache-first re-theme B2 would
  extend to PlantUML), the "PlantUML C4 ~2s render" investigation (the per-block stdlib cost).
