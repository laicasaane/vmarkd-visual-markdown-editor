# Task 530 — Make full Preview entry immediate, single-snapshot, and reusable

> **Status:** ✅ DONE 2026-08-31 · **Impact:** 🔴 high for large-document IR ↔ Preview switching ·
> **Origin:** Project Owner performance follow-up and real-VS-Code profiling, 2026-08-30 ·
> **Depends on:** Task 529's exact live-Markdown snapshot seam

**Goal:** Reduce first full-Preview entry for a realistic ~2,000-line mixed document from roughly
0.9–1.2 seconds to about 0.3–0.4 seconds on the measured machine, and make an unchanged
IR → Preview → IR → Preview toggle reuse the existing Preview DOM without Markdown serialization,
HTML parsing, DOM replacement, or diagram processing.

**Architecture:** Separate explicit full-Preview entry from debounced split-view refresh. Capture
Markdown once, render explicit entry immediately, and track whether the hidden Preview DOM is current
for the active editor content and render-affecting configuration. Reuse the existing pane when the
revision is current; otherwise run the existing Lute → morph → post-render pipeline once. Preserve
the 500 ms debounce for live `sv` Preview updates and keep every existing diagram/cache authority.

**Related:** [Task 187](done/187-sv-split-mode-polish.md) owns the 500 ms live Preview refresh and
block-level morph; [Task 365](done/365-d2-render-differs-between-ir-and-preview.md) and
[Task 366](done/366-per-engine-mode-parity-suite.md) own cross-pane diagram reuse/parity;
[Task 364](done/364-mode-switch-scroll-jump.md) owns Preview scroll preservation;
[Task 69](done/69-incremental-ir-serialize.md) owns the incremental IR authority. Do not regress or
duplicate those mechanisms.

## 1. Confirmed baseline and cost decomposition

A temporary real-VS-Code probe generated a 2,016-line, >100 KB document with 845 rendered
paragraphs, 44 lists, four tables, four TypeScript fences, and four Mermaid fences. Auto Wrap and
Preview Reflow were disabled. The document activated VMDE's large-document class; all four IR
Mermaid diagrams settled before Preview timing.

The final controlled run measured:

| scenario | synchronous entry | Preview ready | blocking | worst gap | IR serialize | `Md2HTML` |
|---|---:|---:|---:|---:|---:|---:|
| current | 179.6 ms | 932 ms | 402.6 ms | 205.0 ms | 2 / 174.6 ms | 1 / 113.8 ms |
| remove entry delay only | 139.2 ms | 426 ms | 388.6 ms | 187.3 ms | 2 / 134.6 ms | 1 / 81.0 ms |
| delay removed + one snapshot | 63.6 ms | 330 ms | 237.3 ms | 135.4 ms | 1 / 60.0 ms | 1 / 59.9 ms |
| unchanged Preview DOM reused | 0.6 ms handler | next-frame visible | no serialize/parse | — | 0 | 0 |

The exact timings are machine/load-sensitive; the call counts and fixed delay are the durable
mechanism evidence.

### 1.1 Duplicate synchronous Markdown serialization

Vditor's `src/ts/preview/index.ts` `Preview.render()` calls `getMarkdown(vditor)` once to test for an
empty document, then immediately calls it again to assign `markdownText`. In IR each call performs a
full `VditorIRDOM2Md`. VMDE's Task 83 patch changes the second source expression for soft/hard-break
identity but does not eliminate the first call.

### 1.2 Full-Preview entry pays a refresh debounce

`buildVditorOptions()` deliberately sets `preview.delay = 500` for live Preview refreshes. The same
Vditor toolbar handler is also used for an explicit full-Preview mode switch, so a user-initiated
read-only view waits the complete edit debounce even though no later input needs coalescing. Setting
only this delay to zero cut ready time from 932 ms to 426 ms but did not reduce blocking.

### 1.3 Unchanged hidden Preview is rendered again

The full Preview DOM stays mounted while hidden. On every later toolbar entry, Vditor serializes,
parses, and invokes `Preview.render()` anyway. Task 187's morph can retain identical live nodes after
that work, but it does not prevent the work. Suppressing render for a proven-current pane made the
toolbar handler sub-millisecond with zero serializer/parser calls.

### 1.4 Mermaid is already optimized

All four Preview Mermaid diagrams were same-session cache hits (`data-vmde-cache-hit="1"`) and reused
the settled IR SVG. Task 366 already synchronously paints native-engine hits before Vditor's deferred
renderer. Do not add a second Mermaid cache, renderer bypass, or mode-specific engine path.

## 2. Rejected Preview containment experiment

A candidate applied `content-visibility:auto` plus `contain-intrinsic-size:auto 40px` to read-only
Preview paragraphs/lists/tables. It reduced the combined prototype from 330 ms to 312 ms—within
noise—but made geometry unstable:

- correct non-contained Preview scroll height: 52,958 px;
- contained initial height: 45,814 px;
- contained height after a 30-frame scroll sweep: 49,056 px, still wrong;
- contained sweep: 30.4 ms maximum frame gap / seven frames over 20 ms, versus 24.9 ms / five for
  the non-contained single-snapshot candidate.

This trades a marginal entry number for scroll-thumb drift, mode-switch anchor risk, and incremental
layout during reading. The experiment is rejected and must not be implemented by this task. The
temporary probe and generated fixture were removed.

## 3. Product and performance contract

- Clicking the full Preview toolbar action, or opening with configured default mode `preview`, starts
  the first required render immediately. It does not wait the 500 ms split/edit refresh debounce.
- Live `sv` source editing retains the current 500 ms trailing Preview refresh. Task 187's morph and
  preview-preservation semantics remain unchanged.
- One required Preview render acquires Markdown at most once. The same exact string drives the empty
  check, comment masking, soft/hard-break handling, `Md2HTML`, and the render-revision key.
- In large IR documents, consume Task 529's exact incremental snapshot when it is valid. Fall back to
  Vditor's authoritative current serializer for small documents, WYSIWYG/SV, invalid cache state, or
  any unsupported path. Never trade source fidelity for speed.
- When the mounted Preview DOM is current for the same editor content and render-affecting options,
  entering Preview only shows it, restores/matches scroll, refreshes outline ownership as necessary,
  and leaves its DOM/engine instances intact. It performs zero Markdown serialization, `Md2HTML`,
  `innerHTML`/morph, syntax highlighting, callout redecoration, or diagram rendering.
- Any content change invalidates reuse: trusted input, structural/model commands, undo/redo, external
  host update, document replacement, reinitialization, or mode transaction that changes Markdown.
- Any option that can change rendered markup or renderer output invalidates reuse, including Preview
  Reflow, content/code/editor theme changes, and diagram/render settings. Optimize theme-only
  invalidation in a later task only if a separate proof covers every hidden Preview renderer.
- A failed/interrupted render never marks the Preview current. Stale or disconnected pane state
  falls back safely to the existing full render.
- Preserve exact Markdown bytes, explicit hard breaks, comments, callouts, highlighting, diagrams,
  outline, selection, scroll anchoring, focus, mode status, copy/link behavior, and Preview parity.
- Add no setting, command, dependency, renderer fork, or preview-only Markdown representation.

## 4. Design and implementation constraints

Expected implementation surface:

- `media-src/esbuild-shared.mjs` — anchor-asserted Vditor patches for single-snapshot
  `Preview.render()` and explicit immediate toolbar entry;
- `test/backend/vditor-source-patches.test.ts` — source-anchor, one-call, immediate-only, drift, and
  idempotence coverage;
- `media-src/src/bridge/edit-sync.ts` and session composition — consume Task 529's snapshot seam;
- create `media-src/src/editing/preview-state.ts` and `.test.ts` for Preview content/render revisions,
  successful-render commits, and the reuse decision; keep `preview-morph.ts` focused on raw DOM morph;
- `media-src/src/boot/finish-init.ts`, `main.ts`, and `message-router.ts` — lifecycle, content, theme,
  and configuration invalidation wiring;
- create `media-src/e2e/preview-performance-harness.ts`, `.html`, and `.spec.ts` for deterministic
  snapshot/delay/reuse counters, while keeping `preview-scroll.spec.ts` green; and
- create `test/vscode-e2e/preview-performance.spec.ts`, using Task 529's shared runtime fixture
  generator, for one-boot large-document acceptance.

### 4.1 One source getter

Patch the vendored TypeScript source through the existing composed `preview/index.ts` transform; do
not edit `node_modules` or generated media. Preserve patch ordering with Task 83 comment/soft-break,
Task 187 morph, and clipboard patches. The final transformed method must compute one
`markdownText`, then use that value for emptiness and rendering.

VMDE already exposes `window.__vmdePreviewMarkdown` for hard-break recovery when Preview Reflow is
active. Consolidate or extend that boundary rather than adding a competing global. The getter must
return exact authored hard breaks and must not reserialize after Task 529 already supplied an exact
snapshot.

### 4.2 Immediate explicit entry, debounced live refresh

Do not globally set `preview.delay = 0`; that would regress split-view typing by rebuilding Preview
on every pause/input event. Give `Preview.render()` an explicit immediate option or a narrowly scoped
VMDE hook, and patch only the full Preview toolbar entry/default-open route to request it. Existing
`setPreviewMode('both')` and edit-driven refresh continue using the configured 500 ms delay.

### 4.3 Current Preview revision

Track monotonically changing content and render-config generations for the current Vditor instance.
Record them only after the raw Preview morph and required synchronous post-render setup succeed.
Async diagrams may continue settling through their existing cache/render lifecycle; reuse must not
restart them merely because they settle after the raw revision was recorded.

The reuse fast path must preserve the same toolbar disabled/current classes and Vditor display
changes as a normal Preview toggle. It skips only `preview.render()`, not the surrounding UI state,
outline ownership, scroll snapshot/pin, accessibility, or focus behavior.

Do not use DOM hashes or serialize Markdown just to decide whether serialization can be skipped; that
would recreate the cost under a different name. Revision invalidation is the authority.

## 5. Test-first acceptance

> **For implementation agents:** use `superpowers:test-driven-development` before production
> changes, `superpowers:systematic-debugging` for unexpected behavior, and
> `superpowers:verification-before-completion` before commits or completion claims. Apply the
> repository's `vmde-lute-features`, `vmde-testing`, and `vmde-visual-debugging` skills.

### 5.1 Unit and source-patch coverage

Write RED tests before production changes. Cover:

- transformed `Preview.render()` contains one Markdown acquisition and one empty check over the
  acquired string;
- both `Md2HTML` branches consume the same string and Task 83's soft-break wrapper remains active;
- explicit full Preview uses immediate scheduling while split/live refresh retains 500 ms;
- every patch anchor fails loudly on version drift and the composed transform remains idempotence-
  guarded;
- current revision reuses the pane; content/config/instance/disconnection invalidates it;
- a failed render does not mark current;
- reuse performs no morph/post-render callbacks and preserves child-node identity;
- changed content renders once, then becomes reusable;
- hard breaks, comments, callouts, empty documents, and WYSIWYG/SV fallbacks use the correct source;
  and
- scroll/outline/focus lifecycle hooks still run on both reuse and full-render paths.

Inspect changed-line coverage for every revision, invalidation, fallback, immediate/debounced, and
error branch.

### 5.2 Chromium regression

Use a realistic multi-block document with prose, lists, tables, code, and several Mermaid blocks.
Assert:

- first explicit Preview starts before the 500 ms live-refresh floor;
- one source snapshot and one `Md2HTML` call populate the pane;
- all Mermaid blocks are same-session cache hits and no second native render starts;
- Preview → IR → Preview without an edit performs zero snapshot/parse/morph calls and keeps exact
  child-node/SVG/canvas identity;
- one IR edit invalidates reuse and refreshes the changed block once while Task 187 preserves
  unchanged live blocks;
- Preview Reflow/config invalidation produces the correct soft/hard-break result;
- split-view typing remains debounced at 500 ms; and
- scroll height, scroll position, outline, callouts, comments, highlighting, copy, and links remain
  correct.

### 5.3 Real-VS-Code acceptance

Share Task 529's runtime-generated large fixture or a common test helper; do not commit a 100+ KB
fixture. Use one VS Code boot where practical. Require at least 2,000 lines, 800 prose paragraphs, 40
lists, four tables, four ordinary code fences, and four Mermaid fences.

After IR and all four Mermaid renders settle:

1. instrument `VditorIRDOM2Md`, `Md2HTML`, Preview morph, and renderer/cache signals;
2. enter full Preview and assert one Markdown acquisition, one parse, four Mermaid cache hits, exact
   rendered structures, and no 500 ms scheduling floor;
3. return to IR and re-enter without editing; assert zero acquisition/parse/morph calls, identical
   Preview child nodes/diagram markup, and correct toolbar/outline/scroll state;
4. edit prose, wait for host sync, and re-enter; assert exactly one refresh with the edit present;
5. toggle Preview Reflow and a render-affecting configuration, asserting invalidation and hard-break
   fidelity;
6. save, close, reopen, and confirm exact source plus normal first-render fallback; and
7. run the final candidate with `--retries=0`.

Use call counts and the absence of the 500 ms floor as deterministic gates. Record elapsed/blocking
numbers for comparison, but keep thresholds generous enough for machine load. The pre-fix
implementation must fail on two serializer calls, delayed first mutation, and nonzero unchanged
toggle work.

## 6. Completion and verification

Use current `DEVELOPMENT.md` as command authority.

```bash
npx vitest run --config test/vitest.config.ts \
  test/backend/vditor-source-patches.test.ts \
  media-src/src/editing/preview-state.test.ts \
  media-src/src/editing/preview-morph.test.ts \
  media-src/src/bridge/edit-sync.test.ts
node build.mjs
npm run check:bundle-size
npm run check:startup-cost
npm run typecheck
npm run typecheck:strict
npm run typecheck:vscode-e2e
xvfb-run -a npm --prefix media-src run test:e2e -- \
  preview-performance.spec.ts preview-scroll.spec.ts
env -u ELECTRON_RUN_AS_NODE xvfb-run -a \
  npm --prefix test/vscode-e2e test -- \
  preview-performance.spec.ts mode-switch-render-reuse.spec.ts --retries=0
npm run quality
git diff --check
```

- [x] First explicit full Preview has no 500 ms debounce floor.
- [x] One required render acquires Markdown once and parses once.
- [x] An unchanged re-entry performs zero serialize/parse/morph/renderer work and preserves DOM
      identity.
- [x] Content/render changes invalidate once and produce a correct fresh Preview.
- [x] Split live Preview retains its 500 ms debounce and Task 187 morph behavior.
- [x] Mermaid/native/custom cache reuse and IR/WYSIWYG/Preview parity remain intact.
- [x] Source bytes, hard breaks, comments, callouts, highlighting, caret/focus, scroll, outline,
      copy/links, save/reopen, and mode state remain correct.
- [x] Changed-line coverage, typechecks, build, budgets, focused Chromium, no-retry real VS Code,
      quality, and diff checks pass with retries/residuals recorded honestly.
- [x] The final diff excludes generated output, `LOCAL_AGENT_TASK.md`, and unrelated user work.
- [x] Only after all acceptance items pass: mark this task done, move it to `tasks/done/`, add its
      completed entry to `tasks/README.md`, and create focused local implementation commit(s). Do not
      push.

## 6.1. Implementation outcome

- The composed `preview/index.ts` patch now acquires one `markdownText` before its empty check,
  preserves comment masking and Task 83 hard-break handling, uses that exact value in both Md2HTML
  branches, accepts an explicit immediate flag, and commits reuse only after synchronous
  `afterRender` succeeds. The full Preview toolbar alone requests immediate rendering; split/live
  refresh retains `preview.delay = 500`.
- `preview-state.ts` tracks content and render-config generations per inner Vditor instance. A
  current connected pane skips `Preview.render()` entirely; user input, exact/model edits, external
  DOM rebuilds, theme/config/CSS changes, and reflow changes invalidate it. Reinitialization creates
  a new authority, so failed/interrupted or cross-instance renders cannot be reused.
- The Preview snapshot hook consumes Task 529/69's exact incremental IR snapshot when available,
  with the existing hard-break-aware DOM fallback winning only when Preview Reflow requires it.
  Task 187 remains the raw DOM morph authority for actual refreshes.

## 6.2. Verification evidence

- Focused unit/source-patch set: 6 files / 245 tests passed. It covers one acquisition, both parse
  branches, immediate-only toolbar routing, drift failures, generation/instance/disconnection
  invalidation, successful commit, zero-callback reuse, edit sync, morph, and init wiring. Strict
  webview and real-VS-Code type checks passed.
- Focused Chromium `preview-performance.spec.ts --retries=0`: 1/1 passed. First explicit entry uses
  one snapshot/parse/morph before the 500 ms floor, unchanged re-entry uses zero work with identical
  child nodes, an IR edit refreshes once, and direct live refresh still waits about 500 ms. Focused
  coverage gives `preview-state.ts` 89.01% lines and `preview-morph.ts` 82.67%.
- Final real VS Code `preview-performance.spec.ts --retries=0`: 1/1 passed (9.5 s test / 10.8 s
  invocation) on a runtime-generated >2,000-line, >100 KB document with 920 prose blocks, 40 lists,
  four tables, four code fences, and four Mermaid fences. It proves one acquisition/parse, zero
  scheduled 500 ms floor, four cache-hit Mermaid SVGs, zero-work/identity reuse, one edited refresh,
  hard-break-aware reflow invalidation, exact save, close/reopen, and normal first-render fallback.
  One measured candidate reached first morph in 512.3 ms on this machine; the deterministic timer
  count proves that time is work, not the removed 500 ms delay.
- Existing Chromium Preview scroll passed 4/4. Existing real `mode-switch-render-reuse.spec.ts`
  passed 2/2 without retries, preserving cacheable/non-cacheable diagram parity, SVG/comment
  identity, and round-trip behavior.
- `node build.mjs` passed. Budgets passed at 552/555 KB, 283/283 eager modules, 29.4/34 KB largest
  module, and unchanged lazy-engine ceilings.
- Full coverage passed 241 files / 3,458 tests (74.99% statements / 67.78% branches / 77.53%
  functions / 76.86% lines); zero-coverage ratchet remained 15/15. Aggregate lint, brand, jscpd,
  dependency, audit, coverage, and ratchet stages passed; final knip retains only the unrelated
  `yazl` baseline. Earlier candidates exposed inner-vs-outer Vditor ownership and test-only
  focus/instrumentation/reopen issues; the final no-retry result includes each correction.

## 7. Out of scope and rejected approaches

- Preview `content-visibility` / intrinsic-size containment—the measured geometry and scrolling
  regression above rejects it.
- Globally removing the 500 ms Preview delay; split/live refresh keeps it.
- Re-rendering or separately caching Mermaid on mode switch; Tasks 365/366 already reuse it.
- Replacing Task 187's morph, Task 364's scroll mapping, or Task 517/521 outline ownership.
- Raising the 100 KB inline-init cap, shrinking the prerender teaser, sharing one webview, rewriting
  Lute/WASM, Worker rendering, or changing large-file streaming. Prior tasks measured or parked those
  as separate architectural decisions.
- WYSIWYG incremental serialization (Task 167), Auto Wrap/Unicode typing (Task 529), or unrelated
  renderer/theme performance.
- Treating a lower elapsed number alone as proof: serializer/parser/morph counts and semantic/DOM
  identity are the acceptance authorities.
