# Task 257 — `<details>/<summary>`: working toggle while EDITING + authoring affordance

**Status:** planned · **Impact:** 🟡 med-high (GitHub-staple syntax) · **Origin:** task 192 §10 (probe-verified)

## Problem

Probe-verified PARTIAL: `<details>` round-trips byte-stable and toggles fine in full
Preview, but IR splits it into TWO disconnected `data-type="html-block"` dual-nodes (open
tag + close tag) with the body rendered between them — the IR preview pane holds an
UNCLOSED `<details>` in a `<pre>`, so toggling hides nothing while editing, and it looks
broken. No authoring affordance exists (not even in 221's template list).

## Scope

- [ ] Details-aware decorator (the callouts.ts pattern): pair the open/close html-block
      nodes, wrap the between-content in attribute-only collapsible chrome (data-render
      discipline — round-trip must stay byte-stable), summary text shown as the toggle
      header; caret-inside reveals the raw tags (source-on-focus, callout-style).
- [ ] Toggle state is visual-only; default state follows the `open` attribute.
- [ ] Authoring: `;;details` template in task 221's registry (skeleton with summary +
      body placeholder) — coordinate, don't duplicate.
- [ ] Regression net for what ALREADY works: one Preview e2e clicking the summary
      (protects against a future sanitize tightening — currently untested).

## Out of scope

- Converting details ↔ callout-fold, nested details polish beyond not-breaking, styling
  themes beyond the existing summary cursor rule.

## Verification

L1: open/close pairing unit (unclosed, nested, multiple blocks). L2: collapsible chrome in
IR/WYSIWYG, byte-stable round-trip, caret-enter shows source, Preview toggle still native.
L3 real-VS-Code (mandatory): fixture section toggles in edit mode + save fidelity.
