# Task 288 — Structural selection: staged Esc/Ctrl+A, scope-select (Ctrl+E/D/L), block copy

**Status:** planned · **Impact:** 🔴 high (keyboard power-editing) · **Origin:** task 192 §12

## What it is & the effect

Two proven idioms merged:
- **Notion's staged selection**: `Esc` selects the block you're typing in; `Ctrl+A`
  pressed once selects the current BLOCK, pressed again the whole doc — so "select this
  paragraph / this fence" is one keystroke instead of a mouse drag.
- **Typora's scope-select**: `Ctrl+E` selects the enclosing style scope (the whole bold
  span, the whole link, the table cell; press again → widen to the block), `Ctrl+D` word,
  `Ctrl+L` line/sentence.

**Today in VMDE:** Esc is a DEAD key in IR — Vditor unconditionally preventDefaults and
calls `options.esc`, which we never set (`editorCommonEvent.ts:167-175`); Ctrl+A is raw
browser select-all (with the helper-DOM hazards 191 P0-12 documents); there is no
scope-select at all. Selecting "exactly this code fence" or "just this bold phrase" is
mouse-only fiddling.
**After:** block-precise keyboard selection; with a block selected, the existing
marker-inclusive IR copy path (191 P0 contracts) gives **copy-block-as-markdown for free**;
Delete deletes the block cleanly; triple-click normalizes to the same block semantics per
block type (a fence selects the whole fence).

## Scope

- [ ] One shared **scope-walking module**: caret → inline `vditor-ir__node` → block
      (`hasClosestBlock`) → doc; drives all the chords.
- [ ] Staged Ctrl+A (capture phase): 1st = `selectNodeContents` of the current block,
      2nd = whole doc; plays nice with the fence-scoped Ctrl+A Vditor already does inside
      PRE (that becomes stage 0 there — pin the 3-stage ladder in a fence).
- [ ] Esc (register via `options.esc` where possible, capture-phase otherwise): collapse
      the expanded IR node → select current block → (configurable) blur to VS Code.
- [ ] Ctrl+E scope-select with widening; expanded-node selection EXCLUDES marker spans (so
      type-to-replace touches content only); Ctrl+D/Ctrl+L as cheap add-ons.
- [ ] Triple-click normalization per block type (code fence → whole fence incl. markers —
      aligns with 191 P0-11's dual-node findings).

## Out of scope

- Multi-block ranges via keyboard beyond block→doc (no Notion arrow-grow v1), node
  selection of VOID blocks (task 292 owns diagrams/hr).

## Verification

L1: scope-walker units (every inline node type, nested list item, table cell, fence).
L2: chord matrix — each stage's `range` boundaries exact, copy yields the block's
markdown, type-over replaces correctly, Esc ladder; interplay with the 191 select-all
nets. L3 real-VS-Code (mandatory): chords under real key capture; Esc doesn't leak to
VS Code (panel close) unless in blur stage.
