# Task 333 — AI Diagram Medic: "Fix it" on broken diagram fences [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled.

## What it is & the effect

When a diagram fence fails to render, the unified error box grows a **"Fix it"** button:
the broken source + the engine's EXACT error message go to the user's model (vscode.lm),
and the repaired source is re-rendered OFFLINE to PROVE it compiles before you see the
before/after and accept. Hunting a missing semicolon in wavedrom JSON or a bad arrow in
mermaid becomes one click with a verified result.

## Why novel

AI diagram GENERATION is everywhere (and prose→diagram is already task 269); targeted
REPAIR wired to 18 different engines' real error messages, with an offline render loop as
a free correctness validator (retry until it actually compiles), is unshipped anywhere.

## Feasibility on our assets

diagram-error.ts already normalizes per-engine error boxes with engine-registry-derived
titles — the button has a home; vscode.lm availability is confirmed (153's spike); the
render-validate-retry loop reuses the 269 prose→diagram plumbing (same "renderers are the
judge" principle). Consent/trust posture inherits 269's rules wholesale.

## Honest value

High perceived magic at low cost ONCE 269's plumbing exists — this is a rider, not a
foundation. Adopt = "269 phase 2, first cheap win".

## Decision

- [ ] **ADOPT** (sequenced after 269)
- [ ] **PARK** — reason: _______
