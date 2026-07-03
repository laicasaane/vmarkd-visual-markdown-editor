# Task 316 — Chart This Table: live chart bound to a markdown table [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13;
two lenses proposed it independently); NOT scheduled.

## What it is & the effect

Caret in any markdown table → one command → a ```` ```chart ```` fence appears that
REFERENCES the table (by nearest heading anchor) and draws it with the shipped ECharts —
bar/line/pie inferred from the data shape. Edit a number in a cell and the chart animates
to match. No duplicated data blob ever enters the file: the table stays the single source
of truth, the chart is one declarative line — and it's all still plain text.

## Why novel

Notion/Obsidian need databases or query-language plugins; no markdown WYSIWYG has
one-command table→chart where the binding survives as plain text AND updates live while
you type in the table.

## Feasibility on our assets

source-map's `getTableSourceOffset` ships EXACT cell↔source mapping; echarts is a native
engine with the debounced edit-re-render path (161) and 10+ curated themes
(echarts-gallery); heading anchors exist; broken ref reports through the unified error box
(178); the generated fence writes via minimal-diff. New work = the tiny ref syntax +
data-shape inference.

## Honest value

Strong daily-driver for reports/benchmarks/metrics notes; the live cell-edit→chart-morph
moment is genuinely demoable. Distinct from 230's CSV import (external data) — this
visualizes what's already in the doc.

## Decision

- [ ] **ADOPT**
- [ ] **PARK** — reason: _______
