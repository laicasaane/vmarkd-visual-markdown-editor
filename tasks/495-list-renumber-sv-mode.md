# Task 495 — Fix/renumber ordered lists: sv mode

**Status:** planned · **Impact:** ⚪ low · **Origin:** split off task 255 (2026-08-04) — ir/wysiwyg shipped, sv deferred by explicit user decision

## Problem

Task 255 shipped `vmde.fixListNumbering` / `vmde.renormalizeAllLists` for ir/wysiwyg by
re-serializing a list root's `outerHTML` through `SpinVditorIRDOM`/`SpinVditorDOM`
(`media-src/src/editing/list-normalize.ts`). That approach doesn't transfer to sv mode:
measured, Vditor's `setValue()` wraps the ENTIRE sv document in ONE `<div data-block='0'>`
(`vditor/src/index.ts:317`) — per-paragraph `data-block` divs only appear after a local edit
re-spins a sub-region (`sv/process.ts`'s `processSpinVditorSVDOM`). So there is no ready-made
"list block" DOM element to scope a spin against on a freshly opened document, unlike
ir/wysiwyg's `<ul>/<ol>` roots.

## Scope

- [ ] Command `VMDE: Fix list numbering` / `Renormalize all lists` work identically when
      the active mode is sv (same command IDs — `vmde.fixListNumbering` /
      `vmde.renormalizeAllLists` already exist and route through `activeModeElement`, which
      resolves the sv element too; this task only needs to make `list-normalize.ts`'s core
      handle that element shape).
- [ ] Decide + implement one of:
  - Text-range block-boundary detection (find the contiguous list-marker lines around the
    caret / around each list in the raw markdown, scoped tighter than "one data-block") —
    higher-risk (a wrong boundary can absorb/corrupt an adjacent non-list paragraph, the exact
    failure mode ir/wysiwyg's "byte-identical rest of doc" verification guards against) but
    matches ir/wysiwyg's per-list scoping.
  - Normalize the enclosing `data-block` as-is (coarser but honest: on a freshly opened doc
    that may be the WHOLE document; after local edits it may be just one paragraph — behaviour
    is history-dependent, which needs to be documented as a known limitation, not hidden).
- [ ] Whichever approach: caret/scroll preservation (`Lute.Caret` token round-trips to
  `<wbr>` — `sv/process.ts`'s `processPaste` already does this for the paste path, same
  mechanism reusable here) and one undo step, same bar as ir/wysiwyg.

## Out of scope

Same as task 255: auto-renumber-on-edit (task 284), list-style changes.

## Verification

L1: unit coverage for whichever block-boundary logic gets picked (messy fixtures, Node-Lute
recipe if text-range; jsdom if DOM-based). L2: harness spec (`media-src/e2e/list-normalize.spec.ts`
already has the ir/wysiwyg pattern to extend) — sv leg: numbering fixed, rest of doc
byte-identical (or documented coarser scope), caret kept, one undo. L3: extend
`test/vscode-e2e/list-normalize.spec.ts`'s existing test with an sv-mode pass, same fixture.
