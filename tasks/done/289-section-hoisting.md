# Task 289 — Section hoisting / zoom-in (edit one section as the whole view)

**Status:** DONE 2026-08-29 · **Impact:** 🟡 med-high (long docs) · **Depends:** shares task 258's section engine · **Origin:** task 192 §12 (SiYuan/Logseq lineage)

## What it is & the effect

The block-family's core answer to long documents (SiYuan "focus", Logseq "zoom-in" — both
flagships of the ecosystem our engine comes from): open one section as if it were the
whole document, with a breadcrumb path to climb back out.

**Today in VMDE:** working on chapter 7 of a 400-block spec means the other 6 chapters
scroll, distract and slow you down; the only tools are the outline panel and (future)
folding.
**After:** "Hoist section" from the outline context menu / heading gutter → the editor
shows ONLY that heading's section, a breadcrumb bar (`Doc › 7. Deployment`) exits back to
the full view. The file on disk is always the whole document — hoisting is a pure view.

## Scope

- [x] Display-only mechanism: `display:none` on all top-level `data-block` nodes outside
      the hoisted section (section-range = task 258's engine — heading → next ≤-level
      heading; SHARED, build once). The full doc stays in the DOM → Lute serialization,
      IR spin, save and undo are architecturally untouched.
- [x] Breadcrumb bar to un-hoist (this is task 290's sticky breadcrumb in its "hoisted"
      state — one component, two duties).
- [x] Exemptions audit (the real work): outline panel maps only visible blocks (or marks
      hoist scope), scroll-sync/heading-anchors skip hidden blocks, render-cache viewport
      logic and streaming ignore them, find/reveal into a hidden block auto-unhoists.
- [x] Hoist heading SECTIONS v1 (list-subtree hoist = v2, the honest file-based mapping);
      sv/Preview out of scope v1; state per doc in webview state (not persisted to disk).

## Out of scope

- Editing scoped SAVE (always whole doc), multi-section hoist, Logseq block-level zoom
  (needs block granularity — revisit after 263).

## Verification

L1: reuse 258's section-range tests. L2: hoist → only section visible, `getValue()` is
the FULL doc byte-stable, edits inside hoist serialize correctly, un-hoist restores
scroll; outline/anchor exemptions asserted. L3 real-VS-Code (mandatory): hoist → type →
save → full doc on disk; find-in-page into a hidden block un-hoists.

## Implementation

- `nav/section-range.ts` is the shared hierarchical heading primitive: top-level block
  discovery, heading → next same/higher-level ownership, and ancestor paths for the breadcrumb.
- `nav/section-hoist.ts` keeps every document node in the live IR/WYS DOM and applies only
  serializer-invisible view attributes. State is held in the VS Code webview state with normalized
  heading identity plus an ordinal fallback for legacy state; external heading insertion relocates
  the same section instead of silently selecting a different one.
- The outline context menu and heading context target open one accessible `Hoist section` action.
  Hidden outline rows are `aria-hidden` and excluded from roving focus; Escape restores the
  invoking target, activation focuses the `Doc › …` exit breadcrumb, and normal exit restores the
  pre-hoist scroll position.
- Outline/host/same-document heading reveals and `Ctrl/Cmd+F` exit before targeting hidden
  content. Reveal exits deliberately skip the normal deferred scroll restoration so it cannot
  overwrite `scrollIntoView`.
- A shared scope-change event rebinds viewport projection, cache, and custom-render consumers.
  Fresh mode surfaces are scoped synchronously before render-cache/native deferred work; hidden
  native diagrams remain `data-processed`/deferred, hidden local hits are not painted or reported,
  and exit routes newly visible native/custom blocks through cache-first rendering. Full Preview
  suspends the IR/WYS-only scope and returning to edit reapplies it.
- The eager bundle ceiling moved 496→504 KB for the measured 502.0 KB final bundle; startup moved
  273→275 eager modules for the controller and shared range primitive. Metafile inspection found no
  renderer/engine leak; lazy-engine ceilings are unchanged.

## Verification evidence

- Focused Vitest (final): 8 files / 116 tests passed, including section ownership/state,
  asynchronous reveal-scroll ordering, focus lifecycle, outline rebinding, custom/native cache
  deferral/release, module-boundary totality, and finish-init ownership.
- Focused coverage plus final aggregate coverage: `section-hoist.ts` 90.83% lines and
  `section-range.ts` 96% lines; whole repository 75.87% statements / 68.95% branches / 77.96%
  functions / 77.52% lines; zero-coverage ratchet stayed 15/15.
- `node build.mjs`: passed on the final tree. Bundle/startup gates: main 502/504 KB, eager modules
  275/275, largest eager module 29.4/34 KB; lazy engine bundles remained within their ceilings.
- Focused Chromium `section-hoist.spec.ts`: 2/2 passed on the final tree. Covers IR and WYS edits,
  undo, exact `getValue()`, outline scoping/keyboard focus, Preview suspension/re-entry, hidden
  Mermaid deferral on a fresh WYS surface, heading reveal, and find exit.
- Focused real VS Code `section-hoist.spec.ts --retries=0`: 1/1 passed on the final tree. Covers
  outline hoist → type → host sync → undo/redo → disk save of the complete file, then find-triggered
  unhoist exposing a previously hidden target.
- `npm run typecheck:vscode-e2e`: passed. Independent review ended with no Critical or Important
  residuals after fixes for reveal ordering, viewport/cache/custom lifecycles, persistent identity,
  Preview suspension, diagram mode-rebuild ordering, and menu focus.
- Final permitted `npm run quality`: all eight stages passed; 224 test files / 3,134 tests. An
  earlier sandbox run hit audit DNS plus nested-process `EPERM` and exposed the missing module
  manifest entries; the permitted rerun proved audits/Markmap security. The next candidate exposed
  formatting and an unused re-export after moving shared constants; both were corrected before the
  final all-green run.
- Per the queue's minimal-test policy, no full Chromium, FAST, or full real-VS-Code suite was run
  for this follow-on task.

## 1.4.0 release-gate follow-up (2026-09-01)

Task 541 replaced the first Chromium journey's fixed 900 ms undo sleep with an explicit harness
baseline and an exact Vditor post-edit snapshot/stack readiness check. Coverage instrumentation had
delayed the constructor baseline, leaving one inert stack entry even though rendered text already
showed the edit. The revised oracle keeps the whole-document undo assertion unchanged and passes
the instrumented focused journey without retries; the final complete default and coverage results
are recorded by Task 541.
