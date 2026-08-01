# Task 313 — Numbers layer: inline Calc chips + unit/currency conversions [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled. Two riders on one engine — adopt together.

## What it is & the effect

**Calc chips (Soulver in your notes):** type `= 350*3 + 8%` in plain prose and the answer
appears as a small themed chip right after the expression, recomputing live as you edit;
name a value once (`budget = 1200`) and reuse it later (`= budget - 350*2`). Notes with
numbers (budgets, estimates, invoices, recipe scaling) compute THEMSELVES; the file stays
plain markdown (chips are display-only; optional command freezes a result into text).

**Unit & currency chips:** "10 mi", "72°F", "$120" get a subtle chip with your preferred
units — "16.1 km", "22°C", "≈473 PLN (rates as of 2026-06-15)" — offline vendored rates
with an HONEST as-of date, optional user rates file. The file never changes.

## Why novel

Soulver/Numi are standalone paid apps; Obsidian needs the Numerals plugin. No WYSIWYG
markdown editor anywhere ships prose math with doc-scoped variables. Nobody decorates
quantities in place; nobody labels currency staleness honestly.

## Feasibility on our assets

Every hard part is solved in-repo: Lute-invisible chips (data-render/ghost-span rule),
attribute+MutationObserver decoration (callouts precedent), source-on-focus editing. The
evaluator is a new small pure-TS Pratt parser — NO eval, CSP-safe, trivially unit-testable.
Units = static table; currency = vendored JSON (the plantuml-stdlib vendoring pattern).
Zero host-side work for calc.

## Honest value

Best value-per-effort of the whole creative lens: genuine daily-driver AND demos
brilliantly. The conversion rider is near-zero marginal cost on the same recognizer.

## Decision

- [ ] **ADOPT** → calc first, conversions ride along
- [ ] **PARK** — reason: _______
