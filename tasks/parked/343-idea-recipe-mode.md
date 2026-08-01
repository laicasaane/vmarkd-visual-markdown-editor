# Task 343 — Recipe mode: servings scaler + shopping-list extraction [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Real-usage audit (192 §14);
NOT scheduled.

## What it is & the effect

The self-hosted recipe crowd (huge: Mealie/Tandoor users, r/selfhosted) keeps recipes in
markdown. Mode for docs with `recipe:` front-matter (schema.org-ish keys): a **servings
stepper** in the rendered view that rescales ingredient quantities live (display-only —
the 313 recognizer parsing "250 g flour"), and "Extract shopping list" — checkboxes from
the ingredients section appended to a chosen list note (340's capture plumbing).

## Why novel / value

Recipe managers are apps; recipe EDITING stays in generic editors with zero cooking
affordances. Scaling is the genuinely-missed feature (unit-aware: 0.75 cup, 1½ tsp).
Honest: niche outside that crowd; charming demo.

## Feasibility

Quantity recognizer shared with 313 (build once); stepper = display-only decoration
(data-render); extraction = 340's append. Front-matter via 207.

## Decision

- [ ] **ADOPT** (after 313; bundle with 340)  ·  - [ ] **PARK** — reason: _______
