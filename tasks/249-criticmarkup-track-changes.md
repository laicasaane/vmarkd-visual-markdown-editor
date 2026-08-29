# Task 249 — CriticMarkup track changes (`{++ins++}` `{--del--}` `{~~old~>new~~}` `{>>c<<}`)

**Status:** planned · **Impact:** 🟡 med (tech-writer review flow) · **Origin:** task 192 §10 (probe-verified)

## Problem

The plain-text track-changes interchange (Pandoc/iA Writer/Marked2) is unsupported — and
the substitution form renders MANGLED today: probe shows `{~~old~>new~~}`'s inner `~~`
parses as GFM strikethrough → `{<del>old~>new</del>}` garbage. Round-trip is byte-stable
(verified), so a decoration + command layer is safe. Task 237 (review annotations) is
block-anchored COMMENTS — this is inline change-tracking; they complement each other, and
237's design phase should consider `{>>comment<<}` as its syntax (cross-noted there).

## Scope

- [ ] Decoration pass (data-render, theme-aware, Lute can't parse it → JS post-processor):
      ins green, del red-strikethrough, substitution rendered old→new, `{==highlight==}`,
      comment chip. Fixes the `~~` mangling as a side effect (decorator claims the span
      before GFM sees it — verify the mechanism against the dual-node model).
- [ ] Commands: Accept / Reject change at caret, Accept all / Reject all — pure string
      rewrites over the model (easy L1 units), one undo step each.
- [ ] Setting `vmde.criticMarkup` (default on for rendering — the syntax has no other
      meaning; commands always available).
- [ ] **Comment-mark rendering pattern** (added 2026-07-03, SiYuan inline-memo parity):
      render `text{>>memo<<}` as 'text' with a dotted underline and the memo in a hover
      popup (editable in place) — the span decoration must be Lute-invisible
      (data-render="1" rule; wiki-chip precedent). This gives task 237 its
      inline-granularity anchor using THIS task's portable syntax — coordinate the two
      designs.

## Out of scope

- Generating CriticMarkup from a diff (nice future: "track my edits" mode), author
  attribution metadata, 237's block comments.

## Verification

L1: parser + accept/reject rewrite units (all five marks, nesting, multiline). L2: render
decorations in ir/wysiwyg/preview, round-trip byte-stable, accept-at-caret rewrites
exactly one span. L3: fixture with all five marks → visual classes + save fidelity.

## Prior art — fork re-scan 2026-07-23 (task 358)

- `Banbrider/vditor` → `develop` (7 ahead, 2026-07-13): `feat: 新增协作模式，标记内容功能` + `协作标记系统全面增强` — a Vditor-level collaboration/content-marking (annotation) layer. Reference for the mark-rendering half only; it is Vditor-core surgery, not adoptable as-is. Same pointer applies to task 237.
