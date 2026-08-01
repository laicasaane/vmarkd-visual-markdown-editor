# Task 306 — Reflective self-fences: the document renders ITSELF [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative-audit proposal
(192 §13); NOT scheduled. Sibling of 305 (data source = the document, not the workspace).

## What it is & the effect

A fence whose data source is the document itself: ```` ```markmap self ```` renders the
doc's OWN heading outline as a live mind-map that reorganizes as you type; siblings render
a live progress donut of the doc's own checkboxes, or a mini-map of the notes this doc
links to. The outline stops living in a sidebar — a document can embed a living picture
of itself that is always current, and it survives export/GitHub as a normal fence.

## Why novel

Obsidian plugins show an outline mindmap in a separate PANE; a self-referential fence
INSIDE the doc, updating live in WYSIWYG while you type, is shipped nowhere. (Distinct
from the backlog's doc-stats PANEL and TOC — this is embedded rendered content.)

## Feasibility on our assets

Markmap's input format IS markdown headings — the feed is a text filter over the doc we
already hold; outline-tree.ts + md-scan's fence-aware heading extraction exist; checkbox
stats are the same line scan; the links mini-map renders through our own echarts/d2 with
wiki-cache resolving targets. Live refresh rides the edit-activity debounce.

## Honest value

High PKM daily value (a TOC/mindmap that can never go stale) at unusually LOW build cost;
quietly magical rather than flashy. One of the cheapest HIGH items in the batch.

## Decision

- [ ] **ADOPT** → v1 = `markmap self` only; donut/links-map as follow-ups
- [ ] **PARK** — reason: _______
