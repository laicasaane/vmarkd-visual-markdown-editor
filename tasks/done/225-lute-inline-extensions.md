# Task 225 — Expose bundled Lute extensions: `[toc]`, `==mark==`, sup/sub

**Status:** done · **Impact:** 🟡 med, cheap-win batch · **Origin:** task 192 §6

## Problem

The bundled engine already supports three requested features, all switched off and
unexposed (verified by executing the vendored `lute.min.js` in Node — memory
`[[lute-runs-in-node]]`):

- `[toc]` — `SetToC(true)` renders a live `vditor-toc` block; Vditor default off
  (`constants.ts:65`), we never set it → stays literal text.
- `==mark==` — Lute supports (default off, `constants.ts:61`) → literal `==hi==` today.
- Superscript/subscript — Lute has `SetSup`/`SetSub`; today `~x~` parses as strikethrough — a
  REAL conflict needing an opt-in decision, not just an unconditional parser change.

Implementation-time source inspection corrected the stale plumbing claim in the original task:
pinned Vditor 3.11 already calls `SetToC`, `SetMark`, `SetSup`, and `SetSub` from `setLute.ts` using
its `preview.markdown` options. No setLute patch is required or desirable.

## Scope

- [x] Settings (all default off — parser changes alter how EXISTING docs render):
      `vmde.markdown.toc`, `vmde.markdown.mark`, `vmde.markdown.supSub`.
- [x] Wire all four existing Vditor `preview.markdown` booleans authoritatively from the three
      settings; host prerender and write-back canonicalization explicitly reset the same flags per
      resource and invalidate both caches when the live flag signature changes.
- [x] Per feature verify the full loop, not just render: IR dual-node editing (markers
      expand/collapse), serialization round-trip byte-stable, wysiwyg + sv render, theme
      CSS for `<mark>` (dark mode!) and the toc block.
- [x] `~x~` conflict: document that supSub=on changes `~x~` strikethrough→subscript
      (`~~x~~` unaffected); pin both states in tests.
- [x] `[toc]` extras: a real offscreen pointer click navigates in IR; the capture workaround is
      IR-only and resolves inside that IR surface, leaving WYSIWYG/SV/Preview and the outline panel
      on their existing handlers.

## Out of scope

- Definition lists (genuinely absent from Lute — not exposable), footnote config changes
  (already on), task 221's `[toc]` snippet entry (lands there).

## Verification

- L1: options/config/manifest/live-reinit units per flag, host-Lute state reset, write-back cache
  invalidation, and IR-only surface-local ToC navigation.
- L2: per feature — render, caret edit in IR, marker expand/collapse, round-trip, both flag states,
  genuine offscreen ToC navigation, and `<mark>` dark CSS.
- L3 real-VS-Code (mandatory): one spec with all three on — render plus pointer-activated mark,
  superscript, subscript and ToC-adjacent heading edits, exact host sync, and saved bytes.

## Completed implementation

The manifest now exposes a separate resource-scoped **Markdown Extensions** settings group. The
host emits strict default-off booleans; the webview applies them as the final authoritative
`preview.markdown` merge and treats changes as init-only so Vditor rebuilds its Lute instance.
`supSub` drives both `sup` and `sub`; enabled single tildes become subscripts while double tildes
remain strikethrough.

The reusable host Lute now receives all three effective flags before every prerender and
canonicalization. This prevents warm-open semantic drift and cross-folder state leakage. The
minimal-diff block cache and whole-document no-op cache observe a compact flag signature before
cache lookup, clear on an off/on transition, and use one options snapshot per comparison.

IR mark styling uses a translucent VS Code warning colour and inherited foreground for light,
dark, and high-contrast-safe behavior. A small capture-phase ToC bridge handles the measured IR
trusted-click selection failure before Vditor's bubble handler, but is scoped to an IR ToC and
resolves the target in that same IR surface so hidden sibling modes remain untouched.

## Verification evidence

- Final focused unit set passes **162/162**, covering manifest/config mapping, authoritative Vditor
  options, live re-init, host prerender resets, block and whole-document cache invalidation across
  off→on transitions, ToC surface isolation, and diagram-option exhaustiveness.
- Final Chromium passes **8/8** across IR/WYSIWYG/SV disabled/enabled render and exact round-trip,
  dark `<mark>` styling, a genuine offscreen pointer navigation, and caret-driven mark/sup/sub plus
  ToC-adjacent heading edits with IR marker expand/collapse.
- Final real-VS-Code acceptance passes **1/1** in **11.3 s** with `--retries=0`: all four constructs
  render, pointer activation precedes each inline edit, host text reaches the exact expected bytes,
  and save preserves them. Two earlier no-retry candidates exposed test-only marker-activation
  sequencing; the final spec waits on the editor's actual expanded-node readiness signal.
- Build, lint, webview and real-harness typechecks pass. Eager bundle/startup gates pass at
  **580/580 KiB** and **286/286 modules**; the one-KiB ceiling adjustment records the measured
  0.3-KiB outline-navigation glue and unchanged renderer/lazy-engine boundaries.
- Final elevated `npm run quality` passes brand, lint, jscpd, dependency boundaries, all audits,
  full coverage (**247 files / 3,573 tests**, 76.01% statements / 68.56% branches / 78.62%
  functions / 77.96% lines), and the 14-module ratchet. Only the pre-existing `yazl` knip residual
  remains. A first sandboxed attempt was superseded because child Git/Node processes and network
  audit calls were denied there.

Final review found no Critical or Important issues. Per queue policy, no FAST, full Chromium, or
full real-VS-Code suite was run.
