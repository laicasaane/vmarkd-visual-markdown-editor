# 491 — a D2 leg of the theme-flip specs is flaky under full-suite load

**Status:** 🔴 OPEN — two sightings, two different specs, one shared shape. Not diagnosed. Opened
2026-08-01 after the full real-VS-Code suite; the two data points below are ALL that is known, and
neither has a mechanism behind it yet.

## The two sightings (same day, same machine, two full-suite runs)

| run | spec | failure | on retry | solo |
|---|---|---|---|---|
| before the 456/490 fixes | `retheme-preview-surface.spec.ts` | `d2 redrew after the flip` → `TIMED OUT` | passed | — |
| after them (252/1/1/2, 43.6 min) | `diagram-retheme-viewport-gate.spec.ts` | `D2 block 1 re-themed` (retry 1), `D2 block 0` (retry 2) | failed both retries | **2/2 green**, 26 s each |

Shared shape: **the D2 leg of a theme-flip assertion**. Every other engine in the same specs
(mermaid, echarts, plantuml, wavedrom, geo) passed in both runs. The instability MOVED between
sibling specs rather than disappearing — the first one is green in the run where the second is red.

The block index also moved between retries of the same run (block 1, then block 0), which is the
signature of a timing/ordering flake rather than one wrong block.

## Not this task's cause — already checked, do not repeat

- **Not a too-short poll budget.** Raising `retheme-preview-surface`'s per-language d2 budget to
  120 s (and the test ceiling to 240 s) still produced `TIMED OUT`. The change was REVERTED rather
  than left in place justified by a disproven mechanism. Do not re-raise timeouts as a first move.
- **Not the 456/490 fixes.** They land in `escape-toolbar.ts` and `focus-restore.ts` — caret and
  focus. The re-theme path (`diagram-retheme.ts` + its `IntersectionObserver`) touches neither, the
  focus-restore change only makes that module do LESS on `focusout`, and the escape retry loop only
  runs after an Escape+Tab (and cancels on any keydown/pointerdown), which these specs never send.
  Stated as an argument from mechanism, NOT as a measurement: `diagram-retheme-viewport-gate` WAS
  green in the previous full run, so there is exactly one observation per run either way.

## Where to look first

Task 412's viewport gate defers a diagram's re-render when it sits more than ~200 px outside the
window, queueing it on a shared `IntersectionObserver`. A spec that reads a post-flip value without
scrolling its target in gets the STALE pre-flip render, silently — no error, no timeout. Both specs
DO scroll (that is the whole subject of `diagram-retheme-viewport-gate`), so the question is not
"do they scroll" but whether the observer keeps up under load: the known rule is to scroll targets
ONE AT A TIME with a short pause, because a bulk pass moves the viewport past earlier elements
before the observer fires for them. Under full-suite contention the same starvation could hit a
per-element loop that is fast enough on an idle machine.

That is a hypothesis. It has not been tested.

## How to reproduce

Only under full-suite load so far — **solo runs are green** (2/2 measured). So a repro attempt needs
either the full suite (~44 min) or an artificial load that reproduces the contention. Do not
conclude anything from a solo pass; that is the one result already known to be uninformative.

## Do not

- Do not raise timeouts (tried, disproven, reverted — see above).
- Do not mark it fixed on a green solo run, or on a single green full suite: this flake skipped a
  whole run before reappearing in a sibling spec.
