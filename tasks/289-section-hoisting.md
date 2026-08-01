# Task 289 — Section hoisting / zoom-in (edit one section as the whole view)

**Status:** planned · **Impact:** 🟡 med-high (long docs) · **Depends:** shares task 258's section engine · **Origin:** task 192 §12 (SiYuan/Logseq lineage)

## What it is & the effect

The block-family's core answer to long documents (SiYuan "focus", Logseq "zoom-in" — both
flagships of the ecosystem our engine comes from): open one section as if it were the
whole document, with a breadcrumb path to climb back out.

**Today in vMarkd:** working on chapter 7 of a 400-block spec means the other 6 chapters
scroll, distract and slow you down; the only tools are the outline panel and (future)
folding.
**After:** "Hoist section" from the outline context menu / heading gutter → the editor
shows ONLY that heading's section, a breadcrumb bar (`Doc › 7. Deployment`) exits back to
the full view. The file on disk is always the whole document — hoisting is a pure view.

## Scope

- [ ] Display-only mechanism: `display:none` on all top-level `data-block` nodes outside
      the hoisted section (section-range = task 258's engine — heading → next ≤-level
      heading; SHARED, build once). The full doc stays in the DOM → Lute serialization,
      IR spin, save and undo are architecturally untouched.
- [ ] Breadcrumb bar to un-hoist (this is task 290's sticky breadcrumb in its "hoisted"
      state — one component, two duties).
- [ ] Exemptions audit (the real work): outline panel maps only visible blocks (or marks
      hoist scope), scroll-sync/heading-anchors skip hidden blocks, render-cache viewport
      logic and streaming ignore them, find/reveal into a hidden block auto-unhoists.
- [ ] Hoist heading SECTIONS v1 (list-subtree hoist = v2, the honest file-based mapping);
      sv/Preview out of scope v1; state per doc in webview state (not persisted to disk).

## Out of scope

- Editing scoped SAVE (always whole doc), multi-section hoist, Logseq block-level zoom
  (needs block granularity — revisit after 263).

## Verification

L1: reuse 258's section-range tests. L2: hoist → only section visible, `getValue()` is
the FULL doc byte-stable, edits inside hoist serialize correctly, un-hoist restores
scroll; outline/anchor exemptions asserted. L3 real-VS-Code (mandatory): hoist → type →
save → full doc on disk; find-in-page into a hidden block un-hoists.
