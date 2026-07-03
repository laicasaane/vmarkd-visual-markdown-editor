# Task 309 — Wiki-wired diagrams: `[[Note]]` node labels become live links [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled.

## What it is & the effect

Write `[[Note Name]]` as a node label in a mermaid/d2/graphviz/markmap diagram and the
RENDERED node becomes a real link: click opens the note; missing notes tint red exactly
like broken wiki chips in prose. Diagrams stop being dead pictures next to your vault —
the architecture map IS the navigation; the diagram and the wiki are the same graph.

## Why novel

Mermaid has a manual per-node `click A href` directive (GitHub strips it; nobody writes
it). Zero-syntax `[[..]]`-label linking across ALL engines, with live exists/missing state
from the vault index, counting as real backlinks — exists in no markdown tool including
Obsidian.

## Feasibility on our assets

wiki-cache `resolve/has` answers existence instantly (watcher-fresh); WikiLinkPattern is
the shared parser; rendered SVGs carry labels verbatim as text nodes → a postprocess pass
wraps matches in anchors; SVG-anchor routing through the custom-editor pipeline is an
ALREADY-SOLVED problem in this repo (AGENTS.md's e2e list). Backlinks plug into 201's
index.

## Honest value

High daily value for PKM + architecture users — "map of content as an actual map" is a
pitch line; solid demo (click a node, land in a note).

## Decision

- [ ] **ADOPT** (after 201 ships, so the backlink half lands too)
- [ ] **PARK** — reason: _______
