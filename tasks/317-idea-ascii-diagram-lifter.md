# Task 317 — ASCII Diagram Lifter: legacy box art → real d2 [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled.

## What it is & the effect

The editor notices an old-school ASCII box diagram in a fence (`+----+`, `-->`,
box-drawing chars) and offers one click: **"Beautify to d2"** — side-by-side before/after,
then swaps the fence to real d2 source rendered by our offline engine. 2009-era README art
nobody dares touch becomes a themed, zoomable, EDITABLE diagram; the ASCII original stays
in git/undo.

## Why novel

Existing tools go the OTHER direction (Monodraw renders TO ascii). One-click paydown of
decades of README diagram debt is shipped by nobody.

## Feasibility on our assets

We ship the d2 WASM compiler and own the entire toSVG pipeline — emitting d2 source is the
easy half. The deterministic parser (grid scan → boxes, labels, edge tracing) is a real
but bounded pure-TS project, perfectly unit-testable on fixture art; messy free-form art
falls back to the vscode.lm wire (269's plumbing), deterministic result always preferred.
Fence swap = minimal-diff.

## Honest value

Real value + big demo-wow; the grid parser is the one meaty engineering cost in the
whole play-lens. Adopt only with appetite for that parser.

## Decision

- [ ] **ADOPT**
- [ ] **PARK** — reason: _______
