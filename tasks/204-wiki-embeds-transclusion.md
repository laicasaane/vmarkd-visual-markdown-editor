# Task 204 — Embeds / transclusion `![[note]]`

**Status:** planned · **Impact:** 🟡 med · **Origin:** task 192 §3

## Problem

`![[note]]` renders as a literal `!` followed by a normal link chip — `WikiLinkPattern`
(`src/wiki-core.ts:5`) has no leading-`!` branch. Obsidian vault content with embeds
degrades visibly.

## Scope

- [ ] Recognize `![[target]]` (+ `#heading` slice once task 203 lands) in the webview
      renderer and serializer: round-trip must preserve the `!` (extend
      `custom-renderer.ts` + `wiki-serialize.ts`; injected DOM must be Lute-invisible —
      `data-render` discipline per the vmarkd-lute-features skill).
- [ ] New protocol pair: webview requests target content → host reads the file (wiki-cache
      resolution, same ambiguity rules) → webview renders a **read-only** inclusion block
      (Lute preview render into a `data-render="2"` container) with a header chip linking
      to the source note.
- [ ] Guards: cycle detection (A embeds B embeds A) with a "cyclic embed" placeholder;
      depth limit 3; missing target → styled missing box (diagram-error pattern);
      re-render on target file save (watcher → push, or refresh on focus — pick cheapest,
      document).
- [ ] `#heading` slice: embed only that section's blocks (after 203's slugger exists).

## Out of scope

- Editing THROUGH the embed (read-only v1), `^block` embeds, image-style size params.

## Verification

- L1: pattern/serializer units (`!` preserved, nested-embed markdown untouched inside the
  container); slice extraction unit.
- L2: harness with a mocked host reply — renders content, cycle placeholder, missing box;
  round-trip byte-stable.
- L3 real-VS-Code (mandatory): real two-file fixture — embed renders target content over
  the real wire; editing the target file updates the embed; `getValue()`/disk unchanged.
