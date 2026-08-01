# Task 331 — Dice & random chips (TTRPG kit) [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled. Honest rating: niche, cheap, great marketing.

## What it is & the effect

Type `roll: 3d6+2` → a result chip; click re-rolls with a quick tumble; optional LOG mode
appends the rolled value as real text for session notes. Palette inserts for UUID,
random-pick-from-list, random table rows. Flourish: **three.js is already bundled** (STL
renderer), so the chip can optionally pop a tiny real 3D d20 tumble at zero added bytes.
Campaign prep stops alt-tabbing to dice sites — your notes roll themselves.

## Why novel

Obsidian's Dice Roller plugin has a devoted following proving demand; no VS Code editor
touches this crowd. A real 3D die via an already-shipped engine is a twist nobody has.

## Feasibility on our assets

Chips = data-render pattern; log-append = the normal edit path; inserts = commands.ts;
the d20 rides vendored three.js behind a setting (mind the STL theme-independent-material
lesson). Days, not weeks.

## Honest value

Demo-wow exceeds daily value for most users — but it's cheap, sticky for the
TTRPG/worldbuilding segment, and excellent marketing for "the markdown editor that
renders everything".

## Decision

- [ ] **ADOPT**
- [ ] **PARK** — reason: _______
