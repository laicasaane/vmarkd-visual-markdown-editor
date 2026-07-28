# Task 401 — Set an explicit "fork Vditor now" trigger in ADR-0004

**Status:** planned — decision/documentation · **Impact:** 🟡 med (structural fragility, currently open-ended) · **Origin:** Fable architecture review (2026-07-27)

## Problem

ADR-0004 (`docs/adr/0004-patching-vditor.md`) names forking Vditor as "the accepted
long-term backstop... **until the anchor-asserted patches become unmanageable**," but
sets no concrete trigger for when that crossover happens. Today there are 29
anchor-asserted TS patches (`VDITOR_TS_PATCHES` in `media-src/esbuild-shared.mjs`, ~1960
lines) plus multiple CSS source-patches (`build.mjs`: `varifyVditorPalette`,
`patchVditorIndexCss`, and others as they're added). The anchor-assert mechanism is good
engineering — it turns a Vditor version bump into a loud build failure instead of a
silent no-op — but the patch count only grows, and every patch raises the cost of
absorbing an upstream Vditor security fix or feature release. Without a stated
trigger, the original 2026-06-14 "patch, don't fork" call risks being treated as
evergreen by default rather than being periodically re-examined on its own terms.

## Scope

- [ ] Decide on a concrete, checkable trigger condition (or small set of them) for
      "fork Vditor now" — candidates to evaluate, not prescriptions:
  - a patch-count threshold (e.g. "N anchor-asserted TS patches" or "N CSS
    source-patches"),
  - a maintenance-cost signal (e.g. "the last Vditor version bump required touching ≥X
    patches to re-anchor," or "took more than Y hours"),
  - a calendar cadence (e.g. "re-ask this question every 6 months regardless").
- [ ] Record the chosen trigger(s) as an amendment to ADR-0004 (in-place dated
      amendment, per this project's existing ADR practice — see ADR-0006's amendment
      style — not a superseding document).
- [ ] Note the current baseline (29 TS patches + N CSS patches as of 2026-07-27) in the
      amendment so future re-reads have a concrete comparison point.
- [ ] No code change is required by this task itself — it is a decision-record update.
      If the chosen trigger is already met at decision time, that's a separate follow-up
      task (fork planning), not part of this one.

## Out of scope

- Actually forking Vditor, or any spike toward it — this task only sets the trigger
  condition for making that call later.
- Re-litigating the CSS vs TS patch mechanism split (ADR-0004's core decision) — that
  part is working and not in question.

## Verification

- [ ] ADR-0004 has a dated amendment section stating the trigger condition(s) and the
      current baseline patch count.
- [ ] The amendment is specific enough that a future reviewer can check it against
      reality without re-deriving judgment calls (i.e. a number or a measurable event,
      not "when it feels unmanageable").
