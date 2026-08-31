# Task 257 — `<details>/<summary>`: working toggle while EDITING + authoring affordance

**Status:** done — 2026-08-31 · **Impact:** 🟡 med-high (GitHub-staple syntax) · **Origin:** task 192 §10 (probe-verified)

## Problem

Probe-verified PARTIAL: `<details>` round-trips byte-stable and toggles fine in full
Preview, but IR splits it into TWO disconnected `data-type="html-block"` dual-nodes (open
tag + close tag) with the body rendered between them — the IR preview pane holds an
UNCLOSED `<details>` in a `<pre>`, so toggling hides nothing while editing, and it looks
broken. No authoring affordance exists (not even in 221's template list).

## Scope

- [x] Details-aware decorator (the callouts.ts pattern): pair the open/close html-block
      nodes, wrap the between-content in attribute-only collapsible chrome (data-render
      discipline — round-trip must stay byte-stable), summary text shown as the toggle
      header; caret-inside reveals the raw tags (source-on-focus, callout-style).
- [x] Toggle state is visual-only; default state follows the `open` attribute.
- [x] Authoring: `;;details` template in task 221's registry (skeleton with summary +
      body placeholder) — coordinate, don't duplicate.
- [x] Regression net for what ALREADY works: one Preview e2e clicking the summary
      (protects against a future sanitize tightening — currently untested).

## Out of scope

- Converting details ↔ callout-fold, nested details polish beyond not-breaking, styling
  themes beyond the existing summary cursor rule.

## Verification

L1: open/close pairing unit (unclosed, nested, multiple blocks). L2: collapsible chrome in
IR/WYSIWYG, byte-stable round-trip, caret-enter shows source, Preview toggle still native.
L3 real-VS-Code (mandatory): fixture section toggles in edit mode + save fidelity.

## Completed implementation

Lute's sibling opening/body/closing shape now becomes a working edit-mode disclosure without
wrapping or moving any authored block. A protected-context HTML scanner pairs real `details` tags
while ignoring comments, declarations, processing instructions, CDATA, and raw script/pre/style/
textarea content. Multiple and ordinary nested pairs work; the exact Lute shape that coalesces
consecutive nested openings onto one DOM block is deliberately consolidated to its outer pair so
one source node never acquires competing buttons or open state. Unclosed/stray tags stay untouched.

Each paired opening receives one `data-render="1"`, non-editable semantic button whose visible label
comes from the actual summary DOM. `aria-expanded`, native click, capture-phase Enter/Space, visible
focus, hover, long-label wrapping, and an `aria-hidden` chevron meet the current interface-guideline
bar. Collapse/open/editing is projected only through attributes on existing siblings. The `open`
attribute sets the initial visual state; user toggles remain visual-only. A caret in the opening,
body, or closing block reveals both raw tags and the body, then restores the chosen visual state on
leave. Preview receives no decorator and keeps the browser-native `<details>/<summary>` behavior.

The controller builds a top-level block-to-owner index only when HTML structure changes. Ordinary
mutations and selection changes outside details resolve a cached empty owner in O(1), while a newly
replaced body block uses a pair-count-only DOM-order fallback and caches the result. No whole-editor
query or disclosure-body walk runs on unrelated typing/caret movement.

Task 257 also establishes Task 221's shared snippet registry with only the source-owned `details`
skeleton. `;;details` works in IR/WYSIWYG/SV through Vditor's existing hint/Spin insertion path and
coexists with the conditional `[[` wiki provider. A snippet-marked hint boundary seeds a first-edit
undo baseline for pointer or keyboard selection: one Undo removes the expansion and restores the
typed `;;det` trigger. Task 221's record now directs its future table/diagram/user-template work to
extend this registry rather than duplicate the details contract.

### Verification evidence

- Focused unit/backend coverage passes **15/15** for protected pairing, multiple/unclosed/nested and
  coalesced shapes, `open` defaults, semantic keyboard toggle, source reveal/cleanup, indexed no-op
  mutation and selection paths, registry/filter/escaping, hint checkpoint lifecycle, and finish-init
  wiring. The final module-boundary/harness set passes **27/27**.
- Focused Chromium passes **6/6** in IR/WYSIWYG/SV: exact `getValue()`, click/keyboard toggle,
  caret-source reveal, one-step snippet undo, and native Preview behavior. Focused browser coverage
  records **84.54% statements / 70.81% branches / 86.05% functions / 82.51% lines** for the
  production controller and **92.86% lines** for the snippet registry.
- The final real-VS-Code journey passes **1/1** in 11.2 s with `--retries=0`, proving IR/WYS toggle,
  raw-tag reveal, native Preview, unchanged host text, exact saved disk bytes, production Source-mode
  `;;details`, and expansion Undo back to the trigger. Iterative no-retry candidates exposed and
  corrected caret placement, empty per-mode history seeding, two-state readiness, and host-vs-Lute
  trailing-newline test oracles before this final pass.
- The element-scoped `details-collapsed-toggle.png` golden was generated and visually inspected. The
  final build, lint, all typechecks, brand check, jscpd, dependency boundaries, root/webview/vendor
  audits, **571/571 KiB** eager-bundle budget, and **285/285** eager-module startup budget pass.
- Final full coverage passes **246 files / 3,550 tests** at **76.18% statements / 68.67% branches /
  78.82% functions / 78.17% lines**; the 14-module zero-coverage ratchet passes.

The single aggregate quality run left only the pre-existing unlisted `yazl` knip finding. Its first
coverage stage correctly caught the initially missing manifest entries; two unrelated local-preview
fixture tests also crossed their 5 s timeout under the loaded coverage run. The entries were added,
the three local-preview cases passed **3/3** in isolation outside the process sandbox, and the final
full coverage/ratchet rerun passed. No dependency files changed. Per queue policy, no FAST, full
Chromium, or full real-VS-Code suite was run. Final review found no Critical or Important issues.
