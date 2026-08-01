# Task 322 — Glossary lint + time-bomb phrase detector [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled.

## What it is & the effect

A plain `glossary.md` TABLE in the vault ("use 'sign-in', not 'login'; 'vMarkd', not
'VMarkd'") drives live squiggles with one-click fixes in the WYSIWYG surface. The same
engine flags **time-bomb prose**: "as of March 2025", "currently", "temporary workaround",
"in v1.2" (checked against package.json's REAL version) — each with its age ("this 'as
of' is 16 months old"). Terminology stops drifting per author; expired temporal claims
stop lurking forever.

## Why novel

Vale does terminology linting as CLI/CI with .ini styles for raw-text editors. Our twists:
the ruleset is ITSELF a markdown table edited in the same editor (zero config format), it
runs inside a WYSIWYG surface, and the temporal-drift class (dated claims + version pins
aged against the real repo version) isn't in Vale's vocabulary at all.

## Feasibility on our assets

Glossary parsing = md-scan's splitRowCells (built for exactly this); reload on edit =
wiki-cache's watcher; quick-fix replace = minimal-diff writeback; version compare reads
package.json host-side; squiggles = the attribute+MutationObserver decoration pattern.
Pairs with (doesn't duplicate) 262 — that's prose QUALITY, this is project TRUTH.

## Honest value

Terminology half = solid team value; the time-bomb half is the sleeper hit — every vault
has dozens of expired "currently"-claims and no tool has ever pointed at them. Modest wow,
compounding value.

## Decision

- [ ] **ADOPT** (could ride 262's decoration engine)
- [ ] **PARK** — reason: _______
