# Task 315 — Micro-viz pack: inline sparkline · progress chip · calendar heatmap [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled.

## What it is & the effect

A family of tiny data drawings: inline chips like `spark: 3 5 2 8 9` (a word-height trend
line), `progress: 7/12` (a mini bar), and a ```` ```heatmap ```` fence where lines like
`2026-06-01: 3` render a GitHub-style calendar heatmap for habit logs. Rows of numbers you
must read and imagine become shapes visible at reading speed — offline and themed like
everything else.

## Why novel

Sparklines exist in Excel and scattered Obsidian plugins; no markdown editor ships an
inline micro-viz SYNTAX FAMILY. The native calendar-heatmap fence targets the huge
habit-tracker crowd directly.

## Feasibility on our assets

Adding a fence engine is one descriptor + renderer (engine-registry, task 185/2a), and
static-SVG output gets the 184 host cache for free. Sparkline/progress are hand-rolled
~20-line SVGs (no library); heatmap = the bundled ECharts calendar coordinate. Inline
chips ride the data-render pattern; theming plugs into the palette pairing.

## Honest value

Sparkline + progress are honest daily-drivers; the heatmap is the crowd-pleaser. Cheap,
cacheable, very on-brand for an 18-engine editor.

## Decision

- [ ] **ADOPT**
- [ ] **PARK** — reason: _______
