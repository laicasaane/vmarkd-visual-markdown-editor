# Task 288 — Structural selection: staged Esc/Ctrl+A, scope-select (Ctrl+E/D/L), block copy

**Status:** done · **Impact:** 🔴 high (keyboard power-editing) · **Origin:** task 192 §12

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

- [x] One shared **scope-walking module**: caret → inline `vditor-ir__node` → block
      (`hasClosestBlock`) → doc; drives all the chords.
- [x] Staged Ctrl+A (capture phase): 1st = `selectNodeContents` of the current block,
      2nd = whole doc; plays nice with the fence-scoped Ctrl+A Vditor already does inside
      PRE (that becomes stage 0 there — pin the 3-stage ladder in a fence).
- [x] Esc (capture phase): collapse the expanded IR node safely → select current block; the shipped
      Esc→Tab toolbar exit remains the final focus stage because no blur setting exists.
- [x] Ctrl+E scope-select with widening; expanded-node selection EXCLUDES marker spans (so
      type-to-replace touches content only). Ctrl+D/Ctrl+L remain shipped strike/list shortcuts.
- [x] Triple-click normalization per block type (code fence → whole fence incl. markers —
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

## Completed (2026-08-31)

Task 506's existing word-expansion module is now the shared `selection-scope.ts` authority, so the
new structural scope walker adds no eager module. In IR it derives a strict authored-content ladder:
inline node, table cell, Markdown block, document. Inline ranges stop at VMDE/Vditor marker and
helper DOM, tables select their outer node so Markdown copy is exact, nested list items remain the
nearest block, and code fences retain a deterministic three-stage source → fence → document ladder.

Capture-phase Ctrl+A and Ctrl+E drive that model. Ctrl+A selects the current block then document;
inside a fence it first owns Vditor's source-only stage because the upstream bubble handler is
nondeterministic from a programmatic caret. Ctrl+E widens inline → cell → block → document and
type-over of inline content preserves the surrounding Markdown markers. Triple-click is normalized
on the third click to the same block range, including an entire fence for exact Markdown copy.

Esc now moves the caret safely outside an expanded inline node before collapsing it, then selects
the block on the next press. This is required by Task 286: collapsing while the caret remained
inside would immediately re-expand the node. Task 456's established Esc→Tab toolbar exit remains
the final focus path and was reverified; the old task's “configurable blur” was not implemented
because no such setting exists and inventing one would conflict with that shipped accessibility
contract.

The requested Ctrl+D word-select and Ctrl+L line-select add-ons were also deliberately not
implemented. Since Task 288 was written, Ctrl+D became the promoted strikethrough shortcut (Task
506) and Ctrl+L the promoted list shortcut; both have real-VS-Code contracts. The structural
listener explicitly falls through for them, and the real acceptance proves strike/list still act.

### Verification

- TDD began with a real-Vditor RED result: first Ctrl+A selected the entire document. The final
  scope unit file passes 40/40 across marker-free inline ranges, nested lists, cells/tables, fences,
  staged Ctrl+A/Ctrl+E/Esc, triple-click, composition, teardown, and Ctrl+D/Ctrl+L fallthrough. The
  focused module/boundary set passes 52/52.
- Final repository-configured Chromium coverage passes 9/9 with `--retries=0`: block/document copy,
  the three-stage fence ladder, inline replacement/widening, table and nested-list scopes,
  Esc→Tab, fence copy, and paragraph type-over. `selection-scope.ts` reports 95.49% lines / 97.63%
  bytes in the coverage bundle.
- After `node build.mjs`, the single-boot real-VS-Code acceptance passes 1/1 with
  `--retries=0` in 7.3 seconds. Real top-level keys cover paragraph Ctrl+A, marker-free Ctrl+E,
  fence source Ctrl+A, Esc, Ctrl+D, and Ctrl+L. Fence block copy and block→document widening run
  atomically through the same installed handler inside the real webview because a synthetic
  clipboard probe otherwise steals focus before the next top-level key. The bounded fence source
  setup completed on its first attempt in the final run.
- Build and all three type checks pass. The shared module rename preserves 275/275 eager modules;
  measured main.js is 523.8 KB, recorded as 524/525 KB after a bounded Task 288 budget raise.
- Aggregate quality passes brand checks, lint, jscpd, dependency-cruiser, all audits, 3,371/3,371
  unit coverage tests, and the 15-module ratchet. Its only failure is the unrelated pre-existing
  `knip` report for `yazl` in `test/backend/package-local-preview-core.test.ts`.

Retry history: early real candidates exposed test-only focus/selection boundaries around nested
webview keyboard focus, synthetic clipboard dispatch, and programmatic fence-source placement—the
same nondeterministic native fence setup Task 191 had recorded. The final journey refreshes page
focus before source/format keys, bounds exact fence placement, and keeps block-copy plus the next
widening event in one real-webview evaluation. No Playwright retry was used. Per queue policy, no
FAST, full Chromium, or full real-VS-Code suite was run.
