# Task 220 — Checkbox toggle in Preview mode + sv right pane

**Status:** planned · **Impact:** ⚪ low · **Origin:** task 192 §5

## Problem

Task-list checkboxes are inert outside the edit modes: Lute's preview render emits
`<input disabled type="checkbox">` (verified by Node probe; no click handler in vendored
`preview/index.ts` nor in our code). Users read docs in Preview and expect to tick items —
GitHub renders task lists interactively.

## Scope

- [ ] Post-render pass on preview surfaces (Preview mode + sv right pane): remove
      `disabled`, add a delegated click handler.
- [ ] Click → map the checkbox back to its source line (source-map / list-item index within
      the rendered tree — sv already has block anchors; reuse) → toggle `[ ]`↔`[x]` in the
      MODEL (post an edit through the normal pipeline, not DOM-only), preview re-renders
      from the change.
- [ ] Setting `vmarkd.preview.interactiveCheckboxes` (default on); read-only contexts
      (untrusted workspace?) leave disabled.
- [ ] Scroll position must survive the re-render (preview-scroll-preserve contract).

## Out of scope

- Other interactive preview elements, nested `[x]` styling changes.

## Verification

- L1: checkbox→source-line mapping unit (nested lists, multiple lists, checkbox inside
  callout/blockquote).
- L2: sv right-pane + Preview click → `getValue()` flips exactly one marker; scroll kept;
  one edit post (extends the 191 P0-15 real-click net to the preview surfaces).
- L3 real-VS-Code (mandatory): Preview toggle → click → Ctrl+S → disk shows `[x]`.
