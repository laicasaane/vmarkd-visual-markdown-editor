# Task 329 — Reading comfort pack: OpenDyslexic · reading ruler · bionic toggle [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled.

## What it is & the effect

Three one-click reading aids in the view menu, per-document, never touching the file:
1. **OpenDyslexic font mode** — the dyslexia-friendly font, bundled (OFL license), served
   through the same offline resource pipeline as everything else.
2. **Reading ruler** — a soft horizontal band following caret/pointer to keep your place.
3. **Bionic toggle** — bolds the first half of each word for skim-reading. **Honesty
   label required:** a 2022 replication found NO speed benefit — ship it explicitly as a
   preference, not science.

## Why novel

Individually these exist as scattered browser extensions/Obsidian plugins; NO editor
ships them as a coherent, offline, accessibility-first set. Bundling OpenDyslexic in a
VS Code markdown WYSIWYG appears to be a first.

## Feasibility on our assets

Font = woff2 in media/ (CSP-safe like the 18 engines); ruler = one overlay div driven by
the existing caret tracking (editor-caret.ts); bionic = word-splitting spans — safe in
Preview outright, editable surface only via the data-render pattern.

## Honest value

Dyslexia font + ruler = real accessibility value for a group that will LOVE it; low wow,
real goodwill. Pairs thematically with 265/267 (a11y batches).

## Decision

- [ ] **ADOPT** (font+ruler; bionic optional)
- [ ] **PARK** — reason: _______
