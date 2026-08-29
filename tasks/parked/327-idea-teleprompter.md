# Task 327 — Teleprompter mode [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled. Honest rating: sticky for a niche, invisible outside it.

## What it is & the effect

Turn the preview into a teleprompter: large type, auto-scroll at a chosen WPM (defaulting
from the doc's own reading-time estimate), current line held at a fixed eye-line, optional
MIRROR flip for real prompter glass, space to pause. YouTubers/speakers stop pasting their
markdown scripts into separate teleprompter apps. The twist nobody has: pause and click a
paragraph → you're back in WYSIWYG editing AT THAT SPOT (block↔line source map) — prompter
and editor are the same surface, so script fixes happen mid-rehearsal.

## Why novel

Standalone prompter apps are everywhere; a teleprompter INSIDE a markdown editor with an
edit-here handoff exists nowhere (Obsidian has one basic-scroll community plugin).

## Feasibility on our assets

Very cheap: the existing preview surface + rAF scroll + CSS transform for mirroring;
reading-time.ts establishes the WPM notion; source-map gives scroll→block for the
handoff; the capture-phase key pattern handles space/arrows without VS Code stealing them.

## Honest value

For script-driven creators this makes VMDE the whole pipeline (write→rehearse→record);
for everyone else unused. Cheap enough that "niche but ours" may be worth it.

## Decision

- [ ] **ADOPT**
- [ ] **PARK** — reason: _______
